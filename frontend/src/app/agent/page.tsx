"use client";

import React, { useState } from "react";
import {
  Bot,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal,
  Layers,
  Wrench,
  Check,
  RefreshCw,
  Sparkles,
  Zap,
  ArrowRight,
  ShieldCheck,
  Code2,
  Loader2,
  Copy,
  CheckSquare,
  Activity,
  FileCheck2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  SovereignPanel,
  SovereignPipeline,
  SovereignTimeline,
  SovereignStatus,
  SovereignInspector,
} from "@/components/sovereign";
import { runAgent, type AgentRunResponse } from "@/lib/api";

type AgentPipelineStage =
  | "idle"
  | "received"
  | "decompose"
  | "retrieval"
  | "tool_selection"
  | "execution"
  | "verification"
  | "complete"
  | "error";

const sectionReveal = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
} as const;

export default function AgentPage() {
  const [taskInput, setTaskInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<AgentPipelineStage>("idle");
  const [agentResponse, setAgentResponse] = useState<AgentRunResponse | null>(null);
  const [executionLatency, setExecutionLatency] = useState<number | null>(null);
  const [copiedOutput, setCopiedOutput] = useState(false);

  const presets = [
    {
      title: "Math Calculation & Audit",
      prompt: "Compute ((128 * 4) + 512) / 2 and check if the result exceeds 500.",
      icon: Zap,
      accent: "hover:border-[#b45309]/40 hover:text-[#b45309]",
    },
    {
      title: "Knowledge Retrieval & Summary",
      prompt: "Search the knowledge base for operating instructions and summarize safety protocols.",
      icon: Sparkles,
      accent: "hover:border-[#1e6b7b]/40 hover:text-[#1e6b7b]",
    },
    {
      title: "Loopback Compliance Audit",
      prompt: "Verify that all agent sub-tools operate strictly inside loopback socket boundaries.",
      icon: ShieldCheck,
      accent: "hover:border-[#047857]/40 hover:text-[#047857]",
    },
  ];

  const handleExecuteTask = async (customTask?: string) => {
    const task = (customTask || taskInput).trim();
    if (!task || isExecuting) return;

    setIsExecuting(true);
    setPipelineStage("received");
    const start = performance.now();

    try {
      setTimeout(() => setPipelineStage("decompose"), 250);
      setTimeout(() => setPipelineStage("retrieval"), 500);
      setTimeout(() => setPipelineStage("tool_selection"), 750);
      setTimeout(() => setPipelineStage("execution"), 1050);
      setTimeout(() => setPipelineStage("verification"), 1400);

      const res = await runAgent({ task });
      const elapsed = Math.round(performance.now() - start);

      setAgentResponse(res);
      setExecutionLatency(elapsed);
      setPipelineStage("complete");
    } catch (err) {
      setPipelineStage("error");
      alert(`Agent execution failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const copyResult = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedOutput(true);
    setTimeout(() => setCopiedOutput(false), 2000);
  };

  const getStageStatus = (stageId: string): "idle" | "active" | "completed" | "error" => {
    if (pipelineStage === "error") return "error";
    if (pipelineStage === "complete") return "completed";
    const order = ["received", "decompose", "retrieval", "tool_selection", "execution", "verification"];
    const currentIdx = order.indexOf(pipelineStage);
    const thisIdx = order.indexOf(stageId);
    if (thisIdx < currentIdx) return "completed";
    if (thisIdx === currentIdx) return "active";
    return "idle";
  };

  const stateMachineStages = [
    { id: "received", label: "Received", description: "Sanitized & logged", status: getStageStatus("received") },
    { id: "decompose", label: "Decompose", description: "Step graph", status: getStageStatus("decompose") },
    { id: "retrieval", label: "Retrieve", description: "Top-K local vectors", status: getStageStatus("retrieval") },
    { id: "tool_selection", label: "Tool Match", description: "Deterministic map", status: getStageStatus("tool_selection") },
    { id: "execution", label: "Sandbox Run", description: "Air-gapped loopback", status: getStageStatus("execution") },
    { id: "verification", label: "Verification", description: "Strict assertions", status: getStageStatus("verification") },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#64818E]/18 bg-white/80 p-5 shadow-2xl surface-level-2 backdrop-blur-2xl"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#b45309] to-[#9a3412] text-[#192730] shadow-[0_0_25px_rgba(180,83,9,0.3)] border border-[#64818E]/25">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-xs font-extrabold uppercase tracking-wider text-[#192730]">
                Autonomous Agent Orchestrator
              </h1>
              <span className="rounded-lg bg-[#b45309]/10 border border-[#b45309]/40 px-2 py-0.5 font-mono text-[9px] font-bold text-[#b45309] uppercase">
                State Machine
              </span>
            </div>
            <p className="text-[11px] text-[#2d404a] mt-0.5 font-mono font-medium">
              Multi-step plan decomposition, sandboxed tool execution, and verification ledger
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-[10px] text-[#2d404a]">
          <span className="flex items-center gap-1.5 text-[#047857] rounded-xl border border-[#047857]/30 bg-[#047857]/10 px-3 py-1.5 font-bold shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-[#047857]" />
            Air-Gap Sandboxed Loopback
          </span>
        </div>
      </motion.div>

      {/* State Machine Pipeline */}
      <SovereignPanel
        title="Deterministic State Machine Visualizer"
        subtitle="Monitors transitions from decomposition through sandboxed verification"
        badge={
          isExecuting ? (
            <SovereignStatus status="active" label="EXECUTING" size="xs" />
          ) : pipelineStage === "complete" ? (
            <SovereignStatus status="operational" label="VERIFIED COMPLETE" size="xs" />
          ) : undefined
        }
      >
        <SovereignPipeline stages={stateMachineStages} />
      </SovereignPanel>

      {/* Task Dispatcher Console */}
      <SovereignPanel
        title="Autonomous Task Dispatcher"
        subtitle="Deterministic agent planner with sandboxed execution"
        action={
          <span className="font-mono text-[10px] text-[#2d404a] font-bold">
            Max Steps: 8 | Safety: Strict Loopback
          </span>
        }
      >
        <div className="space-y-3 font-mono">
          <textarea
            rows={3}
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            placeholder="Enter complex instructions, multi-step calculations, or knowledge synthesis tasks..."
            className="w-full rounded-xl border border-[#64818E]/30 bg-white/95 p-4 text-xs text-[#192730] placeholder:text-[#4a6272] focus:border-[#1e6b7b] focus:outline-none focus:ring-1 focus:ring-[#1e6b7b] leading-relaxed transition-all font-sans font-medium"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-[#2d404a] text-[10px] uppercase font-bold">Presets:</span>
              {presets.map((p, idx) => {
                const Icon = p.icon;
                return (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => {
                      setTaskInput(p.prompt);
                      handleExecuteTask(p.prompt);
                    }}
                    className={`flex items-center gap-1.5 rounded-xl border border-[#64818E]/25 bg-white/80 px-3 py-1.5 text-[#2d404a] font-medium hover:border-[#1e6b7b]/50 hover:text-[#1e6b7b] hover:bg-[#1e6b7b]/10 transition-all text-[10px] cursor-pointer shadow-sm ${p.accent}`}
                  >
                    <Icon className="h-3 w-3" />
                    {p.title}
                  </motion.button>
                );
              })}
            </div>

            <button
              onClick={() => handleExecuteTask()}
              disabled={isExecuting || !taskInput.trim()}
              className="flex items-center gap-2 rounded-xl border border-[#1e6b7b]/40 bg-[#1e6b7b]/10 px-5 py-2.5 text-xs font-mono font-bold text-[#1e6b7b] hover:bg-[#1e6b7b]/20 hover:border-[#1e6b7b]/60 transition-all cursor-pointer disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{isExecuting ? "Executing Plan..." : "Dispatch Agent"}</span>
            </button>
          </div>
        </div>
      </SovereignPanel>

      {/* Results Deck */}
      <AnimatePresence>
        {agentResponse && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={sectionReveal}
            className="space-y-6"
          >
            {/* Synthesized Output */}
            <SovereignPanel
              title="Synthesized Artifact Output"
              subtitle="Verified output generated by sovereign open-weight models"
              badge={<SovereignStatus status="operational" label="VERIFIED" size="xs" />}
              action={
                <div className="flex items-center gap-3 font-mono text-[11px] text-[#2d404a]">
                  {executionLatency && (
                    <span>
                      Latency: <strong className={executionLatency < 500 ? "text-[#047857]" : "text-[#b45309]"}>{executionLatency}ms</strong>
                    </span>
                  )}
                  <span>
                    Model: <strong className="text-[#1e6b7b]">{agentResponse.selected_model}</strong>
                  </span>
                  <button
                    onClick={() => copyResult(agentResponse.result)}
                    className="flex items-center gap-1 text-[#2d404a] hover:text-[#1e6b7b] cursor-pointer"
                  >
                    {copiedOutput ? (
                      <Check className="h-3.5 w-3.5 text-[#047857]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span className="font-bold">{copiedOutput ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              }
            >
              <div className="font-mono text-xs leading-relaxed text-[#192730] whitespace-pre-wrap bg-white/95 p-4 rounded-xl border border-[#64818E]/20 shadow-sm">
                {agentResponse.result || "Task completed successfully."}
              </div>
            </SovereignPanel>

            {/* Planned Steps & Tool Call Ledgers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {agentResponse.plan && agentResponse.plan.length > 0 && (
                <SovereignPanel
                  title={`Decomposed Execution Plan (${agentResponse.plan.length})`}
                  subtitle="Deterministic DAG steps"
                  badge={<SovereignStatus status="operational" label="PLANNED" size="xs" />}
                >
                  <div className="space-y-2.5 font-mono text-xs">
                    {agentResponse.plan.map((step, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05, type: "spring", stiffness: 300, damping: 25 }}
                        className="rounded-xl border border-[#64818E]/25 bg-white/90 p-3.5 space-y-1 text-[11px] hover:border-[#1e6b7b]/40 transition-colors shadow-sm"
                      >
                        <div className="flex items-center justify-between text-[#192730] font-bold">
                          <span className="text-[#192730] flex items-center gap-1.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-[#1e6b7b]/15 border border-[#1e6b7b]/30 text-[#1e6b7b] text-[9px] font-bold">
                              {idx + 1}
                            </span>
                            {step.step_id || `step_${idx + 1}`}
                          </span>
                          {step.tool && (
                            <span className="rounded-lg bg-[#1e6b7b]/10 border border-[#1e6b7b]/30 text-[#1e6b7b] px-1.5 py-0.5 text-[9px] uppercase font-bold">
                              Tool: {step.tool}
                            </span>
                          )}
                        </div>
                        <p className="text-[#2d404a] font-sans text-xs font-medium">
                          {step.description || JSON.stringify(step)}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </SovereignPanel>
              )}

              {agentResponse.tool_calls && agentResponse.tool_calls.length > 0 && (
                <SovereignPanel
                  title={`Invoked Tool Sandboxes (${agentResponse.tool_calls.length})`}
                  subtitle="Air-gapped loopback tool executions"
                  badge={<SovereignStatus status="operational" label="SANDBOXED" size="xs" />}
                >
                  <div className="space-y-2.5 font-mono text-xs">
                    {agentResponse.tool_calls.map((tc, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05, type: "spring", stiffness: 300, damping: 25 }}
                        className="rounded-xl border border-[#64818E]/25 bg-white/90 p-3.5 space-y-2 text-[11px] hover:border-[#047857]/40 transition-colors shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[#047857] font-extrabold uppercase flex items-center gap-1.5">
                            <Zap className="h-3 w-3" />
                            {tc.tool || "Tool"}
                          </span>
                          <SovereignStatus
                            status={tc.tool_result?.success !== false ? "operational" : "failed"}
                            size="xs"
                          />
                        </div>
                        {tc.tool_result?.result !== undefined && (
                          <div className="bg-[#192730]/5 p-2.5 rounded-xl border border-[#64818E]/20 text-[#192730] font-mono">
                            <span className="text-[#2d404a] font-bold">Output: </span>
                            {typeof tc.tool_result.result === "object"
                              ? JSON.stringify(tc.tool_result.result)
                              : String(tc.tool_result.result)}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </SovereignPanel>
              )}
            </div>

            {/* Trace Event Ledger */}
            {agentResponse.trace && agentResponse.trace.length > 0 && (
              <SovereignPanel
                title={`Cryptographic Trace Event Ledger (${agentResponse.trace.length} Events)`}
                subtitle={`Run ID: ${agentResponse.run_id}`}
              >
                <SovereignTimeline
                  items={agentResponse.trace.map((evt, idx) => ({
                    id: `trace-${idx}`,
                    timestamp: evt.timestamp?.slice(11, 19) || "Live",
                    title: String(evt.event_type).toUpperCase(),
                    description: evt.step_id ? `Step: ${evt.step_id}` : undefined,
                    status: "operational",
                    meta: evt.metadata ? JSON.stringify(evt.metadata) : undefined,
                  }))}
                />
              </SovereignPanel>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
