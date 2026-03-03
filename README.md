# fluid

CLI/TUI tool to manage ROCm Docker development containers. Quickly create, enter, and switch between containers running different ROCm versions.

## Install

```bash
pip install -e .
```

Requires Docker to be installed and running with ROCm support (`/dev/kfd`, `/dev/dri`).

## Quick Start

```bash
# Check your GPU and driver compatibility
fluid info 6.3

# Create a container with ROCm 6.3
fluid create -v 6.3 -n myproject

# Enter the container
fluid enter -n myproject

# List all containers
fluid list

# Swap to a different container
fluid swap -n other-project

# Upgrade ROCm version (creates a new container with your workspace)
fluid up 6.4

# Downgrade ROCm version
fluid down 6.1

# Kill a container
fluid kill -n myproject

# Exit and stop the current container
fluid exit
```

## Commands

| Command | Description |
|---------|-------------|
| `create -v <version> -n <name>` | Create a new container. Version defaults to `6.3`, name auto-generated if omitted. |
| `enter -n <name>` | Attach to a container's shell. Defaults to current container. |
| `swap -n <name>` | Switch to a different container. |
| `up <version>` | Create a new container with a higher ROCm version, preserving workspace mount. |
| `down <version>` | Create a new container with a lower ROCm version, preserving workspace mount. |
| `kill -n <name>` | Stop and remove a container. Defaults to current container. |
| `exit` | Exit and stop the current container session. |
| `list` | Show all managed containers in a table. |
| `status` | Show current container status with detail cards. |
| `info [version]` | Show host GPU/driver info and check ROCm version compatibility. |
| `dashboard` | Interactive TUI dashboard. |

## Options

**`create`**
- `-v, --version` — ROCm version (default: `6.3`)
- `-n, --name` — Container name (default: `<version>-<timestamp>`)
- `-w, --workspace` — Host directory to mount at `/workspace` (default: current directory)
- `--force` — Create even if compatibility checks fail

## How It Works

1. **`info`** auto-detects your GPU, driver version, and host ROCm install, then checks compatibility with the target ROCm version.
2. **`create`** builds a Docker image from `rocm/dev-ubuntu-22.04:<version>` with common dev tools, runs compatibility checks, then starts a container with GPU passthrough and your workspace mounted.
3. **`enter`** / **`swap`** starts the container if stopped and drops you into a bash shell via `docker exec -it`.
4. **`up`** / **`down`** creates a new container at the target ROCm version with the same workspace mount — quick version switching without losing your files.
5. State is stored in `~/.fluid/state.json` to track the current container and history.

## Container Environment

Each container includes:
- ROCm toolchain at `/opt/rocm`
- Build essentials (gcc, cmake, git)
- Python 3 with pip
- Your workspace mounted at `/workspace`
- GPU access via `/dev/kfd` and `/dev/dri` (with correct host GIDs)
- Non-root `developer` user with sudo access
