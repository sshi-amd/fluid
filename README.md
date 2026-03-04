# fluid

CLI tool to manage ROCm Docker development containers. Quickly create, enter, and switch between containers running different ROCm versions — with built-in Cursor/VS Code and Claude Code integration.

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

## Commands

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

## Options

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

## How It Works

1. **`info`** auto-detects your GPU, driver version, and host ROCm install, then checks compatibility with the target ROCm version.
2. **`create`** builds a Docker image from `rocm/dev-<distro>:<version>` with common dev tools, Node.js, and Claude Code, then starts a container with GPU passthrough and your workspace mounted.
3. **`enter`** starts the container if stopped and drops you into a bash shell via `docker exec -it`.
4. **`code`** starts the container if stopped and opens Cursor or VS Code attached to it using the Remote Containers extension.
5. **`claude`** starts the container if stopped and launches the Claude Code CLI inside it via `docker exec -it`.
6. **`clean`** removes fluid-built Docker images, skipping any still in use by containers unless `--force` is passed.
7. State is stored in `~/.fluid/state.json` to track the current container and history.

## Container Environment

Each container includes:
- ROCm toolchain at `/opt/rocm`
- Build essentials (gcc, cmake, git)
- Python 3 with pip and venv
- Node.js (LTS) and npm
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI (`claude`)
- Your workspace mounted at `/workspace`
- GPU access via `/dev/kfd` and `/dev/dri` (with correct host GIDs)
- SSH keys and git config mounted from host (read-only)
- Non-root `developer` user with passwordless sudo
