"""Docker operations for fluid containers."""

from __future__ import annotations

import io
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

import docker
from docker.errors import DockerException, ImageNotFound, NotFound
from docker.models.containers import Container
from rich.console import Console

from fluid.config import (
    CONTAINER_PREFIX,
    IMAGE_PREFIX,
    LABEL_MANAGED,
    LABEL_ROCM_VERSION,
    ContainerRecord,
    State,
    load_state,
    make_container_name,
    save_state,
)
from fluid.detect import (
    check_compatibility,
    detect_host,
    has_blocking_errors,
    print_host_info,
    print_warnings,
)
from fluid.dockerfile import generate_dockerfile

console = Console()


def get_client() -> docker.DockerClient:
    try:
        return docker.from_env()
    except DockerException:
        console.print(
            "[red]Error:[/red] Cannot connect to Docker daemon. "
            "Is Docker running?"
        )
        raise SystemExit(1)


def _resolve_device_gids() -> list[str]:
    """Get the numeric GIDs that own /dev/kfd and /dev/dri render nodes."""
    gids: set[int] = set()
    for dev in ["/dev/kfd", "/dev/dri/renderD128", "/dev/dri"]:
        p = Path(dev)
        if p.exists():
            try:
                gids.add(p.stat().st_gid)
            except OSError:
                pass
    try:
        import grp
        for name in ("video", "render"):
            try:
                gids.add(grp.getgrnam(name).gr_gid)
            except KeyError:
                pass
    except ImportError:
        pass
    return [str(g) for g in sorted(gids)]



def _find_container(client: docker.DockerClient, name: str) -> Optional[Container]:
    try:
        return client.containers.get(name)
    except NotFound:
        return None


def list_managed_containers(client: docker.DockerClient) -> list[Container]:
    return client.containers.list(
        all=True,
        filters={"label": f"{LABEL_MANAGED}=true"},
    )


def build_image(
    client: docker.DockerClient,
    rocm_version: str,
    tag: Optional[str] = None,
) -> str:
    tag = tag or f"{IMAGE_PREFIX}:{rocm_version}"
    dockerfile_content = generate_dockerfile(rocm_version)

    console.print(f"[cyan]Building image [bold]{tag}[/bold]...[/cyan]")

    try:
        image, build_logs = client.images.build(
            fileobj=io.BytesIO(dockerfile_content.encode()),
            tag=tag,
            rm=True,
            forcerm=True,
        )
    except docker.errors.BuildError as e:
        console.print(f"[red]Build failed:[/red]")
        for chunk in e.build_log:
            if "stream" in chunk:
                console.print(chunk["stream"].rstrip())
        raise SystemExit(1)

    for chunk in build_logs:
        if "stream" in chunk:
            line = chunk["stream"].rstrip()
            if line:
                console.print(f"  [dim]{line}[/dim]")

    console.print(f"[green]Image built:[/green] {tag}")
    return tag


def create_container(
    rocm_version: str,
    name: Optional[str] = None,
    workspace: Optional[str] = None,
    force: bool = False,
) -> ContainerRecord:
    client = get_client()
    state = load_state()

    host = detect_host()
    print_host_info(host)
    console.print()

    warnings = check_compatibility(host, rocm_version)
    print_warnings(warnings)
    console.print()

    if has_blocking_errors(warnings) and not force:
        console.print(
            "[red bold]Compatibility errors detected.[/red bold] "
            "Use [bold]--force[/bold] to create anyway."
        )
        raise SystemExit(1)

    container_name = make_container_name(name, rocm_version)

    existing = _find_container(client, container_name)
    if existing:
        console.print(
            f"[yellow]Container [bold]{container_name}[/bold] already exists.[/yellow]"
        )
        raise SystemExit(1)

    image_tag = f"{IMAGE_PREFIX}:{rocm_version}"
    try:
        client.images.get(image_tag)
        console.print(f"[dim]Using existing image {image_tag}[/dim]")
    except ImageNotFound:
        build_image(client, rocm_version, tag=image_tag)

    volumes = {}
    ws = workspace or os.getcwd()
    volumes[ws] = {"bind": "/workspace", "mode": "rw"}

    host_gids = _resolve_device_gids()

    console.print(
        f"[cyan]Creating container [bold]{container_name}[/bold] "
        f"(ROCm {rocm_version})...[/cyan]"
    )

    container = client.containers.create(
        image_tag,
        name=container_name,
        hostname=container_name,
        stdin_open=True,
        tty=True,
        detach=True,
        volumes=volumes,
        devices=["/dev/kfd", "/dev/dri"],
        group_add=host_gids,
        security_opt=["seccomp=unconfined"],
        labels={
            LABEL_MANAGED: "true",
            LABEL_ROCM_VERSION: rocm_version,
        },
        environment={
            "ROCM_VERSION": rocm_version,
        },
    )

    container.start()

    from datetime import datetime, timezone

    record = ContainerRecord(
        name=container_name,
        rocm_version=rocm_version,
        created_at=datetime.now(timezone.utc).isoformat(),
        container_id=container.id,
        image_id=image_tag,
        workspace_mount=ws,
    )
    state.add(record)
    state.current = container_name
    save_state(state)

    console.print(
        f"[green]Container [bold]{container_name}[/bold] created and started "
        f"(ROCm {rocm_version})[/green]"
    )
    return record


def _exec_into(name: str) -> int:
    """Run an interactive shell in the container and return its exit code."""
    result = subprocess.run(
        ["docker", "exec", "-it", name, "/bin/bash"],
    )
    return result.returncode


def _handle_post_exit(name: str) -> None:
    """Handle cleanup after leaving a container shell."""
    console.print(
        f"[dim]Left [bold]{name}[/bold] "
        f"(container still running).[/dim]"
    )


def enter_container(name: str) -> None:
    client = get_client()
    state = load_state()

    container = _find_container(client, name)
    if not container:
        full_name = f"{CONTAINER_PREFIX}-{name}"
        container = _find_container(client, full_name)
        if container:
            name = full_name

    if not container:
        console.print(f"[red]Container [bold]{name}[/bold] not found.[/red]")
        raise SystemExit(1)

    if container.status != "running":
        console.print(f"[cyan]Starting container [bold]{name}[/bold]...[/cyan]")
        container.start()

    state.current = name
    save_state(state)

    console.print(
        f"[green]Entering [bold]{name}[/bold] "
        f"(ROCm {container.labels.get(LABEL_ROCM_VERSION, '?')})...[/green]"
    )

    _exec_into(name)
    _handle_post_exit(name)


def kill_container(name: Optional[str] = None) -> None:
    client = get_client()
    state = load_state()

    if not name:
        if not state.current:
            console.print(
                "[red]No container specified and no current container set.[/red]"
            )
            raise SystemExit(1)
        name = state.current

    container = _find_container(client, name)
    if not container:
        full_name = f"{CONTAINER_PREFIX}-{name}"
        container = _find_container(client, full_name)
        if container:
            name = full_name

    if not container:
        console.print(f"[red]Container [bold]{name}[/bold] not found.[/red]")
        raise SystemExit(1)

    version = container.labels.get(LABEL_ROCM_VERSION, "?")

    if container.status == "running":
        console.print(f"[yellow]Stopping [bold]{name}[/bold]...[/yellow]")
        container.stop(timeout=5)

    console.print(f"[yellow]Removing [bold]{name}[/bold]...[/yellow]")
    container.remove(force=True)

    state.remove(name)
    save_state(state)

    console.print(
        f"[green]Container [bold]{name}[/bold] (ROCm {version}) removed.[/green]"
    )


def exit_container() -> None:
    state = load_state()
    if not state.current:
        console.print("[dim]No active container session.[/dim]")
        return

    name = state.current
    client = get_client()
    container = _find_container(client, name)

    state.current = None
    save_state(state)

    if container and container.status == "running":
        console.print(
            f"[cyan]Stopping [bold]{name}[/bold]...[/cyan]"
        )
        container.stop(timeout=10)

    console.print(f"[green]Exited [bold]{name}[/bold].[/green]")


def _find_editor() -> str:
    """Return the CLI name of Cursor or VS Code, whichever is available."""
    import shutil

    for cmd in ("cursor", "code"):
        if shutil.which(cmd):
            return cmd
    console.print(
        "[red]Neither [bold]cursor[/bold] nor [bold]code[/bold] CLI found on PATH.[/red]\n"
        "[dim]Install Cursor or VS Code and ensure the CLI is on your PATH.[/dim]"
    )
    raise SystemExit(1)


def open_in_editor(name: str) -> None:
    """Open Cursor / VS Code attached to a running fluid container."""
    client = get_client()
    state = load_state()

    container = _find_container(client, name)
    if not container:
        full_name = f"{CONTAINER_PREFIX}-{name}"
        container = _find_container(client, full_name)
        if container:
            name = full_name

    if not container:
        console.print(f"[red]Container [bold]{name}[/bold] not found.[/red]")
        raise SystemExit(1)

    if container.status != "running":
        console.print(f"[cyan]Starting container [bold]{name}[/bold]...[/cyan]")
        container.start()

    state.current = name
    save_state(state)

    editor = _find_editor()
    hex_name = name.encode().hex()
    uri = f"vscode-remote://attached-container+{hex_name}/workspace"

    console.print(
        f"[green]Opening [bold]{name}[/bold] in [bold]{editor}[/bold]...[/green]"
    )
    subprocess.Popen(
        [editor, "--folder-uri", uri],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
