"use client";

import { useState, useCallback } from "react";
import {
  runAgent,
  type AgentRunResponse,
  type TraceEvent,
  ApiError,
} from "@/lib/api";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  } catch {
    return iso;
  }
}

function eventColor(eventType: string): string {
  if (eventType.includes("completed") || eventType === "task_completed")
    return "completed";
  if (eventType.includes("failed") || eventType === "task_failed")
    return "failed";
  if (eventType.includes("started") || eventType === "plan_created")
    return "processing";
  if (eventType === "task_received" || eventType === "task_routed")
    return "pending";
  return "pending";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgentPage() {
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRun, setCurrentRun] = useState<AgentRunResponse | null>(null);
  const [history, setHistory] = useState<AgentRunResponse[]>([]);

  const executeTask = useCallback(async () => {
    if (!task.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await runAgent({ task: task.trim() });
      setCurrentRun(result);
      setHistory((prev) => [result, ...prev].slice(0, 5));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`API error ${err.status}: ${err.statusText}`);
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to execute agent task",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [task]);

  // -- Plan step helpers ------------------------------------------------------

  const renderPlan = (plan: Record<string, unknown>[]) => {
    if (plan.length === 0) {
      return (
        <p className="text-xs text-text-muted">No plan steps generated.</p>
      );
    }
    return (
      <div className="relative space-y-0">
        {plan.map((step, idx) => {
          const stepId = String(step.step_id ?? idx + 1);
          const tool = String(step.tool ?? "—");
          const description = String(step.description ?? "");
          const dependsOn = step.depends_on;
          const isLast = idx === plan.length - 1;

          return (
            <div key={stepId} className="relative flex gap-3">
              {/* Vertical line + numbered circle */}
              <div className="flex flex-col items-center">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent-blue bg-accent-blue/15 text-[11px] font-bold text-accent-blue">
                  {stepId}
                </div>
                {!isLast && (
                  <div className="w-px flex-1 bg-border-secondary" />
                )}
              </div>

              {/* Content */}
              <div className={`pb-4 ${isLast ? "" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-bg-tertiary px-2 py-0.5 font-mono text-xs text-accent-cyan">
                    {tool}
                  </span>
                  {dependsOn != null && (
                    <span className="text-[11px] text-text-muted">
                      depends on:{" "}
                      {Array.isArray(dependsOn)
                        ? dependsOn.join(", ")
                        : String(dependsOn)}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  {description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // -- Tool calls -------------------------------------------------------------

  const renderToolCalls = (toolCalls: Record<string, unknown>[]) => {
    if (toolCalls.length === 0) {
      return <p className="text-xs text-text-muted">No tool calls recorded.</p>;
    }
    return (
      <div className="space-y-3">
        {toolCalls.map((tc, idx) => {
          const toolName = String(tc.tool ?? tc.name ?? `tool_${idx}`);
          const input = tc.input ?? tc.arguments ?? null;
          const output = tc.output ?? tc.result ?? null;

          return (
            <div
              key={idx}
              className="rounded-md border border-border-secondary bg-bg-tertiary p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-accent-purple">
                  {toolName}
                </span>
                <span className="text-[11px] text-text-muted">
                  call #{idx + 1}
                </span>
              </div>
              {input != null && (
                <div className="mb-2">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                    Input
                  </p>
                  <pre className="max-h-40 overflow-auto rounded bg-bg-primary p-2 font-mono text-xs text-text-secondary">
                    {typeof input === "string"
                      ? input
                      : JSON.stringify(input, null, 2)}
                  </pre>
                </div>
              )}
              {output != null && (
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                    Output
                  </p>
                  <pre className="max-h-40 overflow-auto rounded bg-bg-primary p-2 font-mono text-xs text-text-secondary">
                    {typeof output === "string"
                      ? output
                      : JSON.stringify(output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // -- Trace timeline ---------------------------------------------------------

  const renderTrace = (trace: TraceEvent[]) => {
    if (trace.length === 0) {
      return <p className="text-xs text-text-muted">No trace events.</p>;
    }
    return (
      <div className="space-y-1">
        {trace.map((ev, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-bg-hover"
          >
            <span className="shrink-0 pt-0.5 font-mono text-[11px] text-text-muted">
              {formatTimestamp(ev.timestamp)}
            </span>
            <StatusBadge status={eventColor(ev.event_type)} />
            <span className="font-mono text-xs text-text-primary">
              {ev.event_type}
            </span>
            {ev.step_id && (
              <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-muted">
                step {ev.step_id}
              </span>
            )}
            {ev.metadata && Object.keys(ev.metadata).length > 0 && (
              <span className="ml-auto max-w-xs truncate text-[11px] text-text-muted">
                {JSON.stringify(ev.metadata)}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  };

  // -- Verification -----------------------------------------------------------

  const renderVerification = (verification: Record<string, unknown>) => {
    if (!verification || Object.keys(verification).length === 0) {
      return (
        <p className="text-xs text-text-muted">
          No verification data available.
        </p>
      );
    }
    const status = String(verification.status ?? verification.verification_status ?? "not_verified");
    const details = Object.entries(verification).filter(
      ([k]) => k !== "status" && k !== "verification_status",
    );

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Status:</span>
          <StatusBadge status={status} size="md" />
        </div>
        {details.length > 0 && (
          <dl className="space-y-1.5">
            {details.map(([key, val]) => (
              <div key={key} className="flex gap-3 text-xs">
                <dt className="shrink-0 text-text-muted">
                  {key.replace(/_/g, " ")}:
                </dt>
                <dd className="font-mono text-text-secondary">
                  {typeof val === "string" ? val : JSON.stringify(val)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  };

  // -- Main render ------------------------------------------------------------

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-text-primary">
          Agent Execution
        </h1>
        <p className="text-xs text-text-muted">
          Run tasks through the AI agent pipeline
        </p>
      </div>

      {/* ── Task Input ──────────────────────────────────────────────── */}
      <Panel title="Task Input" subtitle="Describe the task for the agent">
        <div className="space-y-3">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the task you want the agent to execute..."
            rows={4}
            disabled={loading}
            className="w-full resize-y bg-bg-tertiary border border-border-primary rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none disabled:opacity-50"
          />
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="md"
              loading={loading}
              disabled={!task.trim()}
              onClick={executeTask}
            >
              {loading ? "Executing..." : "Execute Task"}
            </Button>
            {loading && (
              <span className="flex items-center gap-2 text-xs text-text-muted">
                <Spinner className="h-4 w-4" />
                Agent is processing your task...
              </span>
            )}
          </div>
        </div>
      </Panel>

      {/* ── Error ───────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-md border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          {error}
        </div>
      )}

      {/* ── Result Display ──────────────────────────────────────────── */}
      {currentRun && (
        <>
          {/* Header */}
          <Panel title="Execution Result" subtitle={`Run ${currentRun.run_id}`}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Run ID:</span>
                <span className="font-mono text-xs text-text-primary">
                  {currentRun.run_id}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Task Type:</span>
                <StatusBadge status={currentRun.task_type} size="md" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Model:</span>
                <span className="font-mono text-xs text-accent-cyan">
                  {currentRun.selected_model}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Provider:</span>
                <span className="font-mono text-xs text-text-secondary">
                  {currentRun.provider}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Status:</span>
                <StatusBadge
                  status={currentRun.execution_status}
                  size="md"
                />
              </div>
            </div>
          </Panel>

          {/* Plan */}
          <Panel
            title="Execution Plan"
            subtitle={`${currentRun.plan.length} step(s)`}
          >
            {renderPlan(currentRun.plan)}
          </Panel>

          {/* Tool Calls */}
          <Panel
            title="Tool Calls"
            subtitle={`${currentRun.tool_calls.length} call(s)`}
          >
            {renderToolCalls(currentRun.tool_calls)}
          </Panel>

          {/* Execution Trace */}
          <Panel
            title="Execution Trace"
            subtitle={`${currentRun.trace.length} event(s)`}
          >
            {renderTrace(currentRun.trace)}
          </Panel>

          {/* Verification */}
          <Panel title="Verification">
            {renderVerification(currentRun.verification)}
          </Panel>

          {/* Final Result */}
          <Panel title="Final Result">
            {currentRun.result ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-bg-tertiary p-4 font-mono text-sm text-text-primary">
                {currentRun.result}
              </pre>
            ) : (
              <p className="text-xs text-text-muted">
                No result returned by the agent.
              </p>
            )}
          </Panel>
        </>
      )}

      {/* ── Empty state (no run yet) ────────────────────────────────── */}
      {!currentRun && !loading && !error && (
        <EmptyState
          title="No agent runs yet"
          description="Enter a task above and click Execute to run it through the agent pipeline."
        />
      )}

      {/* ── History ─────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <Panel
          title="Recent Runs"
          subtitle={`Last ${history.length} execution(s)`}
        >
          <div className="space-y-1">
            {history.map((run) => (
              <button
                key={run.run_id}
                onClick={() => setCurrentRun(run)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-bg-hover ${
                  currentRun?.run_id === run.run_id
                    ? "bg-bg-tertiary border border-border-primary"
                    : ""
                }`}
              >
                <span className="shrink-0 font-mono text-xs text-text-muted">
                  {run.run_id.slice(0, 8)}
                </span>
                <span className="flex-1 truncate text-sm text-text-secondary">
                  {run.task}
                </span>
                <StatusBadge status={run.execution_status} />
                <span className="shrink-0 font-mono text-[11px] text-text-muted">
                  {run.selected_model}
                </span>
              </button>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
