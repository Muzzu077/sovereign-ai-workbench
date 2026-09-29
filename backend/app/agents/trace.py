"""
Execution trace.

Records fine-grained events during agent task execution.
Integrates with the existing ``AuditService`` for persistence.

Event types:

    TASK_RECEIVED
    TASK_ROUTED
    PLAN_CREATED
    TOOL_STARTED
    TOOL_COMPLETED
    TOOL_FAILED
    VERIFICATION_STARTED
    VERIFICATION_COMPLETED
    TASK_COMPLETED
    TASK_FAILED

Each event includes timestamp, run_id, event_type, optional
step_id, and safe metadata. Sensitive document contents are
never placed in trace metadata.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EventType(str, Enum):
    TASK_RECEIVED = "TASK_RECEIVED"
    TASK_ROUTED = "TASK_ROUTED"
    PLAN_CREATED = "PLAN_CREATED"
    TOOL_STARTED = "TOOL_STARTED"
    TOOL_COMPLETED = "TOOL_COMPLETED"
    TOOL_FAILED = "TOOL_FAILED"
    VERIFICATION_STARTED = "VERIFICATION_STARTED"
    VERIFICATION_COMPLETED = "VERIFICATION_COMPLETED"
    TASK_COMPLETED = "TASK_COMPLETED"
    TASK_FAILED = "TASK_FAILED"


class TraceEvent(BaseModel):
    """A single execution trace event."""

    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    run_id: str
    event_type: EventType
    step_id: str | None = None
    metadata: dict[str, Any] = {}


class ExecutionTrace:
    """Collects trace events for a single agent run.

    Create one ``ExecutionTrace`` per run. Call ``emit()`` to
    record events. After the run, ``events`` contains the full
    ordered trace.
    """

    def __init__(self, run_id: str | None = None) -> None:
        self.run_id = run_id or str(uuid.uuid4())
        self.events: list[TraceEvent] = []

    def emit(
        self,
        event_type: EventType,
        step_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> TraceEvent:
        """Record a trace event.

        Args:
            event_type: The kind of event.
            step_id:    Optional plan-step identifier.
            metadata:   Optional safe metadata (no sensitive content).

        Returns:
            The created TraceEvent.
        """
        event = TraceEvent(
            run_id=self.run_id,
            event_type=event_type,
            step_id=step_id,
            metadata=metadata or {},
        )
        self.events.append(event)
        return event

    def to_dicts(self) -> list[dict[str, Any]]:
        """Export all events as a list of dicts (for API responses)."""
        return [e.model_dump() for e in self.events]
