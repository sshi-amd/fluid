"""Configuration and state management for fluid containers."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

CONFIG_DIR = Path.home() / ".fluid"
STATE_FILE = CONFIG_DIR / "state.json"
CONFIG_FILE = CONFIG_DIR / "config.json"

CONTAINER_PREFIX = "fluid"
IMAGE_PREFIX = "fluid"
LABEL_MANAGED = "fluid.managed"
LABEL_ROCM_VERSION = "fluid.rocm_version"
DEFAULT_ROCM_VERSION = "latest"
DEFAULT_DISTRO = "ubuntu-22.04"
SUPPORTED_DISTROS = (
    "ubuntu-22.04",
    "ubuntu-24.04",
    "almalinux-8",
    "therock-ubuntu-24.04",
    "therock-ubuntu-22.04",
)


@dataclass
class ContainerRecord:
    name: str
    rocm_version: str
    created_at: str
    container_id: Optional[str] = None
    image_id: Optional[str] = None
    workspace_mount: Optional[str] = None
    custom_name: Optional[str] = None

    def display_name(self) -> str:
        return self.custom_name or self.name.removeprefix(f"{CONTAINER_PREFIX}-")


@dataclass
class State:
    current: Optional[str] = None
    containers: dict[str, ContainerRecord] = field(default_factory=dict)

    def add(self, record: ContainerRecord) -> None:
        self.containers[record.name] = record

    def remove(self, name: str) -> Optional[ContainerRecord]:
        rec = self.containers.pop(name, None)
        if self.current == name:
            self.current = None
        return rec

    def get(self, name: str) -> Optional[ContainerRecord]:
        return self.containers.get(name)


def ensure_config_dir() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def load_state() -> State:
    ensure_config_dir()
    if not STATE_FILE.exists():
        return State()
    try:
        data = json.loads(STATE_FILE.read_text())
        containers = {
            k: ContainerRecord(**v) for k, v in data.get("containers", {}).items()
        }
        return State(current=data.get("current"), containers=containers)
    except (json.JSONDecodeError, TypeError, KeyError):
        return State()


def save_state(state: State) -> None:
    ensure_config_dir()
    data = {
        "current": state.current,
        "containers": {k: asdict(v) for k, v in state.containers.items()},
    }
    STATE_FILE.write_text(json.dumps(data, indent=2) + "\n")


@dataclass
class FluidConfig:
    anthropic_api_key: Optional[str] = None
    github_token: Optional[str] = None
    amd_gateway_key: Optional[str] = None
    anthropic_base_url: Optional[str] = None
    anthropic_model: Optional[str] = None
    claude_skip_permissions: bool = False

    @property
    def uses_amd_gateway(self) -> bool:
        return bool(self.amd_gateway_key)

    def env_vars(self) -> dict[str, str]:
        """Return config values as env vars for container injection."""
        env = {}
        if self.amd_gateway_key:
            env["ANTHROPIC_API_KEY"] = "dummy"
            env["ANTHROPIC_BASE_URL"] = self.anthropic_base_url or "https://llm-api.amd.com/Anthropic"
            env["ANTHROPIC_CUSTOM_HEADERS"] = f"Ocp-Apim-Subscription-Key: {self.amd_gateway_key}"
            env["ANTHROPIC_MODEL"] = self.anthropic_model or "Claude-Sonnet-4.6"
            env["ANTHROPIC_DEFAULT_OPUS_MODEL"] = "Claude-Opus-4.6"
            env["ANTHROPIC_DEFAULT_SONNET_MODEL"] = "Claude-Sonnet-4.6"
            env["ANTHROPIC_DEFAULT_HAIKU_MODEL"] = "Claude-Haiku-4.5"
            env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1"
        elif self.anthropic_api_key:
            env["ANTHROPIC_API_KEY"] = self.anthropic_api_key
        if self.github_token:
            env["GITHUB_TOKEN"] = self.github_token
        return env


def load_config() -> FluidConfig:
    ensure_config_dir()
    if not CONFIG_FILE.exists():
        return FluidConfig()
    try:
        data = json.loads(CONFIG_FILE.read_text())
        return FluidConfig(
            anthropic_api_key=data.get("anthropic_api_key"),
            github_token=data.get("github_token"),
            amd_gateway_key=data.get("amd_gateway_key"),
            anthropic_base_url=data.get("anthropic_base_url"),
            anthropic_model=data.get("anthropic_model"),
            claude_skip_permissions=data.get("claude_skip_permissions", False),
        )
    except (json.JSONDecodeError, TypeError):
        return FluidConfig()


def save_config(config: FluidConfig) -> None:
    ensure_config_dir()
    data = {k: v for k, v in asdict(config).items() if v is not None}
    CONFIG_FILE.write_text(json.dumps(data, indent=2) + "\n")
    CONFIG_FILE.chmod(0o600)


def make_container_name(name: Optional[str], rocm_version: str) -> str:
    if name:
        if not name.startswith(f"{CONTAINER_PREFIX}-"):
            return f"{CONTAINER_PREFIX}-{name}"
        return name
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{CONTAINER_PREFIX}-{rocm_version}-{ts}"
