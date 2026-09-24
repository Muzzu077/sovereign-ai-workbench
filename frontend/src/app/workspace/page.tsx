"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import AppShell from "@/components/shell/AppShell";
import { ChatMessage, Composer } from "@/components/workspace";
import {
  uploadFile,
  analyzeDocument,
  queryKnowledge,
  runAgent,
  testModelInference,
} from "@/lib/api/client";
import type {
  Citation,
  EvidenceQuality,
  TraceEvent,
  PlanStepItem,
  ToolCallItem,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";
import {
  FileSearch,
  Search,
  Bot,
  Sparkles,
  Shield,
  HardDrive,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  evidenceQuality?: EvidenceQuality;
  model?: string;
  provider?: string;
  retrievalTime?: number;
  generationTime?: number;
  totalTime?: number;
  tokensUsed?: number | null;
  fallbackUsed?: boolean;
  trace?: TraceEvent[];
  plan?: PlanStepItem[];
  toolCalls?: ToolCallItem[];
  verification?: Record<string, unknown>;
  attachments?: { name: string; type: string; size: number }[];
  timestamp: string;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Empty state suggestions ────────────────────────────────────────────

const SUGGESTIONS = [
  {
    label: "Analyze a document",
    prompt: "Analyze an inspection report for key findings and risks",
    icon: FileSearch,
    mode: "analyze",
  },
  {
    label: "Search knowledge",
    prompt: "Search knowledge base for maintenance procedures",
    icon: Search,
    mode: "knowledge",
  },
  {
    label: "Run an agent task",
    prompt: "Summarize all uploaded documents and compare findings",
    icon: Bot,
    mode: "agent",
  },
];

const CAPABILITIES = [
  { icon: HardDrive, text: "100% local inference" },
  { icon: Shield, text: "Air-gapped capable" },
  { icon: Sparkles, text: "Evidence-grounded answers" },
];

// ── AI Working Indicator ───────────────────────────────────────────────

function WorkingIndicator() {
  return (
    <div className="flex items-start gap-3 max-w-3xl mx-auto">
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-wb-accent-subtle)] border border-[var(--color-wb-accent-muted)]">
          <span className="text-[10px] font-bold text-[var(--color-wb-accent)]">AI</span>
        </div>
      </div>

      {/* Thinking dots */}
      <div className="flex items-center gap-2 pt-2">
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-wb-accent)] animate-typing-dot" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-wb-accent)] animate-typing-dot" style={{ animationDelay: "160ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-wb-accent)] animate-typing-dot" style={{ animationDelay: "320ms" }} />
        </div>
        <span className="text-[12px] text-[var(--color-wb-text-muted)] ml-1">
          Processing...
        </span>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = useCallback(
    async (text: string, files: File[], mode: string) => {
      if (loading) return;

      const attachments = files.map((f) => ({
        name: f.name,
        type: f.name.split(".").pop()?.toLowerCase() || "unknown",
        size: f.size,
      }));

      const userMsg: Message = {
        id: makeId(),
        role: "user",
        content: text || (files.length > 0 ? `Analyze ${files.map((f) => f.name).join(", ")}` : ""),
        attachments: attachments.length > 0 ? attachments : undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        // Upload files
        const uploadedIds: string[] = [];
        for (const file of files) {
          try {
            const result = await uploadFile(file);
            uploadedIds.push(result.document_id);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Upload failed";
            setMessages((prev) => [
              ...prev,
              {
                id: makeId(),
                role: "assistant",
                content: `Failed to upload ${file.name}: ${errMsg}`,
                timestamp: new Date().toISOString(),
              },
            ]);
          }
        }

        // Route based on mode
        let assistantMsg: Message;

        if (mode === "analyze" && uploadedIds.length > 0) {
          const results = [];
          for (const docId of uploadedIds) {
            try {
              const analysis = await analyzeDocument(docId);
              results.push(analysis);
            } catch (err) {
              results.push({
                document_id: docId,
                summary: `Analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`,
                key_findings: [],
                risks: [],
                action_items: [],
              });
            }
          }

          const content = results
            .map((r) => {
              let out = r.summary;
              if (r.key_findings.length > 0)
                out += "\n\n## Key Findings\n" + r.key_findings.map((f) => `- ${f}`).join("\n");
              if (r.risks.length > 0)
                out += "\n\n## Risks\n" + r.risks.map((r) => `- ${r}`).join("\n");
              if (r.action_items.length > 0)
                out += "\n\n## Action Items\n" + r.action_items.map((a) => `- ${a}`).join("\n");
              return out;
            })
            .join("\n\n---\n\n");

          assistantMsg = {
            id: makeId(),
            role: "assistant",
            content,
            timestamp: new Date().toISOString(),
          };
        } else if (mode === "knowledge") {
          const response = await queryKnowledge({ query: text, top_k: 5 });
          assistantMsg = {
            id: makeId(),
            role: "assistant",
            content: response.answer,
            citations: response.citations,
            evidenceQuality: response.evidence_quality,
            model: response.model_used,
            provider: "local",
            retrievalTime: response.retrieval_time_ms,
            generationTime: response.generation_time_ms,
            totalTime: response.total_time_ms,
            timestamp: new Date().toISOString(),
          };
        } else if (mode === "agent") {
          const response = await runAgent({ task: text });
          assistantMsg = {
            id: makeId(),
            role: "assistant",
            content: response.result,
            model: response.selected_model,
            provider: response.provider,
            trace: response.trace,
            plan: response.plan,
            toolCalls: response.tool_calls,
            verification: response.verification,
            timestamp: new Date().toISOString(),
          };
        } else {
          if (uploadedIds.length > 0) {
            const results = [];
            for (const docId of uploadedIds) {
              try {
                const analysis = await analyzeDocument(docId);
                results.push(analysis);
              } catch {
                /* skip */
              }
            }
            const content =
              results.length > 0
                ? results
                    .map((r) => {
                      let out = r.summary;
                      if (r.key_findings.length > 0)
                        out += "\n\n## Key Findings\n" + r.key_findings.map((f) => `- ${f}`).join("\n");
                      if (r.risks.length > 0)
                        out += "\n\n## Risks\n" + r.risks.map((r) => `- ${r}`).join("\n");
                      if (r.action_items.length > 0)
                        out += "\n\n## Action Items\n" + r.action_items.map((a) => `- ${a}`).join("\n");
                      return out;
                    })
                    .join("\n\n---\n\n")
                : "Documents uploaded successfully but analysis was not available.";

            assistantMsg = {
              id: makeId(),
              role: "assistant",
              content,
              timestamp: new Date().toISOString(),
            };
          } else {
            const response = await testModelInference({
              prompt: text,
              model_name: "general",
            });
            assistantMsg = {
              id: makeId(),
              role: "assistant",
              content: response.text,
              model: response.model_name,
              provider: response.provider,
              tokensUsed: response.tokens_used,
              fallbackUsed: response.fallback_used,
              timestamp: new Date().toISOString(),
            };
          }
        }

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            content: `Error: ${err instanceof Error ? err.message : "Request failed. Check that the backend is running on port 8000."}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  const isEmpty = messages.length === 0;

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        {/* ── Conversation / Empty state ─────────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {isEmpty ? (
            /* ── Empty state ──────────────────────────────────────────── */
            <div className="flex h-full flex-col items-center justify-center px-6">
              <div className="w-full max-w-2xl">
                {/* Hero header */}
                <div className="text-center mb-8">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-wb-accent-subtle)] border border-[var(--color-wb-accent-muted)] mb-4">
                    <Sparkles size={22} className="text-[var(--color-wb-accent)]" />
                  </div>
                  <h1 className="text-xl font-semibold text-[var(--color-wb-text)] tracking-tight">
                    Sovereign AI Workbench
                  </h1>
                  <p className="mt-2 text-sm text-[var(--color-wb-text-muted)] max-w-md mx-auto leading-relaxed">
                    Upload documents, query your knowledge base, or run agent
                    tasks. All inference runs locally on your hardware.
                  </p>

                  {/* Capability pills */}
                  <div className="flex items-center justify-center gap-3 mt-4">
                    {CAPABILITIES.map((cap) => {
                      const Icon = cap.icon;
                      return (
                        <span
                          key={cap.text}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium text-[var(--color-wb-text-muted)] bg-[var(--color-wb-bg-inset)] border border-[var(--color-wb-border-subtle)]"
                        >
                          <Icon size={11} />
                          {cap.text}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Hero Composer */}
                <Composer onSend={handleSend} disabled={loading} hero />

                {/* Suggestion chips */}
                <div className="flex flex-wrap justify-center gap-2 mt-5">
                  {SUGGESTIONS.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => handleSend(s.prompt, [], s.mode)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border wb-card-interactive px-3 py-2",
                          "bg-[var(--color-wb-surface)]",
                          "text-[12px] text-[var(--color-wb-text-secondary)]",
                        )}
                      >
                        <Icon size={13} className="text-[var(--color-wb-text-faint)]" />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* ── Conversation ─────────────────────────────────────────── */
            <div className="px-6 py-6">
              <div className="mx-auto max-w-3xl space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id} className="group animate-message-in">
                    <ChatMessage
                      role={msg.role}
                      content={msg.content}
                      citations={msg.citations}
                      evidenceQuality={msg.evidenceQuality}
                      model={msg.model}
                      provider={msg.provider}
                      retrievalTime={msg.retrievalTime}
                      generationTime={msg.generationTime}
                      totalTime={msg.totalTime}
                      tokensUsed={msg.tokensUsed}
                      fallbackUsed={msg.fallbackUsed}
                      trace={msg.trace}
                      plan={msg.plan}
                      toolCalls={msg.toolCalls}
                      verification={msg.verification}
                      attachments={msg.attachments}
                      timestamp={msg.timestamp}
                    />
                  </div>
                ))}

                {loading && <WorkingIndicator />}
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom composer (only in conversation mode) ─────────── */}
        {!isEmpty && (
          <div className="border-t border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] px-6 py-4">
            <div className="mx-auto max-w-3xl">
              <Composer onSend={handleSend} disabled={loading} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
