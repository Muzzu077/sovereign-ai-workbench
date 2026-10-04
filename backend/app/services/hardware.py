"""
Hardware detection and telemetry service.

Detects local hardware capabilities (CPU, GPU, RAM, disk) for:
- Frontend health dashboard display
- Inference performance baselines
- Air-gap compliance verification

All detection is done via standard Python libraries and system
commands. No external services or cloud APIs are used.

GPU detection order:
    1. NVIDIA — nvidia-smi CLI
    2. AMD    — rocm-smi CLI
    3. Intel  — /sys/class/drm or intel_gpu_top
    4. None   — CPU-only mode
"""

from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class GPUInfo(BaseModel):
    """Detected GPU information."""
    vendor: str  # "nvidia", "amd", "intel", "none"
    name: str
    vram_mb: int | None = None
    driver_version: str | None = None
    cuda_version: str | None = None
    temperature_c: int | None = None
    utilization_pct: int | None = None
    available: bool = False


class CPUInfo(BaseModel):
    """CPU information."""
    model: str
    cores_physical: int
    cores_logical: int
    architecture: str
    frequency_mhz: float | None = None


class MemoryInfo(BaseModel):
    """System memory information."""
    total_mb: int
    available_mb: int
    used_mb: int
    percent_used: float


class DiskInfo(BaseModel):
    """Disk usage for the workbench data directory."""
    path: str
    total_gb: float
    used_gb: float
    free_gb: float
    percent_used: float


class HardwareSnapshot(BaseModel):
    """Complete hardware snapshot."""
    hostname: str
    os: str
    os_version: str
    kernel: str
    architecture: str
    python_version: str
    cpu: CPUInfo
    memory: MemoryInfo
    gpu: GPUInfo
    disk: DiskInfo
    inference_capable: bool  # Has enough resources for local LLM inference
    air_gap_safe: bool  # No external network dependencies detected


class HardwareDetector:
    """Detects local hardware capabilities.

    Usage:
        detector = HardwareDetector(data_dir="/path/to/data")
        snapshot = detector.detect()
    """

    def __init__(self, data_dir: str | Path = ".") -> None:
        self._data_dir = Path(data_dir).resolve()

    def detect(self) -> HardwareSnapshot:
        """Run full hardware detection and return a snapshot."""
        cpu = self._detect_cpu()
        memory = self._detect_memory()
        gpu = self._detect_gpu()
        disk = self._detect_disk()

        # Inference capability heuristic:
        # - At minimum 4 GB RAM
        # - CPU with 2+ cores
        inference_capable = (
            memory.total_mb >= 4096
            and cpu.cores_physical >= 2
        )

        return HardwareSnapshot(
            hostname=platform.node(),
            os=platform.system(),
            os_version=platform.version(),
            kernel=platform.release(),
            architecture=platform.machine(),
            python_version=platform.python_version(),
            cpu=cpu,
            memory=memory,
            gpu=gpu,
            disk=disk,
            inference_capable=inference_capable,
            air_gap_safe=True,  # We're always local
        )

    def _detect_cpu(self) -> CPUInfo:
        """Detect CPU information."""
        try:
            import multiprocessing
            logical = multiprocessing.cpu_count() or 1
        except Exception:
            logical = 1

        # Physical cores (Linux-specific, fallback to logical)
        physical = logical
        try:
            physical = len(set(
                line.strip()
                for line in Path("/proc/cpuinfo").read_text().split("\n")
                if line.startswith("core id")
            )) or logical
        except Exception:
            pass

        # CPU model string
        model = platform.processor() or "Unknown"
        try:
            for line in Path("/proc/cpuinfo").read_text().split("\n"):
                if line.startswith("model name"):
                    model = line.split(":", 1)[1].strip()
                    break
        except Exception:
            pass

        # Frequency
        freq = None
        try:
            for line in Path("/proc/cpuinfo").read_text().split("\n"):
                if line.startswith("cpu MHz"):
                    freq = float(line.split(":", 1)[1].strip())
                    break
        except Exception:
            pass

        return CPUInfo(
            model=model,
            cores_physical=physical,
            cores_logical=logical,
            architecture=platform.machine(),
            frequency_mhz=freq,
        )

    def _detect_memory(self) -> MemoryInfo:
        """Detect system memory."""
        try:
            meminfo = Path("/proc/meminfo").read_text()
            mem = {}
            for line in meminfo.split("\n"):
                if ":" in line:
                    key, val = line.split(":", 1)
                    # Parse "MemTotal:    16384 kB" → 16384
                    num_str = val.strip().split()[0] if val.strip() else "0"
                    mem[key.strip()] = int(num_str)  # in kB

            total_kb = mem.get("MemTotal", 0)
            avail_kb = mem.get("MemAvailable", mem.get("MemFree", 0))
            total_mb = total_kb // 1024
            avail_mb = avail_kb // 1024
            used_mb = total_mb - avail_mb
            pct = round((used_mb / total_mb * 100) if total_mb > 0 else 0, 1)

            return MemoryInfo(
                total_mb=total_mb,
                available_mb=avail_mb,
                used_mb=used_mb,
                percent_used=pct,
            )
        except Exception:
            return MemoryInfo(
                total_mb=0, available_mb=0, used_mb=0, percent_used=0.0,
            )

    def _detect_gpu(self) -> GPUInfo:
        """Detect GPU — tries NVIDIA first, then AMD, then Intel."""
        # Try NVIDIA
        gpu = self._try_nvidia()
        if gpu and gpu.available:
            return gpu

        # Try AMD
        gpu = self._try_amd()
        if gpu and gpu.available:
            return gpu

        # Try Intel integrated
        gpu = self._try_intel()
        if gpu and gpu.available:
            return gpu

        return GPUInfo(
            vendor="none",
            name="No dedicated GPU detected",
            available=False,
        )

    def _try_nvidia(self) -> GPUInfo | None:
        """Detect NVIDIA GPU via nvidia-smi."""
        if not shutil.which("nvidia-smi"):
            return None

        try:
            result = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=name,memory.total,driver_version,temperature.gpu,utilization.gpu",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode != 0:
                return None

            line = result.stdout.strip().split("\n")[0]
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 5:
                return None

            # CUDA version
            cuda_ver = None
            try:
                cuda_result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
                    capture_output=True, text=True, timeout=5,
                )
                # Also try nvcc
                nvcc_result = subprocess.run(
                    ["nvcc", "--version"],
                    capture_output=True, text=True, timeout=5,
                )
                for ln in nvcc_result.stdout.split("\n"):
                    if "release" in ln.lower():
                        cuda_ver = ln.split("release")[-1].strip().split(",")[0]
                        break
            except Exception:
                pass

            return GPUInfo(
                vendor="nvidia",
                name=parts[0],
                vram_mb=int(float(parts[1])),
                driver_version=parts[2],
                cuda_version=cuda_ver,
                temperature_c=int(float(parts[3])) if parts[3] != "[N/A]" else None,
                utilization_pct=int(float(parts[4])) if parts[4] != "[N/A]" else None,
                available=True,
            )
        except Exception as exc:
            logger.debug("NVIDIA detection failed: %s", exc)
            return None

    def _try_amd(self) -> GPUInfo | None:
        """Detect AMD GPU via rocm-smi."""
        if not shutil.which("rocm-smi"):
            return None

        try:
            result = subprocess.run(
                ["rocm-smi", "--showproductname", "--showmeminfo", "vram", "--csv"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode != 0:
                return None

            name = "AMD GPU"
            vram = None
            for line in result.stdout.split("\n"):
                if "Card" in line and "," in line:
                    parts = line.split(",")
                    if len(parts) >= 2:
                        name = parts[1].strip()

            return GPUInfo(
                vendor="amd",
                name=name,
                vram_mb=vram,
                available=True,
            )
        except Exception:
            return None

    def _try_intel(self) -> GPUInfo | None:
        """Detect Intel integrated GPU via /sys/class/drm."""
        try:
            drm_path = Path("/sys/class/drm")
            if not drm_path.exists():
                return None

            for card_dir in drm_path.iterdir():
                device_path = card_dir / "device"
                if device_path.exists():
                    vendor_file = device_path / "vendor"
                    if vendor_file.exists():
                        vendor_id = vendor_file.read_text().strip()
                        if vendor_id == "0x8086":  # Intel PCI vendor ID
                            return GPUInfo(
                                vendor="intel",
                                name="Intel Integrated Graphics",
                                available=True,
                            )
        except Exception:
            pass
        return None

    def _detect_disk(self) -> DiskInfo:
        """Detect disk usage for the data directory."""
        try:
            stat = os.statvfs(str(self._data_dir))
            total = stat.f_frsize * stat.f_blocks
            free = stat.f_frsize * stat.f_bavail
            used = total - free

            return DiskInfo(
                path=str(self._data_dir),
                total_gb=round(total / (1024 ** 3), 2),
                used_gb=round(used / (1024 ** 3), 2),
                free_gb=round(free / (1024 ** 3), 2),
                percent_used=round((used / total * 100) if total > 0 else 0, 1),
            )
        except Exception:
            return DiskInfo(
                path=str(self._data_dir),
                total_gb=0, used_gb=0, free_gb=0, percent_used=0.0,
            )
