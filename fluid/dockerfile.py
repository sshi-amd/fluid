"""Dockerfile generation for ROCm development containers."""

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

_YUM_PACKAGES = """\
RUN yum install -y \\
    gcc gcc-c++ make \\
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
    openssh-clients \\
    sudo \\
    glibc-langpack-en \\
    && yum clean all"""

_YUM_NODEJS = """\
RUN curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash - \\
    && yum install -y nodejs \\
    && yum clean all"""

_CLAUDE_CODE_INSTALL = """\
RUN npm install -g @anthropic-ai/claude-code"""

DOCKERFILE_TEMPLATE = """\
FROM rocm/dev-{distro}:{rocm_version}

ENV DEBIAN_FRONTEND=noninteractive
ENV ROCM_VERSION={rocm_version}

{packages}

{nodejs}

{claude_code}

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN useradd -m -s /bin/bash -G sudo,video,render developer \\
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/developer

RUN mkdir -p /workspace && echo "Welcome to your Fluid container." > /workspace/hi.txt && chown -R developer:developer /workspace

USER developer
WORKDIR /workspace

ENV PATH="/opt/rocm/bin:${{PATH}}"
ENV LD_LIBRARY_PATH="/opt/rocm/lib:${{LD_LIBRARY_PATH}}"

LABEL fluid.managed="true"
LABEL fluid.rocm_version="{rocm_version}"

CMD ["/bin/bash"]
"""


def generate_dockerfile(rocm_version: str, distro: str = "ubuntu-22.04") -> str:
    is_rpm = "almalinux" in distro or "centos" in distro
    packages = _YUM_PACKAGES if is_rpm else _APT_PACKAGES
    nodejs = _YUM_NODEJS if is_rpm else _APT_NODEJS
    return DOCKERFILE_TEMPLATE.format(
        rocm_version=rocm_version,
        distro=distro,
        packages=packages,
        nodejs=nodejs,
        claude_code=_CLAUDE_CODE_INSTALL,
    )
