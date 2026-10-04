"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import AppShell from "@/components/shell/AppShell";
import { ChatMessage, Composer, ArtifactInspector } from "@/components/workspace";
import {
  uploadFile,
  analyzeDocument,
  queryKnowledge,
  runAgent,
  testModelInference,
  streamChat,
} from "@/lib/api/client";
import type {
  Citation,
  EvidenceQuality,
  TraceEvent,
  PlanStepItem,
  ToolCallItem,
} from "@/lib/api/types";
import { cn, downloadFile } from "@/lib/utils";
import {
  FileSearch,
  Search,
  Bot,
  Sparkles,
  Shield,
  HardDrive,
  Code2,
  Cpu,
  ArrowRight,
  Plus,
  Trash2,
  Clock,
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  Layers,
  Zap,
  Download,
  Share2,
  FileText,
  Sliders,
  Check,
  Search as SearchIcon,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { DecryptedText } from "@/components/ui/DecryptedText";
import { BackgroundGrid } from "@/components/ui/BackgroundGrid";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

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

interface SavedSession {
  id: string;
  title: string;
  timestamp: string;
  messageCount: number;
  messages: Message[];
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Empty state suggestions ────────────────────────────────────────────

const STARTER_CATEGORIES = [
  {
    title: "Document Intelligence",
    icon: FileSearch,
    color: "from-cyan-500/20 to-blue-500/10",
    items: [
      {
        label: "Extract Risk & Compliance Matrix",
        prompt: "Analyze the uploaded compliance audit report and summarize top risk findings in order of severity with remediation steps.",
        mode: "analyze",
      },
      {
        label: "Executive Briefing Synthesis",
        prompt: "Draft a concise 1-page executive note synthesizing key deliverables, risks, and strategic milestones.",
        mode: "analyze",
      },
    ],
  },
  {
    title: "Knowledge Base Vector RAG",
    icon: Search,
    color: "from-teal-500/20 to-emerald-500/10",
    items: [
      {
        label: "Query Air-Gap Maintenance Protocol",
        prompt: "What are the standard operating procedures and security protocols for air-gapped system maintenance?",
        mode: "knowledge",
      },
      {
        label: "Data Retention & Encryption Search",
        prompt: "Find all policy citations related to local zero-retention, cryptographic signing, and hash verification.",
        mode: "knowledge",
      },
    ],
  },
  {
    title: "Autonomous Agent Task",
    icon: Bot,
    color: "from-indigo-500/20 to-purple-500/10",
    items: [
      {
        label: "Multi-Source Synthesizer Pipeline",
        prompt: "Execute multi-step inspection: index all vector store documents, cross-reference policy regulations, and produce verification evidence.",
        mode: "agent",
      },
    ],
  },
];

const CAPABILITIES = [
  { icon: HardDrive, text: "100% On-Device Inference" },
  { icon: Shield, text: "Zero Telemetry & Air-Gapped" },
  { icon: Sparkles, text: "Grounded Vector Citations" },
];

// ── Working Indicator ───────────────────────────────────────────────────

function WorkingIndicator() {
  return (
    <div className="flex items-start gap-3.5 max-w-2xl animate-fade-in">
      <div className="shrink-0 mt-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 border border-cyan-300/40 text-white shadow-[0_0_16px_rgba(6,182,212,0.3)]">
          <Sparkles size={15} className="animate-spin-smooth" />
        </div>
      </div>
      <div className="flex items-center gap-2.5 py-3 px-4 rounded-2xl bg-slate-900/90 border border-white/10 shadow-lg backdrop-blur-xl">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" style={{ animationDuration: "1.2s" }} />
          <span className="h-2 w-2 rounded-full bg-teal-400" />
          <span className="h-2 w-2 rounded-full bg-indigo-400" />
        </div>
        <span className="text-xs font-mono text-slate-300 ml-1">
          Local neural engine reasoning & synthesizing...
        </span>
      </div>
    </div>
  );
}

// ── Workspace Page ──────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleNewChat = () => {
    if (messages.length > 0) {
      const firstMsg = messages.find((m) => m.role === "user");
      const title = firstMsg ? firstMsg.content.slice(0, 36) + "..." : "Untitled Session";
      setSessions((prev) => [
        {
          id: makeId(),
          title,
          timestamp: new Date().toISOString(),
          messageCount: messages.length,
          messages: [...messages],
        },
        ...prev,
      ]);
    }
    setMessages([]);
    setSelectedCitation(null);
  };

  const handleExport = (format: "md" | "json") => {
    if (messages.length === 0) return;
    if (format === "json") {
      downloadFile(
        JSON.stringify(messages, null, 2),
        `sovereign-chat-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json",
      );
    } else {
      let md = `# Sovereign AI Intelligence Session\n*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
      messages.forEach((m) => {
        md += `### ${m.role === "user" ? "👤 User" : "🤖 Assistant"}\n*${m.timestamp}*\n\n${m.content}\n\n`;
        if (m.citations && m.citations.length > 0) {
          md += `**Citations:**\n` + m.citations.map((c) => `- [${c.document_id || "doc"}] ${c.document} (${c.section || "General"})`).join("\n") + "\n\n";
        }
        md += `---\n\n`;
      });
      downloadFile(md, `sovereign-chat-${new Date().toISOString().slice(0, 10)}.md`, "text/markdown");
    }
  };

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
                out += "\n\n## Risks & Vulnerabilities\n" + r.risks.map((r) => `- ${r}`).join("\n");
              if (r.action_items.length > 0)
                out += "\n\n## Recommended Action Items\n" + r.action_items.map((a) => `- ${a}`).join("\n");
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
          // Direct LLM chat with SSE streaming
          const streamMsgId = makeId();
          let streamContent = "";
          let tokenCount = 0;

          // Placeholder
          setMessages((prev) => [
            ...prev,
            {
              id: streamMsgId,
              role: "assistant",
              content: "",
              model: "general",
              provider: "llama_cpp",
              timestamp: new Date().toISOString(),
            },
          ]);

          try {
            const chatMessages = messages.map((m) => ({
              role: m.role,
              content: m.content,
            }));
            chatMessages.push({ role: "user", content: text });

            for await (const { event, data } of streamChat({
              messages: chatMessages,
            })) {
              if (event === "token") {
                streamContent += JSON.parse(data);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamMsgId
                      ? { ...m, content: streamContent }
                      : m,
                  ),
                );
              } else if (event === "done") {
                const info = JSON.parse(data);
                tokenCount = info.tokens ?? 0;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamMsgId
                      ? { ...m, tokensUsed: tokenCount }
                      : m,
                  ),
                );
              } else if (event === "error") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamMsgId
                      ? { ...m, content: `Error: ${JSON.parse(data)}` }
                      : m,
                  ),
                );
              }
            }
          } catch (err) {
            // Fallback non-streaming
            const response = await testModelInference({
              prompt: text,
              model_name: "general",
            });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId
                  ? {
                      ...m,
                      content: response.text,
                      model: response.model_name,
                      provider: response.provider,
                      tokensUsed: response.tokens_used,
                      fallbackUsed: response.fallback_used,
                    }
                  : m,
              ),
            );
          }

          setLoading(false);
          return;
        }

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            content: `Error: ${err instanceof Error ? err.message : "Request failed. Check that the backend is running."}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages],
  );

  const isEmpty = messages.length === 0;

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <AppShell>
      <div className="relative flex h-full overflow-hidden bg-[#070a12]">
        {/* Ambient background dots */}
        <BackgroundGrid variant="dots" opacity={0.04} />

        {/* ── Left Sessions Drawer (Collapsible) ───────────────────────── */}
        <div
          className={cn(
            "border-r border-white/[0.08] bg-slate-950/80 backdrop-blur-2xl flex flex-col transition-all duration-300 z-20 shadow-2xl",
            sessionDrawerOpen ? "w-72" : "w-0 overflow-hidden border-r-0",
          )}
        >
          <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock size={13} className="text-cyan-400" />
              <span>Session History</span>
            </span>
            <button
              onClick={() => setSessionDrawerOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
          </div>

          <div className="p-3 space-y-2.5">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold shadow-[0_0_16px_rgba(6,182,212,0.3)] transition-all cursor-pointer"
            >
              <Plus size={14} strokeWidth={2.4} />
              <span>New Conversation</span>
            </button>

            {/* Session Search */}
            <div className="relative">
              <SearchIcon size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search discussions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl bg-slate-900/90 border border-white/10 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500/40 transition-colors font-sans"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1.5">
            {filteredSessions.map((sess) => (
              <button
                key={sess.id}
                onClick={() => {
                  if (sess.messages && sess.messages.length > 0) {
                    setMessages(sess.messages);
                  }
                }}
                className="w-full text-left p-3 rounded-xl hover:bg-slate-900/80 border border-transparent hover:border-cyan-500/20 transition-all group cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 truncate">
                  {sess.title}
                </div>
                <div className="text-[10px] text-slate-500 mt-1 font-mono flex items-center justify-between">
                  <span>{sess.timestamp}</span>
                  <span className="bg-slate-800/80 px-1.5 py-0.2 rounded border border-white/5">{sess.messageCount} msgs</span>
                </div>
              </button>
            ))}
          </div>

          <div className="p-3.5 border-t border-white/[0.08] bg-slate-950/90 text-[10px] font-mono text-slate-400 flex items-center justify-between">
            <span>Storage: SQLite WAL</span>
            <span className="text-emerald-400 font-bold">100% Encrypted Local</span>
          </div>
        </div>

        {/* ── Center Main Workspace Canvas ────────────────────────────── */}
        <div className="relative flex flex-1 flex-col min-w-0 h-full overflow-hidden">
          {/* Top Canvas Control Bar */}
          <div className="flex items-center justify-between px-6 py-2.5 border-b border-white/[0.08] bg-slate-950/60 backdrop-blur-xl z-10">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setSessionDrawerOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-slate-900/80 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-all cursor-pointer shadow-xs"
                title="Toggle sessions list"
              >
                <PanelLeft size={13} className="text-cyan-400" />
                <span>{sessionDrawerOpen ? "Hide Sessions" : "Sessions"}</span>
              </button>

              <button
                onClick={handleNewChat}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors cursor-pointer"
              >
                <Plus size={13} />
                <span>New Thread</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Export Button */}
              {!isEmpty && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleExport("md")}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white hover:border-cyan-500/30 text-[11px] font-semibold transition-all cursor-pointer shadow-xs"
                    title="Export conversation as Markdown"
                  >
                    <Download size={12} className="text-cyan-400" />
                    <span>Markdown</span>
                  </button>
                  <button
                    onClick={() => handleExport("json")}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white hover:border-cyan-500/30 text-[11px] font-semibold transition-all cursor-pointer shadow-xs"
                    title="Export conversation as JSON"
                  >
                    <FileText size={12} className="text-teal-400" />
                    <span>JSON</span>
                  </button>
                </div>
              )}

              {/* Air-Gapped Thread Badge */}
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/30 font-mono text-[10px] tracking-wider uppercase">
                <Shield size={12} strokeWidth={2.4} />
                <span>AIR-GAPPED THREAD</span>
              </div>
            </div>
          </div>

          {/* Conversation / Empty State Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {isEmpty ? (
              /* ── Empty State Hero ─────────────────────────────────────── */
              <div className="flex min-h-full flex-col items-center justify-center px-6 py-10">
                <div className="w-full max-w-3xl space-y-8">
                  {/* Hero Header */}
                  <div className="text-center">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/10 border border-cyan-500/30 mb-4 shadow-[0_0_24px_rgba(6,182,212,0.2)]">
                      <Sparkles size={26} className="text-cyan-400" />
                    </div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-white">
                      <DecryptedText
                        text="Sovereign AI Intelligence Core"
                        speed={30}
                        maxIterations={12}
                      />
                    </h1>
                    <p className="mt-2 text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                      Zero telemetry, 100% air-gapped local inference. Query vector stores, extract compliance risks, and execute sandboxed agents.
                    </p>

                    {/* Capability Tags */}
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                      {CAPABILITIES.map((cap) => {
                        const Icon = cap.icon;
                        return (
                          <span
                            key={cap.text}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold text-slate-300 bg-slate-900/80 border border-white/10 shadow-xs"
                          >
                            <Icon size={12} className="text-cyan-400" />
                            <span>{cap.text}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Hero Composer Island */}
                  <div className="shadow-2xl rounded-2xl">
                    <Composer onSend={handleSend} disabled={loading} hero />
                  </div>

                  {/* Categorized Capability Starters */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block text-center">
                      Quick Capability Starters
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                      {STARTER_CATEGORIES.map((cat) => {
                        const Icon = cat.icon;
                        return (
                          <div
                            key={cat.title}
                            className="p-4 rounded-2xl border border-white/[0.08] bg-slate-900/60 backdrop-blur-xl space-y-3 shadow-md hover:border-cyan-500/30 transition-all"
                          >
                            <div className="flex items-center gap-2 text-xs font-bold text-white">
                              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                <Icon size={13} />
                              </div>
                              <span>{cat.title}</span>
                            </div>

                            <div className="space-y-2">
                              {cat.items.map((item) => (
                                <button
                                  key={item.label}
                                  onClick={() => handleSend(item.prompt, [], item.mode)}
                                  className="w-full text-left p-2.5 rounded-xl bg-slate-950/80 hover:bg-cyan-950/30 border border-white/5 hover:border-cyan-500/30 text-xs text-slate-300 hover:text-white transition-all group cursor-pointer"
                                >
                                  <div className="font-semibold flex items-center justify-between text-[11px]">
                                    <span className="group-hover:text-cyan-300">{item.label}</span>
                                    <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-cyan-400" />
                                  </div>
                                  <p className="text-[10px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                                    {item.prompt}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Conversation Stream ──────────────────────────────────── */
              <div className="px-6 py-6">
                <div className="mx-auto max-w-3xl space-y-6">
                  {messages.map((msg) => (
                    <div key={msg.id} className="animate-message-in">
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
                        onSelectCitation={(c) => setSelectedCitation(c)}
                        onFollowUp={(prompt) => handleSend(prompt, [], "ask")}
                      />
                    </div>
                  ))}

                  {loading && <WorkingIndicator />}
                </div>
              </div>
            )}
          </div>

          {/* ── Bottom Floating Composer (in conversation mode) ────────── */}
          {!isEmpty && (
            <div className="p-4 border-t border-white/[0.08] bg-slate-950/80 backdrop-blur-xl z-10">
              <div className="mx-auto max-w-3xl">
                <Composer onSend={handleSend} disabled={loading} />
              </div>
            </div>
          )}
        </div>

        {/* ── Right Artifact Inspector Drawer ─────────────────────────── */}
        {selectedCitation && (
          <ArtifactInspector
            citation={selectedCitation}
            onClose={() => setSelectedCitation(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
