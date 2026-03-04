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

from fluid.gui.pty_bridge import PtySession

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
def stop_container(name: str) -> dict:
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

    session_key = container.name
    if session_key in _active_sessions:
        _active_sessions[session_key].close()
        del _active_sessions[session_key]

    container.stop(timeout=5)
    return {"status": "stopped", "name": container.name}


@app.delete("/api/containers/{name}")
def remove_container(name: str) -> dict:
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

    session_key = real_name
    if session_key in _active_sessions:
        _active_sessions[session_key].close()
        del _active_sessions[session_key]

    if container.status == "running":
        container.stop(timeout=5)
    container.remove(force=True)

    state = load_state()
    state.remove(real_name)
    save_state(state)

    return {"status": "removed", "name": real_name}


@app.get("/api/config")
def get_config() -> dict:
    from fluid.config import DEFAULT_DISTRO, DEFAULT_ROCM_VERSION, SUPPORTED_DISTROS

    return {
        "default_rocm_version": DEFAULT_ROCM_VERSION,
        "default_distro": DEFAULT_DISTRO,
        "distros": list(SUPPORTED_DISTROS),
        "rocm_versions": [
            "6.4", "6.3.3", "6.3.2", "6.3.1", "6.3",
            "6.2.4", "6.2", "6.1.3", "6.1", "latest",
        ],
    }


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
            if msg.get("type") == "websocket.disconnect":
                break

            if "bytes" in msg and msg["bytes"]:
                session.write(msg["bytes"])
            elif "text" in msg and msg["text"]:
                text = msg["text"]
                try:
                    parsed = json.loads(text)
                    if parsed.get("type") == "resize":
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
    """Start the Fluid GUI as a native desktop window."""
    import threading

    import uvicorn
    import webview

    server_started = threading.Event()

    class _Server(uvicorn.Server):
        def startup(self, sockets=None):
            result = super().startup(sockets)
            server_started.set()
            return result

    def _run_server():
        config = uvicorn.Config(app, host=host, port=port, log_level="warning")
        server = _Server(config)
        server.run()

    server_thread = threading.Thread(target=_run_server, daemon=True)
    server_thread.start()
    server_started.wait(timeout=10)

    window = webview.create_window(
        "Fluid",
        url=f"http://{host}:{port}",
        width=1300,
        height=850,
        min_size=(900, 600),
        background_color="#0e0e10",
    )
    webview.start()
