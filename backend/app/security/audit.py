"""
Audit service.

Records every agent execution with timestamp, task, selected model,
and execution status. Writes to a JSON-lines file with append-only
semantics.

Terminology note: This is an *append-only structured audit log*,
NOT a tamper-evident log.  True tamper-evidence requires cryptographic
hash chaining (each record hashing the previous record's digest) or
a Merkle tree.  That is planned for a future phase.  Until then,
this log provides traceability and accountability but NOT tamper
detection.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class AuditRecord(BaseModel):
    """A single audit log entry."""

    timestamp: str
    task: str
    selected_model: str
    execution_status: str
    metadata: dict[str, Any] = {}


class AuditService:
    """
    Append-only structured audit logger.

    Appends structured JSON records to a log file so that every
    agentic execution is traceable.  Provides accountability and
    post-incident review capability.

    NOTE: This implementation does NOT provide tamper-evidence.
    Records can be edited or deleted by anyone with file access.
    True tamper-evident logging (hash-chained records) is planned
    for a future phase.

    In future phases this will be backed by a database and exposed
    via an admin API.
    """

    def __init__(self, log_file: Path | None = None) -> None:
        self._log_file = log_file or Path("data/audit.log")
        self._log_file.parent.mkdir(parents=True, exist_ok=True)
        self._record_count: int = 0

    @property
    def log_file(self) -> Path:
        """Return the path to the audit log file."""
        return self._log_file

    @property
    def record_count(self) -> int:
        """Return the number of records written in this session."""
        return self._record_count

    def record(
        self,
        task: str,
        selected_model: str,
        execution_status: str,
        metadata: dict[str, Any] | None = None,
    ) -> AuditRecord:
        """
        Create and persist an audit record.

        Args:
            task: Description of the task that was executed.
            selected_model: Name of the model provider used.
            execution_status: 'success', 'failure', etc.
            metadata: Optional extra context.

        Returns:
            The AuditRecord that was persisted.
        """
        record = AuditRecord(
            timestamp=datetime.now(timezone.utc).isoformat(),
            task=task,
            selected_model=selected_model,
            execution_status=execution_status,
            metadata=metadata or {},
        )
        self._persist(record)
        return record

    def _persist(self, record: AuditRecord) -> None:
        """Append the record as a JSON line to the audit log file."""
        try:
            with open(self._log_file, "a", encoding="utf-8") as f:
                f.write(record.model_dump_json() + "\n")
            self._record_count += 1
        except OSError:
            logger.exception("Failed to write audit record to %s", self._log_file)

    def get_recent(self, limit: int = 50) -> list[AuditRecord]:
        """
        Read the most recent audit records from the log file.

        Args:
            limit: Maximum number of records to return.

        Returns:
            List of AuditRecord, most recent last.
        """
        if not self._log_file.exists():
            return []
        try:
            lines = self._log_file.read_text(encoding="utf-8").strip().splitlines()
            records: list[AuditRecord] = []
            for line in lines[-limit:]:
                records.append(AuditRecord.model_validate(json.loads(line)))
            return records
        except (OSError, json.JSONDecodeError):
            logger.exception("Failed to read audit log")
            return []

    def get_health(self) -> dict[str, object]:
        """Return audit subsystem health."""
        writable = True
        try:
            # Test that we can still append
            self._log_file.parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            writable = False

        return {
            "status": "healthy" if writable else "degraded",
            "log_file": str(self._log_file),
            "session_records": self._record_count,
            "tamper_evident": False,  # Explicitly declare: no hash chaining
        }
