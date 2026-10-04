"""Tests for app.security.audit_service (AuditService)."""

import json

import pytest

from app.security.audit import AuditService


@pytest.fixture()
def audit_service(tmp_path):
    """Create an AuditService writing to a temporary log file."""
    log_file = tmp_path / "test_audit.log"
    return AuditService(log_file=log_file)


class TestLogAction:
    """AuditService.record() writes entries to the log file."""

    def test_record_writes_entry(self, audit_service):
        audit_service.record(
            task="test_task",
            selected_model="dummy",
            execution_status="success",
        )
        assert audit_service.log_file.exists()
        content = audit_service.log_file.read_text()
        assert "test_task" in content

    def test_record_returns_audit_record(self, audit_service):
        record = audit_service.record(
            task="another_task",
            selected_model="model_x",
            execution_status="failure",
        )
        assert record.task == "another_task"
        assert record.execution_status == "failure"

    def test_record_count_increments(self, audit_service):
        assert audit_service.record_count == 0
        audit_service.record(
            task="t1", selected_model="m", execution_status="success",
        )
        assert audit_service.record_count == 1
        audit_service.record(
            task="t2", selected_model="m", execution_status="success",
        )
        assert audit_service.record_count == 2


class TestGetLogs:
    """AuditService.get_recent() returns entries after logging."""

    def test_get_recent_returns_entries(self, audit_service):
        audit_service.record(
            task="task_a", selected_model="m1", execution_status="success",
        )
        audit_service.record(
            task="task_b", selected_model="m2", execution_status="failure",
        )
        records = audit_service.get_recent()
        assert len(records) == 2
        assert records[0].task == "task_a"
        assert records[1].task == "task_b"

    def test_get_recent_empty_when_no_records(self, audit_service):
        records = audit_service.get_recent()
        assert records == []


class TestGetStats:
    """AuditService.get_health() returns correct counts."""

    def test_health_session_records_matches(self, audit_service):
        for i in range(5):
            audit_service.record(
                task=f"task_{i}",
                selected_model="m",
                execution_status="success",
            )
        health = audit_service.get_health()
        assert health["session_records"] == 5
        assert health["status"] == "healthy"
