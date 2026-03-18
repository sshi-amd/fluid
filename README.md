# fluid

CLI and desktop GUI for managing ROCm Docker development containers. Quickly create, enter, and switch between containers running different ROCm versions — with built-in Cursor/VS Code and Claude Code integration.

## Install

```bash
pip install -e .
```

With the desktop GUI:

```bash
pip install -e ".[gui]"
```

Requires Docker to be installed and running with ROCm support (`/dev/kfd`, `/dev/dri`).

### Frontend (Electron)

The GUI frontend is an Electron + React app. To set up for development:

```bash
cd fluid/gui/frontend
npm install
npm run electron:dev
```

This starts both the Vite dev server and the Electron window. The FastAPI backend must be running separately:

```bash
fluid-gui
```

## GUI

Fluid includes a desktop application for managing containers visually. Each container gets a real interactive terminal powered by xterm.js — you can run Claude Code, a shell, or both side by side, and switch between them without losing your session.

```bash
fluid-gui
# or
python -m fluid --gui
```

### Features

- **Container dashboard** — grid view of all your Fluid containers with live status indicators
- **Interactive terminals** — full xterm.js terminals with ANSI color, cursor movement, and clipboard support (Ctrl+Shift+C/V)
- **Persistent sessions** — switch between Claude and Shell tabs without killing the other session
- **Per-session restart** — restart Shell or Claude individually without affecting the other
- **Claude Code integration** — launch Claude Code inside any container with one click
- **Skip permissions mode** — optionally run Claude Code with `--dangerously-skip-permissions` (configurable in Settings)
- **Editor integration** — open Cursor/VS Code attached to a container directly from the GUI
- **Host terminal** — resizable local terminal panel at the bottom of the window
- **Container management** — create new containers, start/stop, remove, or add existing ones to the dashboard
- **Settings page** — configure API keys, model settings, and Claude Code behavior from the GUI
- **Status indicators** — green (running), yellow pulsing (Claude active), red (waiting for input), gray (stopped)
- **Live sync** — containers killed or created from the CLI are automatically reflected in the GUI

### Architecture

The GUI runs as a FastAPI backend with an Electron + React frontend. The backend handles Docker management and terminal sessions, while the frontend renders interactive xterm.js terminals.

```
fluid-gui
  → FastAPI server (REST API + WebSocket terminals)
  → Electron window (React + xterm.js frontend)
  → PTY bridge (real docker exec sessions via pty.openpty)
```

### Terminal Implementation

Terminals use xterm.js v6 with `requestAnimationFrame` write batching. TUI applications like Claude Code send screen redraws as fragmented ANSI escape sequences over WebSocket — the batching collects all fragments within a single animation frame and writes them to xterm.js atomically, preventing flicker.

## CLI Quick Start

```bash
# Check your GPU and driver compatibility
fluid info 6.3

# Create a container with ROCm 6.3
fluid create -v 6.3 -n myproject

# Enter the container shell
fluid enter -n myproject

# Open Cursor/VS Code attached to the container
fluid code -n myproject

# Open Claude Code CLI in the container
fluid claude -n myproject

# List all containers
fluid list

# Kill a container
fluid kill -n myproject

# Kill all fluid containers
fluid kill --all

# Remove unused fluid Docker images
fluid clean

# Exit and stop the current container
fluid exit
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `create -v <version> -n <name>` | Create a new container. Version defaults to `latest`, name auto-generated if omitted. |
| `enter -n <name>` | Attach to a container's shell. Defaults to current container. |
| `code -n <name>` | Open Cursor/VS Code attached to a container. Defaults to current container. |
| `claude -n <name>` | Open Claude Code CLI inside a container. Defaults to current container. |
| `kill -n <name>` | Stop and remove a container. Use `--all` to remove all fluid containers. |
| `clean` | Remove Docker images built by fluid. Use `--force` to also remove images in use. |
| `exit` | Exit and stop the current container session. |
| `list` | Show all managed containers in a table. |
| `info [version]` | Show host GPU/driver info and check ROCm version compatibility. |
| `config` | Manage API keys and tokens (`--set anthropic-key`, `--set github-token`). |

## CLI Options

**`create`**
- `-v, --version` — ROCm version (default: `latest`)
- `-n, --name` — Container name (default: `<version>-<timestamp>`)
- `-w, --workspace` — Host directory to mount at `/workspace` (default: current directory)
- `-d, --distro` — Base distro: `ubuntu-22.04`, `ubuntu-24.04`, `almalinux-8` (default: `ubuntu-22.04`)
- `--force` — Create even if compatibility checks fail

**`enter`** / **`code`** / **`claude`**
- `-n, --name` — Container name (defaults to current container if omitted)

**`kill`**
- `-n, --name` — Container name (defaults to current container if omitted)
- `--all` — Kill all managed containers

**`clean`**
- `--force` — Also remove images still in use by existing containers

## Dependencies

### Python

Core:
- `typer` — CLI framework
- `rich` — terminal output formatting
- `docker` — Docker SDK for Python

GUI (install with `pip install -e ".[gui]"`):
- `fastapi` — REST API and WebSocket server
- `uvicorn` — ASGI server
- `websockets` — WebSocket protocol support

### Frontend (npm)

- `react` / `react-dom` — UI framework
- `@xterm/xterm` v6 — terminal emulator
- `@xterm/addon-fit` — auto-fit terminal to container
- `@tanstack/react-query` — data fetching and caching
- `electron` — native desktop window

## How It Works

1. **`info`** auto-detects your GPU, driver version, and host ROCm install, then checks compatibility with the target ROCm version.
2. **`create`** builds a Docker image from `rocm/dev-<distro>:<version>` with common dev tools, Node.js, and Claude Code, then starts a container with GPU passthrough and your workspace mounted.
3. **`enter`** starts the container if stopped and drops you into a bash shell via `docker exec -it`.
4. **`code`** starts the container if stopped and opens Cursor or VS Code attached to it using the Remote Containers extension.
5. **`claude`** starts the container if stopped and launches the Claude Code CLI inside it via `docker exec -it`.
6. **`clean`** removes fluid-built Docker images, skipping any still in use by containers unless `--force` is passed.
7. State is stored in `~/.fluid/state.json` to track the current container and history.
8. API keys and settings are stored in `~/.fluid/config.json` (permissions 600) and injected as environment variables into containers.

## Container Environment

Each container includes:
- ROCm toolchain at `/opt/rocm`
- Build essentials (gcc, cmake, git)
- Python 3 with pip and venv
- Node.js (LTS) and npm
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI (`claude`)
- `/workspace` directory (mounted from host if specified, otherwise container-local)
- GPU access via `/dev/kfd` and `/dev/dri` (with correct host GIDs)
- SSH keys and git config mounted from host (read-only)
- `~/.claude` directory shared with host (for Claude Code settings)
- Non-root `developer` user with passwordless sudo
