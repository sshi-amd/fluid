"""Auto-detect host GPU hardware, drivers, and ROCm compatibility."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

GFX_MARKETING_NAMES: dict[str, str] = {
    "gfx900": "Vega 10 (MI25, Vega 56/64)",
    "gfx906": "Vega 20 (MI50/60, Radeon VII)",
    "gfx908": "CDNA (MI100)",
    "gfx90a": "CDNA2 (MI200 series)",
    "gfx940": "CDNA3 (MI300A)",
    "gfx941": "CDNA3 (MI300A)",
    "gfx942": "CDNA3 (MI300X)",
    "gfx1010": "RDNA1 (RX 5600/5700)",
    "gfx1012": "RDNA1 (RX 5500/5300)",
    "gfx1030": "RDNA2 (RX 6800/6900)",
    "gfx1031": "RDNA2 (RX 6700 XT)",
    "gfx1100": "RDNA3 (RX 7900 XTX/XT)",
    "gfx1101": "RDNA3 (RX 7700/7800)",
    "gfx1102": "RDNA3 (RX 7600)",
    "gfx1150": "RDNA3.5 (Strix Point)",
    "gfx1200": "RDNA4 (RX 9070)",
    "gfx1201": "RDNA4 (RX 9060)",
}

ROCM_GFX_SUPPORT: dict[str, set[str]] = {
    "7": {
        "gfx900", "gfx906", "gfx908", "gfx90a",
        "gfx940", "gfx941", "gfx942",
        "gfx1010", "gfx1012", "gfx1030", "gfx1031",
        "gfx1100", "gfx1101", "gfx1102",
        "gfx1150", "gfx1200", "gfx1201",
    },
    "6.3": {
        "gfx900", "gfx906", "gfx908", "gfx90a",
        "gfx940", "gfx941", "gfx942",
        "gfx1010", "gfx1012", "gfx1030", "gfx1031",
        "gfx1100", "gfx1101", "gfx1102",
    },
    "6.2": {
        "gfx900", "gfx906", "gfx908", "gfx90a",
        "gfx940", "gfx941", "gfx942",
        "gfx1010", "gfx1012", "gfx1030", "gfx1031",
        "gfx1100", "gfx1101", "gfx1102",
    },
    "6.1": {
        "gfx900", "gfx906", "gfx908", "gfx90a",
        "gfx940", "gfx941", "gfx942",
        "gfx1010", "gfx1012", "gfx1030",
        "gfx1100", "gfx1101", "gfx1102",
    },
    "6.0": {
        "gfx900", "gfx906", "gfx908", "gfx90a",
        "gfx940", "gfx941", "gfx942",
        "gfx1010", "gfx1012", "gfx1030",
        "gfx1100", "gfx1101", "gfx1102",
    },
    "5.7": {
        "gfx900", "gfx906", "gfx908", "gfx90a",
        "gfx1010", "gfx1012", "gfx1030",
        "gfx1100",
    },
    "5.6": {
        "gfx900", "gfx906", "gfx908", "gfx90a",
        "gfx1010", "gfx1012", "gfx1030",
        "gfx1100",
    },
    "5": {
        "gfx900", "gfx906", "gfx908", "gfx90a",
        "gfx1010", "gfx1012", "gfx1030",
    },
}

ROCM_MIN_DRIVER: dict[str, str] = {
    "7.2": "6.13.0",
    "7.1": "6.12.0",
    "7.0": "6.10.0",
    "6.3": "6.8.0",
    "6.2": "6.7.0",
    "6.1": "6.5.0",
    "6.0": "6.3.0",
    "5.7": "6.1.0",
    "5.6": "5.19.0",
    "5.5": "5.18.0",
    "5.4": "5.17.0",
}


def _parse_version(v: str) -> tuple[int, ...]:
    """Parse a dotted version string into a tuple for comparison."""
    parts = []
    for p in v.split("."):
        m = re.match(r"(\d+)", p)
        if m:
            parts.append(int(m.group(1)))
    return tuple(parts) if parts else (0,)


def _version_gte(a: str, b: str) -> bool:
    return _parse_version(a) >= _parse_version(b)


@dataclass
class GpuInfo:
    name: str
    marketing_name: str
    gfx_target: str
    vendor: str = "AMD"


@dataclass
class HostInfo:
    driver_version: Optional[str] = None
    rocm_version: Optional[str] = None
    gpus: list[GpuInfo] = field(default_factory=list)
    has_kfd: bool = False
    dri_devices: list[str] = field(default_factory=list)

    @property
    def gfx_targets(self) -> set[str]:
        return {g.gfx_target for g in self.gpus}

    @property
    def gpu_summary(self) -> str:
        if not self.gpus:
            return "No AMD GPUs detected"
        names = [g.marketing_name or g.name for g in self.gpus]
        return ", ".join(names)


def detect_host() -> HostInfo:
    info = HostInfo()

    driver_path = Path("/sys/module/amdgpu/version")
    if driver_path.exists():
        info.driver_version = driver_path.read_text().strip()

    rocm_path = Path("/opt/rocm/.info/version")
    if rocm_path.exists():
        info.rocm_version = rocm_path.read_text().strip()

    info.has_kfd = Path("/dev/kfd").exists()

    dri_path = Path("/dev/dri")
    if dri_path.exists():
        info.dri_devices = sorted(
            str(p) for p in dri_path.iterdir()
            if p.name.startswith("renderD") or p.name.startswith("card")
        )

    info.gpus = _detect_gpus_rocminfo()
    if not info.gpus:
        info.gpus = _detect_gpus_sysfs()

    return info


def _detect_gpus_rocminfo() -> list[GpuInfo]:
    try:
        result = subprocess.run(
            ["rocminfo"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return []
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []

    gpus: list[GpuInfo] = []
    in_agent = False
    current: dict[str, str] = {}

    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith("Agent "):
            if current.get("vendor") == "AMD" and current.get("name", "").startswith("gfx"):
                gpus.append(GpuInfo(
                    name=current["name"],
                    marketing_name=current.get("marketing", current["name"]),
                    gfx_target=current["name"],
                ))
            current = {}
            in_agent = True
        elif in_agent:
            if line.startswith("Name:"):
                current["name"] = line.split(":", 1)[1].strip()
            elif line.startswith("Marketing Name:"):
                current["marketing"] = line.split(":", 1)[1].strip()
            elif line.startswith("Vendor Name:"):
                current["vendor"] = line.split(":", 1)[1].strip()

    if current.get("vendor") == "AMD" and current.get("name", "").startswith("gfx"):
        gpus.append(GpuInfo(
            name=current["name"],
            marketing_name=current.get("marketing", current["name"]),
            gfx_target=current["name"],
        ))

    return gpus


def _gfx_from_target_version(ver: int) -> str:
    """Convert KFD gfx_target_version integer to gfx string."""
    known = {
        90000: "gfx900",
        90600: "gfx906",
        90800: "gfx908",
        91000: "gfx90a",
        94000: "gfx940",
        94100: "gfx941",
        94200: "gfx942",
        101000: "gfx1010",
        101200: "gfx1012",
        103000: "gfx1030",
        103100: "gfx1031",
        110000: "gfx1100",
        110100: "gfx1101",
        110200: "gfx1102",
        115000: "gfx1150",
        120000: "gfx1200",
        120100: "gfx1201",
    }
    if ver in known:
        return known[ver]
    major = ver // 10000
    minor = (ver % 10000) // 100
    step = ver % 100
    if minor > 0:
        return f"gfx{major}{minor:x}{step:x}" if step else f"gfx{major}{minor:x}0"
    return f"gfx{major}00"


def _detect_gpus_sysfs() -> list[GpuInfo]:
    """Fallback GPU detection via KFD sysfs topology."""
    nodes = Path("/sys/class/kfd/kfd/topology/nodes")
    if not nodes.exists():
        return []

    gpus: list[GpuInfo] = []
    for node in sorted(nodes.iterdir()):
        props_path = node / "properties"
        if not props_path.exists():
            continue

        props: dict[str, str] = {}
        for line in props_path.read_text().splitlines():
            parts = line.strip().split(None, 1)
            if len(parts) == 2:
                props[parts[0]] = parts[1]

        gfx_ver = int(props.get("gfx_target_version", "0"))
        simd = int(props.get("simd_count", "0"))

        if gfx_ver == 0 or simd == 0:
            continue

        gfx = _gfx_from_target_version(gfx_ver)
        marketing = GFX_MARKETING_NAMES.get(gfx, gfx)

        name_path = node / "name"
        name = name_path.read_text().strip() if name_path.exists() else gfx

        gpus.append(GpuInfo(
            name=name if name else gfx,
            marketing_name=marketing,
            gfx_target=gfx,
        ))

    return gpus


def _find_supported_gfx(rocm_version: str) -> Optional[set[str]]:
    for prefix in sorted(ROCM_GFX_SUPPORT.keys(), key=len, reverse=True):
        if rocm_version.startswith(prefix):
            return ROCM_GFX_SUPPORT[prefix]
    return None


def _find_min_driver(rocm_version: str) -> Optional[str]:
    for prefix in sorted(ROCM_MIN_DRIVER.keys(), key=len, reverse=True):
        if rocm_version.startswith(prefix):
            return ROCM_MIN_DRIVER[prefix]
    return None


@dataclass
class CompatWarning:
    level: str  # "error", "warning", "info"
    message: str


def check_compatibility(host: HostInfo, rocm_version: str) -> list[CompatWarning]:
    warnings: list[CompatWarning] = []

    if not host.has_kfd:
        warnings.append(CompatWarning(
            "error",
            "No /dev/kfd found. The amdgpu kernel driver may not be loaded. "
            "GPU compute will not work inside the container.",
        ))

    if not host.dri_devices:
        warnings.append(CompatWarning(
            "error",
            "No /dev/dri devices found. GPU rendering and compute unavailable.",
        ))

    if not host.driver_version:
        warnings.append(CompatWarning(
            "error",
            "No amdgpu driver version detected. Is the amdgpu kernel module loaded?",
        ))

    if host.driver_version:
        min_driver = _find_min_driver(rocm_version)
        if min_driver and not _version_gte(host.driver_version, min_driver):
            warnings.append(CompatWarning(
                "warning",
                f"Host driver {host.driver_version} may be too old for "
                f"ROCm {rocm_version} (needs >= {min_driver}). "
                f"Container may fail to access GPUs.",
            ))
        elif min_driver:
            warnings.append(CompatWarning(
                "info",
                f"Host driver {host.driver_version} meets minimum "
                f"{min_driver} for ROCm {rocm_version}.",
            ))

    if host.rocm_version:
        if _version_gte(rocm_version, host.rocm_version):
            if rocm_version != host.rocm_version and _parse_version(rocm_version)[:2] != _parse_version(host.rocm_version)[:2]:
                warnings.append(CompatWarning(
                    "warning",
                    f"Container ROCm {rocm_version} is newer than host "
                    f"ROCm {host.rocm_version}. The host kernel driver may "
                    f"not support all features. Consider updating host ROCm.",
                ))

    if host.gpus:
        supported = _find_supported_gfx(rocm_version)
        if supported is not None:
            for gpu in host.gpus:
                if gpu.gfx_target not in supported:
                    warnings.append(CompatWarning(
                        "error",
                        f"GPU {gpu.marketing_name} ({gpu.gfx_target}) is NOT "
                        f"supported by ROCm {rocm_version}. Supported targets: "
                        f"{', '.join(sorted(supported))}.",
                    ))
                else:
                    warnings.append(CompatWarning(
                        "info",
                        f"GPU {gpu.marketing_name} ({gpu.gfx_target}) is "
                        f"supported by ROCm {rocm_version}.",
                    ))
    else:
        warnings.append(CompatWarning(
            "warning",
            "No AMD GPUs detected. Cannot verify architecture compatibility.",
        ))

    return warnings


def print_host_info(host: HostInfo) -> None:
    lines = []

    if host.gpus:
        for gpu in host.gpus:
            lines.append(f"  [bold]GPU[/bold]       {gpu.marketing_name} ({gpu.gfx_target})")
    else:
        lines.append("  [bold]GPU[/bold]       [dim]None detected[/dim]")

    lines.append(f"  [bold]Driver[/bold]    {host.driver_version or '[dim]not found[/dim]'}")
    lines.append(f"  [bold]ROCm[/bold]      {host.rocm_version or '[dim]not installed[/dim]'}")
    lines.append(f"  [bold]KFD[/bold]       {'[green]available[/green]' if host.has_kfd else '[red]missing[/red]'}")
    lines.append(f"  [bold]DRI[/bold]       {', '.join(Path(d).name for d in host.dri_devices) or '[red]none[/red]'}")

    console.print(Panel(
        "\n".join(lines),
        title="[bold cyan]Host GPU Environment[/bold cyan]",
        border_style="cyan",
        padding=(1, 2),
    ))


def print_warnings(warnings: list[CompatWarning]) -> None:
    errors = [w for w in warnings if w.level == "error"]
    warns = [w for w in warnings if w.level == "warning"]
    infos = [w for w in warnings if w.level == "info"]

    for w in infos:
        console.print(f"  [green]✓[/green] {w.message}")
    for w in warns:
        console.print(f"  [yellow]⚠[/yellow] {w.message}")
    for w in errors:
        console.print(f"  [red]✗[/red] {w.message}")


def has_blocking_errors(warnings: list[CompatWarning]) -> bool:
    return any(w.level == "error" for w in warnings)
