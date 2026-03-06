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

_COMMON_USER_SETUP = """\
RUN mkdir -p /workspace \\
    && echo "Welcome to your Fluid container." > /workspace/hi.txt \\
    && chown -R developer:developer /workspace

USER developer
WORKDIR /workspace"""

_COMMON_LABELS = """\
LABEL fluid.managed="true"
LABEL fluid.rocm_version="{rocm_version}"

CMD ["/bin/bash"]"""

# --- Standard ROCm dev image (rocm/dev-*) ---

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

{user_setup}

ENV PATH="/opt/rocm/bin:${{PATH}}"
ENV LD_LIBRARY_PATH="/opt/rocm/lib:${{LD_LIBRARY_PATH}}"

{labels}
"""

# --- TheRock: installs ROCm from tarball into a clean Ubuntu base ---

THEROCK_DISTRO_BASES = {
    "ubuntu-22.04": "ubuntu:22.04",
    "ubuntu-24.04": "ubuntu:24.04",
}

THEROCK_GPU_FAMILIES = [
    "gfx110X-all",
    "gfx120X-all",
    "gfx94X-dcgpu",
    "gfx950-dcgpu",
    "gfx90X-dcgpu",
    "gfx103X-dgpu",
    "gfx101X-dgpu",
]

THEROCK_RELEASE_TYPES = ["nightlies", "prereleases", "stable"]

_THEROCK_TEMPLATE = """\
FROM {base_image}

ENV DEBIAN_FRONTEND=noninteractive
ENV ROCM_VERSION={rocm_version}

{packages}

{nodejs}

# Install ROCm from TheRock tarball
RUN curl -fsSL https://raw.githubusercontent.com/ROCm/TheRock/main/dockerfiles/install_rocm_tarball.sh \\
    | bash -s -- {rocm_version} {gpu_family} {release_type}

{claude_code}

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN useradd -m -s /bin/bash -G sudo,video,render developer \\
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/developer

{user_setup}

ENV ROCM_PATH=/opt/rocm
ENV PATH="/opt/rocm/bin:${{PATH}}"
ENV LD_LIBRARY_PATH="/opt/rocm/lib:${{LD_LIBRARY_PATH}}"

{labels}
"""


def generate_dockerfile(
    rocm_version: str,
    distro: str = "ubuntu-22.04",
    gpu_family: str = "",
    release_type: str = "nightlies",
) -> str:
    labels = _COMMON_LABELS.format(rocm_version=rocm_version)
    user_setup = _COMMON_USER_SETUP

    if distro.startswith("therock-"):
        therock_distro = distro.removeprefix("therock-")
        base_image = THEROCK_DISTRO_BASES.get(therock_distro, "ubuntu:24.04")
        return _THEROCK_TEMPLATE.format(
            base_image=base_image,
            rocm_version=rocm_version,
            gpu_family=gpu_family or "gfx110X-all",
            release_type=release_type,
            packages=_APT_PACKAGES,
            nodejs=_APT_NODEJS,
            claude_code=_CLAUDE_CODE_INSTALL,
            user_setup=user_setup,
            labels=labels,
        )

    is_rpm = "almalinux" in distro or "centos" in distro
    packages = _YUM_PACKAGES if is_rpm else _APT_PACKAGES
    nodejs = _YUM_NODEJS if is_rpm else _APT_NODEJS
    return DOCKERFILE_TEMPLATE.format(
        rocm_version=rocm_version,
        distro=distro,
        packages=packages,
        nodejs=nodejs,
        claude_code=_CLAUDE_CODE_INSTALL,
        user_setup=user_setup,
        labels=labels,
    )
