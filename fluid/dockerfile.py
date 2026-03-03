"""Dockerfile generation for ROCm development containers."""

DOCKERFILE_TEMPLATE = """\
FROM rocm/dev-ubuntu-22.04:{rocm_version}

ENV DEBIAN_FRONTEND=noninteractive
ENV ROCM_VERSION={rocm_version}

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
    && rm -rf /var/lib/apt/lists/*

RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN useradd -m -s /bin/bash -G sudo,video,render developer \\
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/developer

USER developer
WORKDIR /home/developer

ENV PATH="/opt/rocm/bin:${{PATH}}"
ENV LD_LIBRARY_PATH="/opt/rocm/lib:${{LD_LIBRARY_PATH}}"

LABEL fluid.managed="true"
LABEL fluid.rocm_version="{rocm_version}"

CMD ["/bin/bash"]
"""


def generate_dockerfile(rocm_version: str) -> str:
    return DOCKERFILE_TEMPLATE.format(rocm_version=rocm_version)
