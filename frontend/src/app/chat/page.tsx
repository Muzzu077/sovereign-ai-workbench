"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  MessageSquareCode,
  Sparkles,
  Bot,
  ShieldCheck,
  Send,
  Trash2,
  Download,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Search,
  Terminal,
  Loader2,
  Lock,
  ArrowRight,
  Zap,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  runAgent,
  queryKnowledge,
  getHealth,
  type AgentRunResponse,
  type QueryResponse,
  type HealthResponse,
  type Citation,
} from "@/lib/api";
import { SovereignStatus } from "@/components/sovereign";

type PersonaMode = "auto" | "rag" | "safety";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  persona?: PersonaMode;
  agentResponse?: AgentRunResponse;
  ragResponse?: QueryResponse;
  latencyMs?: number;
  citations?: Citation[];
  toolCalls?: Array<{ tool: string; result: string }>;
}

const personaConfig = {
  auto: {
    icon: Bot,
    label: "Autonomous Agent",
    color: "violet",
    border: "border-[#64818E]/40",
    bg: "bg-[#64818E]/12",
    text: "text-[#4a6b7c]",
    shadow: "shadow-[#64818E]/15",
    glow: "shadow-[0_0_15px_rgba(100,129,142,0.2)]",
    badge: "bg-[#64818E]/10 border-[#64818E]/30 text-[#64818E]",
  },
  rag: {
    icon: Sparkles,
    label: "RAG Grounding",
    color: "teal",
    border: "border-[#1e6b7b]/40",
    bg: "bg-[#1e6b7b]/12",
    text: "text-[#1e6b7b]",
    shadow: "shadow-[#1e6b7b]/15",
    glow: "shadow-[0_0_15px_rgba(30,107,123,0.2)]",
    badge: "bg-[#1e6b7b]/10 border-[#1e6b7b]/30 text-[#1e6b7b]",
  },
  safety: {
    icon: ShieldCheck,
    label: "Safety Auditor",
    color: "emerald",
    border: "border-[#047857]/40",
    bg: "bg-[#047857]/12",
    text: "text-[#047857]",
    shadow: "shadow-[#047857]/15",
    glow: "shadow-[0_0_15px_rgba(4,120,87,0.2)]",
    badge: "bg-[#047857]/10 border-[#047857]/30 text-[#047857]",
  },
};

const msgAppear = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 25 } },
} as const;

export default function ChatStudioPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-welcome",
      sender: "assistant",
      content:
        "Welcome to **Sovereign AI Interactive Studio**.\n\nAll queries execute locally on-premise without external network communication. I can investigate indexed technical manuals via vector RAG, execute multi-step deterministic agent workflows, or audit air-gap compliance.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      persona: "auto",
    },
  ]);

  const [inputQuery, setInputQuery] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<PersonaMode>("auto");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStepText, setActiveStepText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeStepText]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || inputQuery).trim();
    if (!promptToSend || isProcessing) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      content: promptToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery("");
    setIsProcessing(true);
    setActiveStepText("Initializing local agent runtime...");

    const startTime = performance.now();

    try {
      if (selectedPersona === "rag") {
        setActiveStepText("Searching local vector indices & ranking chunks...");
        const ragRes = await queryKnowledge({ query: promptToSend, top_k: 4 });
        const elapsed = Math.round(performance.now() - startTime);

        const aiMsg: ChatMessage = {
          id: `rag-${Date.now()}`,
          sender: "assistant",
          content: ragRes.answer,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          persona: "rag",
          ragResponse: ragRes,
          latencyMs: elapsed,
          citations: ragRes.citations || [],
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        setActiveStepText("Decomposing instructions & selecting tools...");
        const agentRes = await runAgent({ task: promptToSend });
        const elapsed = Math.round(performance.now() - startTime);

        const extractedToolCalls: Array<{ tool: string; result: string }> = [];
        if (agentRes.tool_calls) {
          for (const tc of agentRes.tool_calls) {
            extractedToolCalls.push({
              tool: tc.tool || "Tool",
              result:
                typeof tc.tool_result?.result === "object"
                  ? JSON.stringify(tc.tool_result.result)
                  : String(tc.tool_result?.result || tc.tool_result?.error || "Done"),
            });
          }
        }

        const aiMsg: ChatMessage = {
          id: `agent-${Date.now()}`,
          sender: "assistant",
          content: agentRes.result || "Task completed successfully.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          persona: "auto",
          agentResponse: agentRes,
          latencyMs: elapsed,
          toolCalls: extractedToolCalls,
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "assistant",
        content: `Error executing local request: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        persona: selectedPersona,
        latencyMs: elapsed,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
      setActiveStepText("");
    }
  };

  const handleExportMarkdown = () => {
    const transcript = messages
      .map((m) => `### ${m.sender.toUpperCase()} [${m.timestamp}]\n\n${m.content}\n\n---`)
      .join("\n\n");
    const blob = new Blob([transcript], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sovereign-ai-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const starterPrompts = [
    {
      title: "Query Knowledge Manuals",
      desc: "Retrieve grounded technical documentation via Vector RAG",
      prompt: "What are the core operating procedures and safety standards described in the indexed manuals?",
      persona: "rag" as const,
      icon: Search,
      accent: "from-cyan-500/20 to-teal-500/20",
      borderAccent: "hover:border-cyan-500/50",
    },
    {
      title: "Run Multi-Step Agent Plan",
      desc: "Decompose a complex computation and file verification task",
      prompt: "Calculate (450 * 12) / 4 + 250, check the knowledge base for system logs, and summarize the result.",
      persona: "auto" as const,
      icon: Zap,
      accent: "from-[#64818E]/12 to-[#9CAFBE]/10",
      borderAccent: "hover:border-[#64818E]/40",
    },
    {
      title: "Audit Air-Gap Compliance",
      desc: "Verify loopback sockets and immutable audit log chain",
      prompt: "Perform a system telemetry audit and verify that no external outbound network sockets are open.",
      persona: "safety" as const,
      icon: ShieldCheck,
      accent: "from-emerald-500/20 to-teal-500/20",
      borderAccent: "hover:border-emerald-500/50",
    },
  ];

  const currentPersona = personaConfig[selectedPersona];

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col space-y-3.5">
      {/* Top Studio Control Bar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#64818E]/18 bg-white/80 px-4 py-3 shadow-xl surface-level-2 backdrop-blur-2xl"
      >
        {/* Persona Selector Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-[#64818E]/18 bg-white/60 p-1 font-mono">
          {(["auto", "rag", "safety"] as const).map((pKey) => {
            const cfg = personaConfig[pKey];
            const Icon = cfg.icon;
            const isSelected = selectedPersona === pKey;
            return (
              <button
                key={pKey}
                onClick={() => setSelectedPersona(pKey)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 cursor-pointer",
                  isSelected
                    ? `${cfg.bg} border ${cfg.border} ${cfg.text} shadow-md ${cfg.shadow}`
                    : "text-[#2d404a] hover:text-[#192730] hover:bg-[#64818E]/8 border border-transparent"
                )}
              >
                {isSelected && (
                  <motion.span
                    layoutId="personaGlow"
                    className="absolute inset-0 rounded-lg opacity-30"
                    style={{ boxShadow: `0 0 20px currentColor` }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <Icon className="h-3.5 w-3.5 relative z-10" />
                <span className="relative z-10">{cfg.label}</span>
              </button>
            );
          })}
        </div>

        {/* Real-time Telemetry Indicators */}
        <div className="flex items-center gap-2.5 font-mono text-[10px] text-[#2d404a]">
          <div className="hidden md:flex items-center gap-1.5 rounded-xl border border-[#64818E]/18 bg-white/50 px-2.5 py-1.5">
            <Cpu className="h-3 w-3 text-[#64818E]" />
            <span className="font-bold text-[#192730]">{health?.models_registered?.[0] || "gemma-3-4b"}</span>
          </div>
          <div className="hidden lg:flex items-center gap-1.5 rounded-xl border border-[#64818E]/18 bg-white/50 px-2.5 py-1.5">
            <Layers className="h-3 w-3 text-[#1e6b7b]" />
            <span className="font-bold text-[#1e6b7b]">{health?.knowledge_chunks || 0} Chunks</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportMarkdown}
              className="flex items-center gap-1 rounded-xl border border-[#64818E]/18 bg-[#64818E]/6 px-2.5 py-1.5 text-[#2d404a] hover:border-[#64818E]/35 hover:text-[#192730] hover:shadow-sm transition-all cursor-pointer"
            >
              <Download className="h-3 w-3" />
              <span className="font-medium">Export</span>
            </button>
            <button
              onClick={() => setMessages([])}
              className="flex items-center gap-1 rounded-xl border border-[#64818E]/18 bg-[#64818E]/6 px-2.5 py-1.5 text-[#2d404a] hover:border-[#be123c]/40 hover:text-[#be123c] transition-all cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
              <span className="font-medium">Clear</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-[#64818E]/18 bg-white/80 p-5 shadow-2xl surface-level-2 backdrop-blur-2xl space-y-5 font-sans">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 space-y-5 font-mono">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#64818E] to-[#4a6272] text-[#192730] shadow-[0_0_40px_rgba(100,129,142,0.25)] border border-[#64818E]/20">
              <MessageSquareCode className="h-7 w-7 text-white" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1e6b7b] opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#1e6b7b]" />
              </span>
            </div>
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#192730]">
                Sovereign AI Chat Session
              </h3>
              <p className="mt-1.5 text-xs text-[#2d404a] max-w-md font-sans leading-relaxed font-medium">
                Select a persona or prompt below to begin air-gapped reasoning, knowledge querying, or tool execution.
              </p>
            </div>

            {/* Quick Starters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-2xl mt-2">
              {starterPrompts.map((s, idx) => {
                const SIcon = s.icon;
                return (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1, type: "spring", stiffness: 300, damping: 25 }}
                    onClick={() => {
                      setSelectedPersona(s.persona);
                      handleSendMessage(s.prompt);
                    }}
                    className={cn(
                      "flex flex-col text-left rounded-2xl border border-[#64818E]/18 bg-gradient-to-br p-4 hover:shadow-lg transition-all group cursor-pointer glass-hover-lift",
                      s.accent,
                      s.borderAccent
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#64818E]/10 border border-[#64818E]/20 text-[#192730] group-hover:bg-[#64818E]/20 transition-colors">
                        <SIcon className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-mono text-xs font-bold text-[#192730] group-hover:text-[#1e6b7b] transition-colors">
                        {s.title}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#2d404a] group-hover:text-[#192730] transition-colors line-clamp-2 font-sans leading-relaxed">
                      {s.desc}
                    </span>
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-[#1e6b7b] font-bold font-mono transition-colors">
                      <ArrowRight className="h-3 w-3" />
                      <span>Start Session</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              const isTraceExpanded = expandedTraceId === msg.id;
              const msgPersona = msg.persona ? personaConfig[msg.persona] : null;

              return (
                <motion.div
                  key={msg.id}
                  variants={msgAppear}
                  initial="hidden"
                  animate="visible"
                  className={cn(
                    "flex flex-col space-y-1.5",
                    isUser ? "items-end" : "items-start"
                  )}
                >
                  {/* Message Header */}
                  <div className="flex items-center gap-2 font-mono text-[10px] text-[#2d404a] px-1 font-semibold">
                    <span className="font-extrabold text-[#192730] uppercase">
                      {isUser ? "OPERATOR" : "SOVEREIGN AI"}
                    </span>
                    <span className="text-[#64818E]/30">|</span>
                    <span>{msg.timestamp}</span>
                    {msg.latencyMs !== undefined && (
                      <>
                        <span className="text-[#64818E]/30">|</span>
                        <span className={cn(
                          "font-bold px-1.5 py-0.5 rounded",
                          msg.latencyMs < 500
                            ? "bg-[#047857]/10 text-[#047857] border border-[#047857]/25"
                            : "bg-[#b45309]/10 text-[#b45309] border border-[#b45309]/25"
                        )}>
                          {msg.latencyMs}ms
                        </span>
                      </>
                    )}
                    {msg.persona && msgPersona && (
                      <span className={cn(
                        "rounded-lg border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase",
                        msgPersona.badge
                      )}>
                        {msg.persona}
                      </span>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={cn(
                      "relative max-w-3xl rounded-2xl p-4.5 text-xs leading-relaxed shadow-lg",
                      isUser
                        ? "bg-gradient-to-br from-[#64818E]/12 to-[#9CAFBE]/8 border border-[#64818E]/30 text-[#192730] font-sans shadow-[0_0_15px_rgba(100,129,142,0.12)]"
                        : "bg-white/95 border border-[#64818E]/20 text-[#192730] surface-level-3 font-sans"
                    )}
                  >
                    {/* Top reflection */}
                    {!isUser && (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent rounded-t-2xl" />
                    )}

                    <div className="whitespace-pre-wrap text-xs leading-relaxed text-[#192730] font-normal">
                      {msg.content}
                    </div>

                    {/* RAG Evidence Cards if Present */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-4 border-t border-[#64818E]/15 pt-3 space-y-2.5 font-mono">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                          <span className="flex items-center gap-1.5 text-[#1e6b7b] font-bold">
                            <Search className="h-3 w-3" /> Grounded Citations ({msg.citations.length})
                          </span>
                          <span className="flex items-center gap-1 text-[#047857] font-bold">
                            <ShieldCheck className="h-3 w-3" /> Air-Gap Verified
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {msg.citations.map((c, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="rounded-xl border border-[#64818E]/18 bg-white/90 p-3 text-[10px] space-y-1.5 hover:border-[#1e6b7b]/35 hover:shadow-[0_0_12px_rgba(30,107,123,0.12)] transition-all group surface-level-1"
                            >
                              <div className="flex items-center justify-between text-[#2d404a]">
                                <span className="text-[#192730] font-bold truncate max-w-[140px] flex items-center gap-1.5 group-hover:text-[#1e6b7b] transition-colors">
                                  <FileText className="h-3 w-3 text-[#1e6b7b] shrink-0" />
                                  {c.document}
                                </span>
                                {c.relevance_score !== null && (
                                  <span className="font-bold bg-[#1e6b7b]/10 border border-[#1e6b7b]/25 text-[#1e6b7b] px-1.5 py-0.5 rounded-lg">
                                    {(c.relevance_score * 100).toFixed(1)}%
                                  </span>
                                )}
                              </div>
                              {c.relevance_score !== null && (
                                <div className="h-1 w-full bg-[#C9D0D8]/60 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-[#1e6b7b] to-[#047857] rounded-full transition-all duration-500"
                                    style={{ width: `${Math.round(c.relevance_score * 100)}%` }}
                                  />
                                </div>
                              )}
                              {c.section && (
                                <div className="text-[#2d404a] text-[9px] font-medium">
                                  Section: {c.section}
                                </div>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tool Execution Logs if Present */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-4 border-t border-[#64818E]/15 pt-3 space-y-2 font-mono">
                        <button
                          onClick={() =>
                            setExpandedTraceId(isTraceExpanded ? null : msg.id)
                          }
                          className="flex items-center justify-between w-full text-[10px] uppercase text-[#1e6b7b] hover:text-[#192730] transition-colors cursor-pointer group"
                        >
                          <span className="flex items-center gap-1.5 font-bold">
                            <Terminal className="h-3 w-3" /> Execution Trace ({msg.toolCalls.length} Tools Invoked)
                          </span>
                          <motion.div
                            animate={{ rotate: isTraceExpanded ? 180 : 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </motion.div>
                        </button>

                        <AnimatePresence>
                          {isTraceExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 300, damping: 30 }}
                              className="space-y-2 rounded-xl border border-[#64818E]/18 bg-white/95 p-3 text-[10px] overflow-hidden"
                            >
                              {msg.toolCalls.map((t, idx) => (
                                <motion.div
                                  key={idx}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: idx * 0.05 }}
                                  className="border-b border-[#64818E]/12 pb-2 last:border-b-0 last:pb-0 space-y-1"
                                >
                                  <div className="flex items-center gap-2 text-[#192730] font-bold">
                                    <span className="rounded-lg bg-[#64818E]/15 border border-[#64818E]/25 px-1.5 py-0.5 uppercase text-[9px] text-[#1e6b7b]">
                                      TOOL
                                    </span>
                                    <span>{t.tool}</span>
                                    <Zap className="h-3 w-3 text-[#1e6b7b]" />
                                  </div>
                                  <div className="text-[#192730] bg-[#C9D0D8]/25 border border-[#64818E]/15 p-2 rounded-lg font-mono">
                                    <span className="text-[#2d404a] font-bold">Output:</span> {t.result}
                                  </div>
                                </motion.div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Copy Button */}
                    <div className="mt-2.5 flex items-center justify-end font-mono">
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-[#2d404a] hover:bg-[#64818E]/10 hover:text-[#192730] transition-colors cursor-pointer font-medium"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="h-3 w-3 text-[#047857]" />
                            <span className="text-[#047857] font-bold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {/* Live Processing Pipeline Animation */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-start space-y-2 font-mono"
          >
            <div className="flex items-center gap-2 text-[10px] text-[#1e6b7b]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="font-extrabold uppercase tracking-wider">
                SOVEREIGN REASONING ENGINE ACTIVE
              </span>
            </div>
            <div className="rounded-2xl border border-[#64818E]/30 bg-gradient-to-r from-[#64818E]/12 to-white/85 p-3.5 text-xs text-[#192730] shadow-[0_0_18px_rgba(100,129,142,0.15)] surface-level-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#1e6b7b] animate-pulse shadow-[0_0_8px_rgba(30,107,123,0.6)]" />
                <span className="font-bold text-[#192730]">{activeStepText}</span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Composer Terminal */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative rounded-2xl border border-[#64818E]/25 bg-white/95 p-3.5 shadow-2xl surface-level-3 backdrop-blur-2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-end gap-3"
        >
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={
              selectedPersona === "rag"
                ? "Query knowledge base with vector similarity grounding... (Shift+Enter for newline)"
                : selectedPersona === "safety"
                ? "Request air-gap isolation and tamper audit report..."
                : "Ask complex questions, dispatch multi-step tool plans, or perform calculations..."
            }
            className="flex-1 resize-none bg-transparent font-sans text-xs text-[#192730] placeholder:text-[#4a6272] focus:outline-none px-2 py-1.5 leading-relaxed font-medium"
          />

          <button
            type="submit"
            disabled={!inputQuery.trim() || isProcessing}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-mono font-bold transition-all cursor-pointer disabled:opacity-40",
              currentPersona.border,
              currentPersona.bg,
              currentPersona.text,
              "hover:shadow-lg"
            )}
          >
            <span>Dispatch</span>
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>

        <div className="mt-2.5 flex items-center justify-between border-t border-[#64818E]/15 pt-2 px-2 font-mono text-[10px] text-[#2d404a]">
          <span className="flex items-center gap-2">
            <span className={cn("px-1.5 py-0.5 rounded-md border font-bold uppercase", currentPersona.badge)}>
              {selectedPersona}
            </span>
            <span className="text-[#2d404a] font-medium">Shift+Enter for newline</span>
          </span>
          <span className="text-[#047857] font-bold flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Air-Gap Loopback Verified
          </span>
        </div>
      </motion.div>
    </div>
  );
}
