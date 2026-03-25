"""Dockerfile template management: parse ARGs, store and build custom templates."""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

from fluid.config import CONFIG_DIR, ensure_config_dir

TEMPLATES_DIR = CONFIG_DIR / "templates"


@dataclass
class ArgDefinition:
    """A single ARG declared in a Dockerfile."""

    name: str
    default: Optional[str] = None
    description: Optional[str] = None

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class DockerfileTemplate:
    """A user-imported Dockerfile template with its parsed ARGs."""

    id: str
    name: str
    content: str
    args: list[ArgDefinition] = field(default_factory=list)
    description: Optional[str] = None
    source: Optional[str] = None
    builtin: bool = False

    def to_dict(self) -> dict:
        d = asdict(self)
        d["args"] = [a.to_dict() for a in self.args]
        return {k: v for k, v in d.items() if v is not None}


def parse_dockerfile_args(content: str) -> list[ArgDefinition]:
    """Extract ARG instructions from Dockerfile content.

    Handles:
      - ARG NAME
      - ARG NAME=default_value
      - ARG NAME="quoted default"
      - Comments above ARGs are used as descriptions (# description)
    """
    args: list[ArgDefinition] = []
    lines = content.splitlines()
    pending_comment: Optional[str] = None

    for line in lines:
        stripped = line.strip()

        if stripped.startswith("#") and not stripped.startswith("#!"):
            comment_text = stripped.lstrip("#").strip()
            if comment_text:
                pending_comment = comment_text
            continue

        match = re.match(
            r'^ARG\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*(.*))?$',
            stripped,
            re.IGNORECASE,
        )
        if match:
            name = match.group(1)
            raw_default = match.group(2)
            default_val = None
            if raw_default is not None:
                default_val = raw_default.strip().strip('"').strip("'")

            args.append(ArgDefinition(
                name=name,
                default=default_val if default_val else None,
                description=pending_comment,
            ))
            pending_comment = None
        else:
            if not stripped or stripped.startswith("FROM"):
                pass
            else:
                pending_comment = None

    return args


def generate_from_template(
    template: DockerfileTemplate,
    arg_values: dict[str, str],
) -> str:
    """Render a Dockerfile template with the given ARG values.

    Produces a Dockerfile with build-arg-ready ARG declarations.
    The returned content is the raw Dockerfile; the arg_values
    are passed as --build-arg flags to `docker build`.
    """
    return template.content


_TAG_MAX_LEN = 50
_TAG_SAFE_RE = re.compile(r'[^a-zA-Z0-9._-]')
_TAG_COLON_RE = re.compile(r':')


def _sanitize_tag_part(s: str) -> str:
    return _TAG_SAFE_RE.sub("-", _TAG_COLON_RE.sub("-", s)).strip("-").lower()


def make_image_tag(
    template: DockerfileTemplate,
    arg_values: dict[str, str],
    prefix: str = "fluid",
) -> str:
    """Build a human-readable Docker image tag from a template and its arg values.

    Produces tags like::

        fluid:pytorch-rocm-rocm--6.4-torch--2.5
        fluid:fluid-base-base--ubuntu-22.04

    The tag portion (after the ``:``) is capped at 50 characters.
    Args are appended in declaration order until the budget runs out.

    The tag portion must never contain ``:``, as Docker references only
    allow a single colon separating repository from tag.
    """
    template_slug = _sanitize_tag_part(template.name)

    effective: list[tuple[str, str]] = []
    for arg in template.args:
        val = arg_values.get(arg.name) or arg.default or ""
        if val:
            short_name = _sanitize_tag_part(
                arg.name
                .replace("_VERSION", "")
                .replace("VERSION", "")
                .replace("_IMAGE", "")
                .replace("_TYPE", "")
                .replace("RELEASE", "rel")
            )
            effective.append((short_name, _sanitize_tag_part(val)))

    if not effective:
        tag = template_slug or "custom"
        return f"{prefix}:{tag[:_TAG_MAX_LEN]}"

    parts: list[str] = [template_slug] if template_slug else []
    used = len(template_slug)

    for short_name, val in effective:
        piece = f"{short_name}--{val}"
        needed = len(piece) + 1
        if used + needed > _TAG_MAX_LEN:
            break
        parts.append(piece)
        used += needed

    tag = "-".join(parts)
    # Safety: ensure no stray colons survive in the tag portion –
    # Docker only allows one colon (repo:tag).
    tag = tag.replace(":", "-")
    return f"{prefix}:{tag}"


# ---------------------------------------------------------------------------
# Built-in templates
# ---------------------------------------------------------------------------

_BUILTIN_BASE_ID = "builtin-fluid-base"
_BUILTIN_ROCM_ID = "builtin-fluid-rocm"

_BUILTIN_BASE_DOCKERFILE = """\
# Base OS image (e.g. ubuntu:22.04, ubuntu:24.04, debian:12, fedora:40)
ARG BASE_IMAGE=ubuntu:22.04

FROM ${BASE_IMAGE}

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    cmake \\
    git \\
    curl \\
    wget \\
    vim \\
    nano \\
    htop \\
    tmux \\
    python3 \\
    python3-pip \\
    python3-venv \\
    openssh-client \\
    sudo \\
    locales \\
    ca-certificates \\
    gnupg \\
    && rm -rf /var/lib/apt/lists/*

RUN locale-gen en_US.UTF-8

ENV NODE_VERSION=22
RUN ARCH=$(dpkg --print-architecture) \\
    && curl -fsSL https://nodejs.org/dist/latest-v${NODE_VERSION}.x/SHASUMS256.txt -o /tmp/SHASUMS256.txt \\
    && NODE_FULL=$(grep "linux-${ARCH}.tar.xz" /tmp/SHASUMS256.txt | awk '{print $2}' | head -1) \\
    && curl -fsSL "https://nodejs.org/dist/latest-v${NODE_VERSION}.x/${NODE_FULL}" -o /tmp/node.tar.xz \\
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \\
    && rm /tmp/node.tar.xz /tmp/SHASUMS256.txt

RUN npm install -g @anthropic-ai/claude-code

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN useradd -m -s /bin/bash -G sudo developer \\
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/developer

RUN mkdir -p /workspace \\
    && echo "Welcome to your Fluid container." > /workspace/hi.txt \\
    && chown -R developer:developer /workspace

USER developer
WORKDIR /workspace

LABEL fluid.managed="true"

CMD ["/bin/bash"]
"""

_BUILTIN_ROCM_DOCKERFILE = """\
# ROCm version (e.g. 6.3, 7.2, latest)
ARG ROCM_VERSION=latest
# Base distro (ubuntu-22.04, ubuntu-24.04)
ARG DISTRO=ubuntu-22.04

FROM rocm/dev-${DISTRO}:${ROCM_VERSION}

ENV DEBIAN_FRONTEND=noninteractive
ENV ROCM_VERSION=${ROCM_VERSION}

RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    cmake \\
    git \\
    curl \\
    wget \\
    vim \\
    nano \\
    htop \\
    tmux \\
    python3 \\
    python3-pip \\
    python3-venv \\
    openssh-client \\
    sudo \\
    locales \\
    ca-certificates \\
    gnupg \\
    && rm -rf /var/lib/apt/lists/*

RUN locale-gen en_US.UTF-8

ENV NODE_VERSION=22
RUN ARCH=$(dpkg --print-architecture) \\
    && curl -fsSL https://nodejs.org/dist/latest-v${NODE_VERSION}.x/SHASUMS256.txt -o /tmp/SHASUMS256.txt \\
    && NODE_FULL=$(grep "linux-${ARCH}.tar.xz" /tmp/SHASUMS256.txt | awk '{print $2}' | head -1) \\
    && curl -fsSL "https://nodejs.org/dist/latest-v${NODE_VERSION}.x/${NODE_FULL}" -o /tmp/node.tar.xz \\
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \\
    && rm /tmp/node.tar.xz /tmp/SHASUMS256.txt

RUN npm install -g @anthropic-ai/claude-code

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN useradd -m -s /bin/bash -G sudo,video,render developer \\
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/developer

RUN mkdir -p /workspace \\
    && echo "Welcome to your Fluid container." > /workspace/hi.txt \\
    && chown -R developer:developer /workspace

USER developer
WORKDIR /workspace

ENV PATH="/opt/rocm/bin:${PATH}"
ENV LD_LIBRARY_PATH="/opt/rocm/lib:${LD_LIBRARY_PATH}"

LABEL fluid.managed="true"
LABEL fluid.rocm_version="${ROCM_VERSION}"

CMD ["/bin/bash"]
"""


def _builtin_templates() -> list[DockerfileTemplate]:
    """Return the built-in Fluid templates (always available, not persisted)."""
    return [
        DockerfileTemplate(
            id=_BUILTIN_BASE_ID,
            name="Fluid Base",
            content=_BUILTIN_BASE_DOCKERFILE,
            args=parse_dockerfile_args(_BUILTIN_BASE_DOCKERFILE),
            description="Dev container from any OS image with Claude Code",
            source="built-in",
            builtin=True,
        ),
        DockerfileTemplate(
            id=_BUILTIN_ROCM_ID,
            name="Fluid ROCm",
            content=_BUILTIN_ROCM_DOCKERFILE,
            args=parse_dockerfile_args(_BUILTIN_ROCM_DOCKERFILE),
            description="ROCm dev container with Claude Code",
            source="built-in",
            builtin=True,
        ),
    ]


def _ensure_templates_dir() -> None:
    ensure_config_dir()
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)


def _templates_index_path() -> Path:
    return TEMPLATES_DIR / "index.json"


def _load_index() -> list[dict]:
    path = _templates_index_path()
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, TypeError):
        return []


def _save_index(entries: list[dict]) -> None:
    _ensure_templates_dir()
    _templates_index_path().write_text(json.dumps(entries, indent=2) + "\n")


def _template_file_path(template_id: str) -> Path:
    return TEMPLATES_DIR / f"{template_id}.dockerfile"


def save_template(template: DockerfileTemplate) -> DockerfileTemplate:
    """Persist a template to disk."""
    _ensure_templates_dir()

    _template_file_path(template.id).write_text(template.content)

    index = _load_index()
    index = [e for e in index if e.get("id") != template.id]
    meta = template.to_dict()
    del meta["content"]
    index.append(meta)
    _save_index(index)

    return template


def load_template(template_id: str) -> Optional[DockerfileTemplate]:
    """Load a single template by ID (checks built-ins first)."""
    for bt in _builtin_templates():
        if bt.id == template_id:
            return bt

    index = _load_index()
    meta = next((e for e in index if e.get("id") == template_id), None)
    if not meta:
        return None

    content_path = _template_file_path(template_id)
    if not content_path.exists():
        return None

    content = content_path.read_text()
    args = [ArgDefinition(**a) for a in meta.get("args", [])]

    return DockerfileTemplate(
        id=meta["id"],
        name=meta["name"],
        content=content,
        args=args,
        description=meta.get("description"),
        source=meta.get("source"),
    )


def list_templates() -> list[DockerfileTemplate]:
    """List all templates — built-ins first, then user-imported."""
    builtins = _builtin_templates()
    for bt in builtins:
        bt.content = ""

    index = _load_index()
    user_templates = []
    for meta in index:
        user_templates.append(DockerfileTemplate(
            id=meta["id"],
            name=meta["name"],
            content="",
            args=[ArgDefinition(**a) for a in meta.get("args", [])],
            description=meta.get("description"),
            source=meta.get("source"),
        ))
    return builtins + user_templates


def delete_template(template_id: str) -> bool:
    """Remove a template. Returns True if found and deleted."""
    index = _load_index()
    new_index = [e for e in index if e.get("id") != template_id]
    if len(new_index) == len(index):
        return False

    _save_index(new_index)

    content_path = _template_file_path(template_id)
    if content_path.exists():
        content_path.unlink()

    return True


def import_dockerfile(
    content: str,
    name: str,
    description: Optional[str] = None,
    source: Optional[str] = None,
) -> DockerfileTemplate:
    """Import a Dockerfile string as a template: parse its ARGs and persist it."""
    args = parse_dockerfile_args(content)
    template = DockerfileTemplate(
        id=str(uuid.uuid4()),
        name=name,
        content=content,
        args=args,
        description=description,
        source=source,
    )
    return save_template(template)
