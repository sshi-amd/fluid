"""CLI entry point for fluid."""

from __future__ import annotations

import os
import warnings

if os.environ.get("_FLUID_COMPLETE"):
    warnings.filterwarnings("ignore")

from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from fluid.config import (
    CONTAINER_PREFIX,
    DEFAULT_DISTRO,
    LABEL_MANAGED,
    SUPPORTED_DISTROS,
    load_config,
    load_state,
    save_config,
)

app = typer.Typer(
    name="fluid",
    help="Manage Docker development containers with Claude Code.",
    no_args_is_help=True,
    rich_markup_mode="rich",
)
console = Console()


def _complete_container_name(incomplete: str) -> list[str]:
    """Return managed container names matching the incomplete input."""
    try:
        from fluid.docker_manager import get_client, list_managed_containers

        client = get_client()
        containers = list_managed_containers(client)
        names = [c.name.removeprefix(f"{CONTAINER_PREFIX}-") for c in containers]
        return [n for n in names if n.startswith(incomplete)]
    except Exception:
        return []


@app.command()
def create(
    name: Optional[str] = typer.Option(
        None,
        "-n",
        "--name",
        help="Container name. Defaults to fluid-<timestamp>.",
    ),
    workspace: Optional[str] = typer.Option(
        None,
        "-w",
        "--workspace",
        help="Host directory to mount at /workspace. Defaults to cwd.",
    ),
    distro: str = typer.Option(
        DEFAULT_DISTRO,
        "-d",
        "--distro",
        help=f"Base distro ({', '.join(SUPPORTED_DISTROS)}).",
    ),
) -> None:
    """Create a new development container."""
    from fluid.docker_manager import create_container

    if distro not in SUPPORTED_DISTROS:
        console.print(
            f"[red]Unknown distro [bold]{distro}[/bold]. "
            f"Supported: {', '.join(SUPPORTED_DISTROS)}[/red]"
        )
        raise typer.Exit(1)

    create_container(name=name, workspace=workspace, distro=distro)


@app.command()
def enter(
    name: Optional[str] = typer.Option(
        None,
        "-n",
        "--name",
        help="Container name to enter. Defaults to current container.",
        autocompletion=_complete_container_name,
    ),
) -> None:
    """Enter (attach to) a ROCm development container."""
    from fluid.docker_manager import enter_container

    if not name:
        state = load_state()
        if not state.current:
            console.print(
                "[red]No container specified and no current container. "
                "Use [bold]fluid create[/bold] first.[/red]"
            )
            raise typer.Exit(1)
        name = state.current

    enter_container(name)


@app.command()
def code(
    name: Optional[str] = typer.Option(
        None,
        "-n",
        "--name",
        help="Container to open. Defaults to current container.",
        autocompletion=_complete_container_name,
    ),
) -> None:
    """Open Cursor/VS Code attached to a container."""
    from fluid.docker_manager import open_in_editor

    if not name:
        state = load_state()
        if not state.current:
            console.print(
                "[red]No container specified and no current container. "
                "Use [bold]fluid create[/bold] first.[/red]"
            )
            raise typer.Exit(1)
        name = state.current

    open_in_editor(name)


@app.command()
def claude(
    name: Optional[str] = typer.Option(
        None,
        "-n",
        "--name",
        help="Container to open Claude Code in. Defaults to current container.",
        autocompletion=_complete_container_name,
    ),
) -> None:
    """Open Claude Code CLI attached to a container."""
    from fluid.docker_manager import open_claude_code

    if not name:
        state = load_state()
        if not state.current:
            console.print(
                "[red]No container specified and no current container. "
                "Use [bold]fluid create[/bold] first.[/red]"
            )
            raise typer.Exit(1)
        name = state.current

    open_claude_code(name)


@app.command()
def kill(
    name: Optional[str] = typer.Option(
        None,
        "-n",
        "--name",
        help="Container to kill. Defaults to current container.",
        autocompletion=_complete_container_name,
    ),
    all_containers: bool = typer.Option(
        False,
        "--all",
        help="Kill all managed containers.",
    ),
) -> None:
    """Stop and remove a ROCm development container."""
    from fluid.docker_manager import kill_all_containers, kill_container

    if all_containers:
        kill_all_containers()
    else:
        kill_container(name)


@app.command()
def clean(
    force: bool = typer.Option(
        False,
        "--force",
        help="Also remove images still in use by containers.",
    ),
) -> None:
    """Remove Docker images built by fluid."""
    from fluid.docker_manager import remove_images

    remove_images(force=force)


def _mask(value: str) -> str:
    if len(value) <= 8:
        return "*" * len(value)
    return value[:4] + "*" * (len(value) - 8) + value[-4:]


_CONFIG_KEYS = {
    "anthropic-key": "anthropic_api_key",
    "github-token": "github_token",
}


@app.command()
def config(
    show: bool = typer.Option(
        False, "--show", help="Show current config values (masked)."
    ),
    set_key: Optional[str] = typer.Option(
        None,
        "--set",
        help=f"Key to set ({', '.join(_CONFIG_KEYS)}).",
    ),
    value: Optional[str] = typer.Option(
        None,
        "--value",
        help="Value for the key being set.",
    ),
    unset: Optional[str] = typer.Option(
        None,
        "--unset",
        help=f"Key to clear ({', '.join(_CONFIG_KEYS)}).",
    ),
) -> None:
    """View or update fluid auth config (API keys, tokens)."""
    cfg = load_config()

    if set_key:
        if set_key not in _CONFIG_KEYS:
            console.print(
                f"[red]Unknown key [bold]{set_key}[/bold]. "
                f"Valid keys: {', '.join(_CONFIG_KEYS)}[/red]"
            )
            raise typer.Exit(1)
        if not value:
            console.print("[red]Provide [bold]--value[/bold] when using --set.[/red]")
            raise typer.Exit(1)
        setattr(cfg, _CONFIG_KEYS[set_key], value)
        save_config(cfg)
        console.print(f"[green]Set [bold]{set_key}[/bold].[/green]")
        return

    if unset:
        if unset not in _CONFIG_KEYS:
            console.print(
                f"[red]Unknown key [bold]{unset}[/bold]. "
                f"Valid keys: {', '.join(_CONFIG_KEYS)}[/red]"
            )
            raise typer.Exit(1)
        setattr(cfg, _CONFIG_KEYS[unset], None)
        save_config(cfg)
        console.print(f"[green]Cleared [bold]{unset}[/bold].[/green]")
        return

    table = Table(
        title="Fluid Config",
        title_style="bold cyan",
        border_style="dim",
    )
    table.add_column("Key", style="bold")
    table.add_column("Value")

    for display_key, attr in _CONFIG_KEYS.items():
        val = getattr(cfg, attr)
        if val:
            table.add_row(display_key, _mask(val))
        else:
            table.add_row(display_key, "[dim]not set[/dim]")

    from pathlib import Path

    home = Path.home()
    table.add_row("", "")
    table.add_row(
        "~/.claude",
        "[green]found (will mount)[/green]"
        if (home / ".claude").is_dir()
        else "[dim]not found[/dim]",
    )
    table.add_row(
        "~/.config/gh",
        "[green]found (will mount)[/green]"
        if (home / ".config" / "gh").is_dir()
        else "[dim]not found[/dim]",
    )
    table.add_row(
        "~/.ssh",
        "[green]found (will mount)[/green]"
        if (home / ".ssh").is_dir()
        else "[dim]not found[/dim]",
    )
    table.add_row(
        "~/.gitconfig",
        "[green]found (will mount)[/green]"
        if (home / ".gitconfig").is_file()
        else "[dim]not found[/dim]",
    )

    console.print()
    console.print(table)
    console.print()


@app.command(name="exit")
def exit_cmd() -> None:
    """Exit the current container session (stops the container)."""
    from fluid.docker_manager import exit_container

    exit_container()


@app.command(name="list")
def list_cmd() -> None:
    """List all managed ROCm development containers."""
    from fluid.docker_manager import get_client, list_managed_containers

    client = get_client()
    containers = list_managed_containers(client)
    state = load_state()

    if not containers:
        console.print("[dim]No fluid containers found.[/dim]")
        console.print(
            "[dim]Use [bold]fluid create -v <version>[/bold] to get started.[/dim]"
        )
        return

    table = Table(
        title="Fluid Containers",
        title_style="bold cyan",
        border_style="dim",
        show_lines=True,
    )
    table.add_column("Name", style="bold")
    table.add_column("Status", justify="center")
    table.add_column("Active", justify="center")
    table.add_column("Image")

    for c in sorted(containers, key=lambda x: x.name):
        status = c.status
        is_current = state.current == c.name
        status_style = "green" if status == "running" else "yellow"
        active_mark = "[green bold]●[/green bold]" if is_current else "[dim]○[/dim]"
        display_name = c.name.removeprefix(f"{CONTAINER_PREFIX}-")

        table.add_row(
            display_name,
            f"[{status_style}]{status}[/{status_style}]",
            active_mark,
            c.image.tags[0] if c.image.tags else str(c.image.id)[:12],
        )

    console.print()
    console.print(table)
    console.print()


@app.command()
def info(
    version: Optional[str] = typer.Argument(
        None,
        help="ROCm version to check compatibility for (optional).",
    ),
) -> None:
    """Show host GPU/driver info and check ROCm version compatibility."""
    from fluid.detect import (
        check_compatibility,
        detect_host,
        print_host_info,
        print_warnings,
    )

    host = detect_host()
    print_host_info(host)
    console.print()

    if version:
        console.print(f"[bold]Compatibility check for ROCm {version}:[/bold]")
        warnings = check_compatibility(host, version)
        print_warnings(warnings)
    else:
        console.print(
            "[dim]Tip: run [bold]fluid info <version>[/bold] "
            "to check compatibility with a specific ROCm version.[/dim]"
        )
    console.print()


if __name__ == "__main__":
    app()
