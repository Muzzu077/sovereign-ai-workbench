/**
 * HTTP client for the Sovereign AI Workbench backend.
 */

import type {
  RootInfo,
  HealthResponse,
  FileUploadResponse,
  FileListResponse,
  FileInfoResponse,
  DeleteResponse,
  AnalysisResult,
  IngestResponse,
  SearchRequest,
  SearchResponse,
  QueryRequest,
  QueryResponse,
  KnowledgeDocument,
  DeleteKnowledgeResponse,
  AgentRunRequest,
  AgentRunResponse,
  ModelInfo,
  RawModelsResponse,
  ModelHealthInfo,
  RawModelsHealthResponse,
  ModelInferenceRequest,
  ModelInferenceResponse,
  ExecuteRequest,
  ExecuteResponse,
  ExecutionHealth,
  CodeGenRequest,
  CodeGenHealth,
  ExportRequest,
  ApprovalNoteResult,
  LogsResponse,
  LogStats,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : typeof body === "string"
        ? body
        : statusText;
    super(`[${status}] ${detail}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      throw new ApiError(res.status, res.statusText, body);
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new Error(
      `Network connection to Sovereign Backend failed (${url}). Ensure backend is active on port 8000.`
    );
  }
}

function json<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Root / Health
// ---------------------------------------------------------------------------

export function getRoot(): Promise<RootInfo> {
  return request<RootInfo>("/");
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export function uploadFile(file: File): Promise<FileUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return request<FileUploadResponse>("/files/upload", {
    method: "POST",
    body: form,
  });
}

export function listFiles(): Promise<FileListResponse> {
  return request<FileListResponse>("/files/");
}

export function getFile(documentId: string): Promise<FileInfoResponse> {
  return request<FileInfoResponse>(`/files/${encodeURIComponent(documentId)}`);
}

export function deleteFile(documentId: string): Promise<DeleteResponse> {
  return request<DeleteResponse>(`/files/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Documents (analysis)
// ---------------------------------------------------------------------------

export function analyzeDocument(documentId: string): Promise<AnalysisResult> {
  return request<AnalysisResult>(
    `/documents/${encodeURIComponent(documentId)}/analyze`,
    { method: "POST" }
  );
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export function ingestDocument(documentId: string): Promise<IngestResponse> {
  return request<IngestResponse>(
    `/knowledge/ingest/${encodeURIComponent(documentId)}`,
    { method: "POST" }
  );
}

export function searchKnowledge(body: SearchRequest): Promise<SearchResponse> {
  return json<SearchResponse>("/knowledge/search", body);
}

export function queryKnowledge(body: QueryRequest): Promise<QueryResponse> {
  return json<QueryResponse>("/knowledge/query", body);
}

export function listKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  return request<KnowledgeDocument[]>("/knowledge/documents");
}

export function deleteKnowledgeDocument(
  documentId: string
): Promise<DeleteKnowledgeResponse> {
  return request<DeleteKnowledgeResponse>(
    `/knowledge/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" }
  );
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export function runAgent(body: AgentRunRequest): Promise<AgentRunResponse> {
  return json<AgentRunResponse>("/agent/run", body);
}

// ---------------------------------------------------------------------------
// Models (normalized)
// ---------------------------------------------------------------------------

export async function listModels(): Promise<ModelInfo[]> {
  const raw = await request<RawModelsResponse>("/models/");
  if (!raw || !raw.models) return [];
  return Object.entries(raw.models).map(([name, data]) => ({
    name,
    provider_name: data.provider_name,
    provider_type: data.provider_type,
    available: data.available,
    local: data.local,
    base_url: data.base_url,
    capabilities: data.capabilities,
  }));
}

export async function getModelsHealth(): Promise<ModelHealthInfo[]> {
  const raw = await request<RawModelsHealthResponse>("/models/health");
  return raw.models || [];
}

export function testModelInference(
  body: ModelInferenceRequest
): Promise<ModelInferenceResponse> {
  return json<ModelInferenceResponse>("/models/inference", body);
}

// ---------------------------------------------------------------------------
// Code Execution (Sandbox)
// ---------------------------------------------------------------------------

export function executeCode(body: ExecuteRequest): Promise<ExecuteResponse> {
  return json<ExecuteResponse>("/execution/run", body);
}

export function getExecutionHealth(): Promise<ExecutionHealth> {
  return request<ExecutionHealth>("/execution/health");
}

/**
 * Returns the WebSocket URL for streaming code execution output.
 * Meant to be connected from xterm.js.
 */
export function getExecutionWsUrl(): string {
  const wsBase = BASE_URL.replace(/^http/, "ws");
  return `${wsBase}/execution/stream`;
}

// ---------------------------------------------------------------------------
// Code Generation (SSE streaming)
// ---------------------------------------------------------------------------

export function getCodeGenHealth(): Promise<CodeGenHealth> {
  return request<CodeGenHealth>("/codegen/health");
}

/**
 * Stream code generation from the local LLM via SSE.
 * Returns an EventSource-compatible URL + body for POST SSE.
 * Use fetchEventSource or manual fetch with ReadableStream.
 */
export async function* streamCodeGen(
  body: CodeGenRequest
): AsyncGenerator<{ event: string; data: string }, void, unknown> {
  const url = `${BASE_URL}/codegen/generate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Code generation request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (data) yield { event, data };
    }
  }
}

// ---------------------------------------------------------------------------
// Studio / Export
// ---------------------------------------------------------------------------

/**
 * Export markdown content to DOCX. Returns a Blob for download.
 */
export async function exportToDocx(body: ExportRequest): Promise<Blob> {
  const url = `${BASE_URL}/studio/export`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status}`);
  }
  return res.blob();
}

// ---------------------------------------------------------------------------
// Approval Workflow
// ---------------------------------------------------------------------------

export async function runApprovalWorkflow(
  documentId: string,
  title?: string,
  instructions?: string,
): Promise<ApprovalNoteResult> {
  const form = new FormData();
  form.append("document_id", documentId);
  if (title) form.append("title", title);
  if (instructions) form.append("instructions", instructions);

  return request<ApprovalNoteResult>("/workflows/approval-note", {
    method: "POST",
    body: form,
  });
}

export function downloadApprovalNote(documentId: string): string {
  return `${BASE_URL}/workflows/approval-note/${encodeURIComponent(documentId)}/download`;
}

// ---------------------------------------------------------------------------
// Streaming Chat (SSE)
// ---------------------------------------------------------------------------

export async function* streamChat(
  body: { messages: Array<{ role: string; content: string }>; max_tokens?: number; temperature?: number }
): AsyncGenerator<{ event: string; data: string }, void, unknown> {
  const url = `${BASE_URL}/chat/stream`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat stream request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (data) yield { event, data };
    }
  }
}

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

export function listLogs(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  category?: string;
}): Promise<LogsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  if (params?.status) sp.set("status", params.status);
  if (params?.category) sp.set("category", params.category);
  const qs = sp.toString();
  return request<LogsResponse>(`/logs${qs ? `?${qs}` : ""}`);
}

export function getLogStats(): Promise<LogStats> {
  return request<LogStats>("/logs/stats");
}
