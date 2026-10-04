"""Tests for app.services.hardware.HardwareDetector.

These tests run real hardware detection — no mocking.
"""

import pytest

from app.services.hardware import (
    CPUInfo,
    DiskInfo,
    GPUInfo,
    HardwareDetector,
    HardwareSnapshot,
    MemoryInfo,
)


@pytest.fixture()
def detector(tmp_path):
    """HardwareDetector pointed at a temporary data directory."""
    return HardwareDetector(data_dir=tmp_path)


@pytest.fixture()
def snapshot(detector):
    """A real hardware snapshot from the current machine."""
    return detector.detect()


class TestDetect:
    """Top-level detect() method."""

    def test_returns_hardware_snapshot(self, snapshot):
        assert isinstance(snapshot, HardwareSnapshot)

    def test_snapshot_has_valid_hostname(self, snapshot):
        assert isinstance(snapshot.hostname, str)
        assert len(snapshot.hostname) > 0

    def test_snapshot_has_os_info(self, snapshot):
        assert snapshot.os in ("Linux", "Darwin", "Windows")

    def test_inference_capable_is_bool(self, snapshot):
        assert isinstance(snapshot.inference_capable, bool)

    def test_air_gap_safe_is_true(self, snapshot):
        assert snapshot.air_gap_safe is True


class TestCPUDetection:
    """CPU detection returns valid CPUInfo."""

    def test_cores_positive(self, snapshot):
        assert snapshot.cpu.cores_physical > 0
        assert snapshot.cpu.cores_logical > 0

    def test_model_is_nonempty(self, snapshot):
        assert isinstance(snapshot.cpu.model, str)
        assert len(snapshot.cpu.model) > 0

    def test_architecture_present(self, snapshot):
        assert len(snapshot.cpu.architecture) > 0


class TestMemoryDetection:
    """Memory detection returns valid MemoryInfo."""

    def test_total_mb_positive(self, snapshot):
        assert snapshot.memory.total_mb > 0

    def test_available_mb_nonnegative(self, snapshot):
        assert snapshot.memory.available_mb >= 0

    def test_percent_used_in_range(self, snapshot):
        assert 0.0 <= snapshot.memory.percent_used <= 100.0


class TestDiskDetection:
    """Disk detection returns valid DiskInfo."""

    def test_total_gb_positive(self, snapshot):
        assert snapshot.disk.total_gb > 0

    def test_free_gb_nonnegative(self, snapshot):
        assert snapshot.disk.free_gb >= 0


class TestGPUDetection:
    """GPU detection returns a valid GPUInfo."""

    def test_vendor_is_known(self, snapshot):
        assert snapshot.gpu.vendor in ("nvidia", "amd", "intel", "none")

    def test_name_is_nonempty(self, snapshot):
        assert isinstance(snapshot.gpu.name, str)
        assert len(snapshot.gpu.name) > 0


class TestInferenceCapable:
    """Verify the inference_capable heuristic."""

    def test_requires_sufficient_ram_and_cores(self, snapshot):
        expected = (
            snapshot.memory.total_mb >= 4096
            and snapshot.cpu.cores_physical >= 2
        )
        assert snapshot.inference_capable == expected
