"""Dockerfile generation for development containers."""

_APT_PACKAGES = """\
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

RUN locale-gen en_US.UTF-8"""

_APT_NODEJS = """\
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \\
    && apt-get install -y nodejs \\
    && rm -rf /var/lib/apt/lists/*"""

_CLAUDE_CODE_INSTALL = """\
RUN npm install -g @anthropic-ai/claude-code"""

_COMMON_USER_SETUP = """\
RUN mkdir -p /workspace \\
    && echo "Welcome to your Fluid container." > /workspace/hi.txt \\
    && chown -R developer:developer /workspace

USER developer
WORKDIR /workspace"""

_COMMON_LABELS = """\
LABEL fluid.managed="true"

CMD ["/bin/bash"]"""

# --- Plain Ubuntu dev container ---

_PLAIN_DISTRO_BASES = {
    "ubuntu-22.04": "ubuntu:22.04",
    "ubuntu-24.04": "ubuntu:24.04",
}

PLAIN_DOCKERFILE_TEMPLATE = """\
FROM {base_image}

ENV DEBIAN_FRONTEND=noninteractive

{packages}

{nodejs}

{claude_code}

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN useradd -m -s /bin/bash -G sudo developer \\
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/developer

{user_setup}

{labels}
"""


def generate_dockerfile(distro: str = "ubuntu-22.04") -> str:
    base_image = _PLAIN_DISTRO_BASES.get(distro, "ubuntu:22.04")
    return PLAIN_DOCKERFILE_TEMPLATE.format(
        base_image=base_image,
        packages=_APT_PACKAGES,
        nodejs=_APT_NODEJS,
        claude_code=_CLAUDE_CODE_INSTALL,
        user_setup=_COMMON_USER_SETUP,
        labels=_COMMON_LABELS,
    )
