"""
Audit Logs API — read-only access to the append-only audit log.

    GET /logs          — list recent audit records (with pagination)
    GET /logs/stats    — summary statistics
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.security.audit import AuditRecord

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/logs", tags=["logs"])


class LogEntry(BaseModel):
    """Enriched audit log entry for the frontend."""
    timestamp: str
    task: str
    selected_model: str
    execution_status: str
    metadata: dict[str, Any] = {}
    # Derived fields
    category: str = ""
    description: str = ""


class LogsResponse(BaseModel):
    """Paginated audit log response."""
    total: int
    offset: int
    limit: int
    entries: list[LogEntry]


class LogStats(BaseModel):
    """Summary statistics about the audit log."""
    total_records: int
    by_status: dict[str, int] = {}
    by_category: dict[str, int] = {}
    first_record: Optional[str] = None
    last_record: Optional[str] = None


def _categorise(task: str) -> tuple[str, str]:
    """Derive a user-friendly category and description from a task string."""
    task_lower = task.lower()

    if "agent:" in task_lower or task_lower.startswith("agent"):
        return "agent", f"Agent task: {task}"
    if "rag" in task_lower:
        return "knowledge", f"RAG query: {task}"
    if "approval_workflow" in task_lower:
        return "workflow", f"Approval workflow: {task}"
    if "ingest" in task_lower or "knowledge" in task_lower:
        return "knowledge", f"Knowledge base: {task}"
    if "document" in task_lower or "upload" in task_lower:
        return "document", f"Document operation: {task}"
    if "execution" in task_lower or "code" in task_lower:
        return "execution", f"Code execution: {task}"
    if "codegen" in task_lower:
        return "codegen", f"Code generation: {task}"
    if "export" in task_lower or "studio" in task_lower:
        return "export", f"Export: {task}"
    if "model" in task_lower:
        return "model", f"Model operation: {task}"

    return "system", task


def _to_log_entry(record: AuditRecord) -> LogEntry:
    """Convert an AuditRecord to an enriched LogEntry."""
    category, description = _categorise(record.task)
    return LogEntry(
        timestamp=record.timestamp,
        task=record.task,
        selected_model=record.selected_model,
        execution_status=record.execution_status,
        metadata=record.metadata,
        category=category,
        description=description,
    )


@router.get("", response_model=LogsResponse)
async def list_logs(
    request: Request,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
) -> LogsResponse:
    """List recent audit log entries with optional filtering."""
    audit = getattr(request.app.state, "audit_service", None)
    if audit is None:
        raise HTTPException(
            status_code=503, detail="Audit service not initialised.",
        )

    # Read a generous batch (audit logs are append-only JSON lines)
    all_records = audit.get_recent(limit=1000)

    # Convert to enriched entries
    entries = [_to_log_entry(r) for r in all_records]

    # Apply filters
    if status:
        entries = [e for e in entries if e.execution_status == status]
    if category:
        entries = [
            e for e in entries if e.category == category
        ]

    total = len(entries)

    # Reverse so newest first
    entries = list(reversed(entries))

    # Paginate
    paginated = entries[offset : offset + limit]

    return LogsResponse(
        total=total,
        offset=offset,
        limit=limit,
        entries=paginated,
    )


@router.get("/stats", response_model=LogStats)
async def log_stats(request: Request) -> LogStats:
    """Return summary statistics about the audit log."""
    audit = getattr(request.app.state, "audit_service", None)
    if audit is None:
        raise HTTPException(
            status_code=503, detail="Audit service not initialised.",
        )

    all_records = audit.get_recent(limit=5000)
    if not all_records:
        return LogStats(total_records=0)

    by_status: dict[str, int] = {}
    by_category: dict[str, int] = {}

    for r in all_records:
        by_status[r.execution_status] = by_status.get(
            r.execution_status, 0
        ) + 1
        cat, _ = _categorise(r.task)
        by_category[cat] = by_category.get(cat, 0) + 1

    return LogStats(
        total_records=len(all_records),
        by_status=by_status,
        by_category=by_category,
        first_record=all_records[0].timestamp if all_records else None,
        last_record=all_records[-1].timestamp if all_records else None,
    )
