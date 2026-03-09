"""FastAPI server for the Fluid GUI: REST endpoints + WebSocket terminal."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from fluid.gui.pty_bridge import HostPtySession, PtySession

logger = logging.getLogger("fluid.gui")

STATIC_DIR = Path(__file__).parent / "static"

_active_sessions: dict[str, PtySession] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    for session in _active_sessions.values():
        session.close()
    _active_sessions.clear()


app = FastAPI(title="Fluid GUI", lifespan=lifespan)


# --- Pydantic models ---

class CreateContainerRequest(BaseModel):
    name: Optional[str] = None
    rocm_version: str = "latest"
    distro: str = "ubuntu-22.04"
    workspace: Optional[str] = None
    gpu_family: Optional[str] = None
    release_type: str = "nightlies"


class ContainerInfo(BaseModel):
    name: str
    display_name: str
    status: str
    rocm_version: str
    workspace: str


# --- REST endpoints ---

@app.get("/api/containers")
def list_containers() -> list[ContainerInfo]:
    import docker
    from fluid.config import LABEL_MANAGED, LABEL_ROCM_VERSION

    try:
        client = docker.from_env()
    except Exception:
        return []

    containers = client.containers.list(
        all=True,
        filters={"label": f"{LABEL_MANAGED}=true"},
    )

    results = []
    for c in containers:
        mounts = c.attrs.get("Mounts", [])
        workspace = ""
        for m in mounts:
            if m.get("Destination") == "/workspace":
                workspace = m.get("Source", "")
                break

        results.append(ContainerInfo(
            name=c.name,
            display_name=c.name.removeprefix("fluid-"),
            status=c.status,
            rocm_version=c.labels.get(LABEL_ROCM_VERSION, "?"),
            workspace=workspace,
        ))

    return results


@app.post("/api/containers")
def create_container(req: CreateContainerRequest) -> ContainerInfo:
    from fluid.docker_manager import create_container_headless

    record = create_container_headless(
        rocm_version=req.rocm_version,
        name=req.name,
        workspace=req.workspace,
        distro=req.distro,
    )

    return ContainerInfo(
        name=record.name,
        display_name=record.display_name(),
        status="running",
        rocm_version=record.rocm_version,
        workspace=record.workspace_mount or "",
    )


@app.websocket("/ws/create")
async def create_container_ws(websocket: WebSocket):
    """WebSocket endpoint that streams container build/create progress.

    All blocking Docker calls run in a thread pool so the event loop
    stays responsive for other connections.
    """
    await websocket.accept()

    try:
        msg = await websocket.receive_json()
    except Exception:
        await websocket.close()
        return

    req_name = msg.get("name")
    rocm_version = msg.get("rocm_version", "latest")
    distro = msg.get("distro", "ubuntu-22.04")
    workspace = msg.get("workspace")
    gpu_family = msg.get("gpu_family", "")
    release_type = msg.get("release_type", "nightlies")

    from fluid.config import make_container_name
    container_name = make_container_name(req_name, rocm_version)
    display_name = container_name.removeprefix("fluid-")

    await websocket.send_json({
        "type": "init",
        "name": container_name,
        "display_name": display_name,
        "rocm_version": rocm_version,
    })

    import io
    import queue
    import threading
    from datetime import datetime, timezone

    import docker
    from docker.errors import ImageNotFound
    from fluid.config import (
        IMAGE_PREFIX,
        LABEL_MANAGED,
        LABEL_ROCM_VERSION,
        ContainerRecord,
        load_config,
        load_state,
        save_state,
    )
    from fluid.docker_manager import _resolve_device_gids
    from fluid.dockerfile import generate_dockerfile

    msg_queue: queue.Queue = queue.Queue()

    def _build_thread():
        """Run all blocking Docker operations in a background thread."""
        def emit(msg_dict):
            msg_queue.put(msg_dict)

        def log(text):
            emit({"type": "log", "text": text})

        try:
            client = docker.from_env()

            tag_suffix = f"{distro}-{rocm_version}"
            if gpu_family:
                tag_suffix += f"-{gpu_family}"
            image_tag = f"{IMAGE_PREFIX}:{tag_suffix}"
            try:
                client.images.get(image_tag)
                log(f"Using existing image {image_tag}\n")
            except ImageNotFound:
                log(f"Building image {image_tag}...\n")
                emit({"type": "phase", "phase": "building_image"})

                dockerfile_content = generate_dockerfile(
                    rocm_version, distro=distro,
                    gpu_family=gpu_family,
                    release_type=release_type)
                try:
                    stream = client.api.build(
                        fileobj=io.BytesIO(dockerfile_content.encode()),
                        tag=image_tag,
                        rm=True,
                        forcerm=True,
                        decode=True,
                    )
                    build_error = None
                    for chunk in stream:
                        if "stream" in chunk:
                            line = chunk["stream"].rstrip()
                            if line:
                                log(line + "\n")
                        elif "error" in chunk:
                            build_error = chunk["error"]
                            log(f"\n{build_error}\n")

                    if build_error:
                        emit({"type": "error",
                              "message": f"Image build failed: {build_error}"})
                        emit({"type": "_done"})
                        return

                except Exception as e:
                    log(f"\nBuild failed: {e}\n")
                    emit({"type": "error",
                          "message": f"Image build failed: {e}"})
                    emit({"type": "_done"})
                    return

                log(f"Image built: {image_tag}\n\n")

            emit({"type": "phase", "phase": "creating_container"})
            log(f"Creating container {container_name}...\n")

            try:
                client.containers.get(container_name)
                emit({"type": "error",
                      "message": f"Container {container_name} already exists"})
                emit({"type": "_done"})
                return
            except docker.errors.NotFound:
                pass

            config = load_config()
            volumes = {}
            if workspace:
                volumes[workspace] = {"bind": "/workspace", "mode": "rw"}

            home = Path.home()
            mounts = [
                (home / ".ssh", "/home/developer/.ssh", "ro"),
                (home / ".gitconfig", "/home/developer/.gitconfig", "ro"),
                (home / ".config" / "gh",
                 "/home/developer/.config/gh", "ro"),
            ]
            if not config.anthropic_api_key and not config.amd_gateway_key:
                mounts.append(
                    (home / ".claude", "/home/developer/.claude", "rw"))

            for src, dst, mode in mounts:
                if src.exists():
                    volumes[str(src)] = {"bind": dst, "mode": mode}

            host_gids = _resolve_device_gids()
            env = {"ROCM_VERSION": rocm_version}
            env.update(config.env_vars())

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
                environment=env,
            )

            container.start()

            from fluid.docker_manager import _inject_env_profile
            _inject_env_profile(container, config)

            log(f"Container {container_name} started.\n")

            record = ContainerRecord(
                name=container_name,
                rocm_version=rocm_version,
                created_at=datetime.now(timezone.utc).isoformat(),
                container_id=container.id,
                image_id=image_tag,
                workspace_mount=workspace or "",
            )
            state = load_state()
            state.add(record)
            state.current = container_name
            save_state(state)

            emit({
                "type": "done",
                "container": {
                    "name": container_name,
                    "display_name": display_name,
                    "status": "running",
                    "rocm_version": rocm_version,
                    "workspace": workspace or "",
                },
            })

        except Exception as e:
            log(f"\nError: {e}\n")
            emit({"type": "error", "message": str(e)})

        emit({"type": "_done"})

    thread = threading.Thread(target=_build_thread, daemon=True)
    thread.start()

    try:
        while True:
            try:
                item = msg_queue.get(block=False)
            except queue.Empty:
                await asyncio.sleep(0.1)
                if not thread.is_alive() and msg_queue.empty():
                    break
                continue

            if item.get("type") == "_done":
                break

            try:
                await websocket.send_json(item)
            except Exception:
                break
    except Exception:
        pass

    try:
        await websocket.close()
    except Exception:
        pass


@app.post("/api/containers/{name}/start")
def start_container(name: str) -> dict:
    import docker
    from fluid.config import CONTAINER_PREFIX

    client = docker.from_env()
    try:
        container = client.containers.get(name)
    except docker.errors.NotFound:
        try:
            container = client.containers.get(f"{CONTAINER_PREFIX}-{name}")
        except docker.errors.NotFound:
            return {"error": f"Container {name} not found"}

    container.start()
    return {"status": "started", "name": container.name}


@app.post("/api/containers/{name}/stop")
async def stop_container(name: str) -> dict:
    import docker
    from fluid.config import CONTAINER_PREFIX

    client = docker.from_env()
    try:
        container = client.containers.get(name)
    except docker.errors.NotFound:
        try:
            container = client.containers.get(f"{CONTAINER_PREFIX}-{name}")
        except docker.errors.NotFound:
            return {"error": f"Container {name} not found"}

    real_name = container.name
    for key in [k for k in _active_sessions if k.startswith(real_name)]:
        _active_sessions[key].close()
        del _active_sessions[key]

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: container.stop(timeout=5))
    return {"status": "stopped", "name": real_name}


@app.delete("/api/containers/{name}")
async def remove_container(name: str) -> dict:
    import docker
    from fluid.config import CONTAINER_PREFIX, load_state, save_state

    client = docker.from_env()
    try:
        container = client.containers.get(name)
    except docker.errors.NotFound:
        try:
            container = client.containers.get(f"{CONTAINER_PREFIX}-{name}")
        except docker.errors.NotFound:
            return {"error": f"Container {name} not found"}

    real_name = container.name

    for key in [k for k in _active_sessions if k.startswith(real_name)]:
        _active_sessions[key].close()
        del _active_sessions[key]

    state = load_state()
    state.remove(real_name)
    save_state(state)

    def _do_remove():
        if container.status == "running":
            container.stop(timeout=5)
        container.remove(force=True)

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _do_remove)

    return {"status": "removed", "name": real_name}


@app.get("/api/config")
def get_config() -> dict:
    from fluid.config import DEFAULT_DISTRO, DEFAULT_ROCM_VERSION, SUPPORTED_DISTROS
    from fluid.dockerfile import THEROCK_GPU_FAMILIES, THEROCK_RELEASE_TYPES

    return {
        "default_rocm_version": DEFAULT_ROCM_VERSION,
        "default_distro": DEFAULT_DISTRO,
        "distros": list(SUPPORTED_DISTROS),
        "rocm_versions": [
            "6.4", "6.3.3", "6.3.2", "6.3.1", "6.3",
            "6.2.4", "6.2", "6.1.3", "6.1", "latest",
        ],
        "therock_versions": [
            "7.12.0a20260304",
            "7.11.0rc2",
            "7.11.0rc1",
            "7.10.0rc2",
        ],
        "therock_gpu_families": THEROCK_GPU_FAMILIES,
        "therock_release_types": THEROCK_RELEASE_TYPES,
    }


@app.get("/api/images")
def list_images() -> list[dict]:
    import docker
    from fluid.config import LABEL_MANAGED, LABEL_ROCM_VERSION

    try:
        client = docker.from_env()
    except Exception:
        return []

    images = client.images.list(filters={"label": f"{LABEL_MANAGED}=true"})
    containers = client.containers.list(
        all=True, filters={"label": f"{LABEL_MANAGED}=true"})
    in_use_ids = {c.image.id for c in containers}

    results = []
    for img in images:
        tag = img.tags[0] if img.tags else img.short_id
        size_mb = round((img.attrs.get("Size", 0) or 0) / 1_000_000)
        created = img.attrs.get("Created", "")

        results.append({
            "id": img.id,
            "short_id": img.short_id.removeprefix("sha256:"),
            "tag": tag,
            "rocm_version": img.labels.get(LABEL_ROCM_VERSION, "?"),
            "size_mb": size_mb,
            "created": created,
            "in_use": img.id in in_use_ids,
        })

    return results


@app.delete("/api/images/{image_id:path}")
async def remove_image(image_id: str, force: bool = False) -> dict:
    import docker

    try:
        client = docker.from_env()
    except Exception:
        return {"error": "Cannot connect to Docker"}

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(
            None, lambda: client.images.remove(image_id, force=force))
    except Exception as e:
        return {"error": str(e)}

    return {"status": "removed", "id": image_id}


@app.post("/api/images/clean")
async def clean_images(force: bool = False) -> dict:
    import docker
    from fluid.config import LABEL_MANAGED

    try:
        client = docker.from_env()
    except Exception:
        return {"error": "Cannot connect to Docker"}

    images = client.images.list(filters={"label": f"{LABEL_MANAGED}=true"})
    if not images:
        return {"removed": 0}

    in_use_ids = set()
    if not force:
        containers = client.containers.list(
            all=True, filters={"label": f"{LABEL_MANAGED}=true"})
        in_use_ids = {c.image.id for c in containers}

    removed = 0
    loop = asyncio.get_event_loop()
    for img in images:
        if not force and img.id in in_use_ids:
            continue
        try:
            await loop.run_in_executor(
                None, lambda i=img: client.images.remove(i.id, force=force))
            removed += 1
        except Exception:
            pass

    return {"removed": removed}


class SettingsUpdate(BaseModel):
    anthropic_api_key: Optional[str] = None
    github_token: Optional[str] = None
    amd_gateway_key: Optional[str] = None
    anthropic_base_url: Optional[str] = None
    anthropic_model: Optional[str] = None


@app.get("/api/settings")
def get_settings() -> dict:
    from fluid.config import load_config

    config = load_config()

    def mask(val: Optional[str]) -> str:
        if not val:
            return ""
        if len(val) <= 8:
            return "*" * len(val)
        return val[:4] + "*" * (len(val) - 8) + val[-4:]

    return {
        "anthropic_api_key": mask(config.anthropic_api_key),
        "github_token": mask(config.github_token),
        "anthropic_api_key_set": bool(config.anthropic_api_key),
        "github_token_set": bool(config.github_token),
        "amd_gateway_key": mask(config.amd_gateway_key),
        "amd_gateway_key_set": bool(config.amd_gateway_key),
        "anthropic_base_url": config.anthropic_base_url or "",
        "anthropic_model": config.anthropic_model or "",
    }


@app.put("/api/settings")
def update_settings(req: SettingsUpdate) -> dict:
    from fluid.config import load_config, save_config

    config = load_config()

    if req.anthropic_api_key is not None:
        config.anthropic_api_key = req.anthropic_api_key or None
    if req.github_token is not None:
        config.github_token = req.github_token or None
    if req.amd_gateway_key is not None:
        config.amd_gateway_key = req.amd_gateway_key or None
    if req.anthropic_base_url is not None:
        config.anthropic_base_url = req.anthropic_base_url or None
    if req.anthropic_model is not None:
        config.anthropic_model = req.anthropic_model or None

    save_config(config)
    return {"status": "saved"}


# --- WebSocket terminal ---

@app.websocket("/ws/terminal/{name}")
async def terminal_websocket(websocket: WebSocket, name: str,
                             cmd: str = "/bin/bash"):
    await websocket.accept()

    import docker
    from fluid.config import CONTAINER_PREFIX, load_config

    client = docker.from_env()
    try:
        container = client.containers.get(name)
    except Exception:
        try:
            container = client.containers.get(f"{CONTAINER_PREFIX}-{name}")
            name = container.name
        except Exception:
            await websocket.close(code=4004, reason="Container not found")
            return

    if container.status != "running":
        await websocket.close(code=4003, reason="Container not running")
        return

    config = load_config()
    extra_env = config.env_vars()

    session = PtySession(name, command=cmd, extra_env=extra_env)
    try:
        session.spawn(cols=120, rows=30)
    except Exception as e:
        await websocket.close(code=4500, reason=str(e))
        return

    session_key = f"{name}:{id(session)}"
    _active_sessions[session_key] = session

    async def _read_pty():
        """Forward PTY output to the WebSocket."""
        while session.is_alive:
            try:
                data = await session.read()
                if data:
                    await websocket.send_bytes(data)
                else:
                    await asyncio.sleep(0.02)
            except Exception:
                break

    read_task = asyncio.create_task(_read_pty())

    try:
        while True:
            msg = await websocket.receive()
            if not isinstance(msg, dict):
                break
            if msg.get("type") == "websocket.disconnect":
                break

            if "bytes" in msg and msg["bytes"]:
                session.write(msg["bytes"])
            elif "text" in msg and msg["text"]:
                text = msg["text"]
                try:
                    parsed = json.loads(text)
                    if isinstance(parsed, dict) and parsed.get("type") == "resize":
                        session.resize(parsed.get("cols", 120),
                                       parsed.get("rows", 30))
                        continue
                except (json.JSONDecodeError, TypeError):
                    pass
                session.write(text.encode())
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        read_task.cancel()
        try:
            await read_task
        except asyncio.CancelledError:
            pass
        session.close()
        _active_sessions.pop(session_key, None)


@app.post("/api/containers/{name}/code")
def open_in_editor(name: str) -> dict:
    import shutil
    import subprocess

    import docker
    from fluid.config import CONTAINER_PREFIX

    client = docker.from_env()
    try:
        container = client.containers.get(name)
    except docker.errors.NotFound:
        try:
            container = client.containers.get(f"{CONTAINER_PREFIX}-{name}")
            name = container.name
        except docker.errors.NotFound:
            return {"error": f"Container {name} not found"}

    if container.status != "running":
        return {"error": "Container is not running"}

    editor = None
    for cmd in ("cursor", "code"):
        if shutil.which(cmd):
            editor = cmd
            break
    if not editor:
        return {"error": "Neither cursor nor code found on PATH"}

    workdir = container.attrs.get("Config", {}).get("WorkingDir", "") or "/home/developer"

    has_workspace_mount = any(
        m.get("Destination") == "/workspace"
        for m in container.attrs.get("Mounts", [])
    )
    if has_workspace_mount:
        workdir = "/workspace"
    else:
        try:
            exit_code, _ = container.exec_run("test -d /workspace")
            if exit_code == 0:
                workdir = "/workspace"
        except Exception:
            pass

    import json as _json
    config_json = _json.dumps({"containerId": container.id})
    hex_config = config_json.encode().hex()
    uri = f"vscode-remote://attached-container+{hex_config}{workdir}"
    subprocess.Popen(
        [editor, "--folder-uri", uri],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return {"status": "opened", "editor": editor, "name": container.name}


# --- WebSocket host terminal ---

@app.websocket("/ws/host-terminal")
async def host_terminal_websocket(websocket: WebSocket):
    await websocket.accept()

    session = HostPtySession()
    try:
        session.spawn(cols=120, rows=10)
    except Exception as e:
        await websocket.close(code=4500, reason=str(e))
        return

    session_key = f"__host__:{id(session)}"
    _active_sessions[session_key] = session

    async def _read_pty():
        while session.is_alive:
            try:
                data = await session.read()
                if data:
                    await websocket.send_bytes(data)
                else:
                    await asyncio.sleep(0.02)
            except Exception:
                break

    read_task = asyncio.create_task(_read_pty())

    try:
        while True:
            msg = await websocket.receive()
            if not isinstance(msg, dict):
                break
            if msg.get("type") == "websocket.disconnect":
                break

            if "bytes" in msg and msg["bytes"]:
                session.write(msg["bytes"])
            elif "text" in msg and msg["text"]:
                text = msg["text"]
                try:
                    parsed = json.loads(text)
                    if isinstance(parsed, dict) and parsed.get("type") == "resize":
                        session.resize(parsed.get("cols", 120),
                                       parsed.get("rows", 10))
                        continue
                except (json.JSONDecodeError, TypeError):
                    pass
                session.write(text.encode())
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        read_task.cancel()
        try:
            await read_task
        except asyncio.CancelledError:
            pass
        session.close()
        _active_sessions.pop(session_key, None)


# --- Static file serving ---

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
@app.get("/{path:path}")
def serve_spa(path: str = ""):
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"error": "Frontend not found. Ensure fluid/gui/static/index.html exists."}


def run(host: str = "127.0.0.1", port: int = 5000) -> None:
    """Start the Fluid backend server (Electron spawns this as a child process)."""
    import uvicorn

    uvicorn.run(app, host=host, port=port, log_level="warning")
