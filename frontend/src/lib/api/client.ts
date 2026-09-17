/**
 * HTTP client for the Sovereign AI Workbench backend.
 *
 * All methods throw on non-2xx responses with a structured ApiError.
 * The base URL defaults to http://localhost:8000 and can be overridden
 * via NEXT_PUBLIC_API_URL.
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
  AgentRunRequest,
  AgentRunResponse,
  ModelInfo,
  ModelHealthInfo,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "http://localhost:8000";

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API ${status} ${statusText}`);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
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

  return res.json() as Promise<T>;
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
  return request<DeleteResponse>(
    `/files/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Documents (analysis)
// ---------------------------------------------------------------------------

export function analyzeDocument(
  documentId: string,
): Promise<AnalysisResult> {
  return request<AnalysisResult>(
    `/documents/${encodeURIComponent(documentId)}/analyze`,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export function ingestDocument(
  documentId: string,
): Promise<IngestResponse> {
  return request<IngestResponse>(
    `/knowledge/ingest/${encodeURIComponent(documentId)}`,
    { method: "POST" },
  );
}

export function searchKnowledge(
  body: SearchRequest,
): Promise<SearchResponse> {
  return json<SearchResponse>("/knowledge/search", body);
}

export function queryKnowledge(
  body: QueryRequest,
): Promise<QueryResponse> {
  return json<QueryResponse>("/knowledge/query", body);
}

export function listKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  return request<KnowledgeDocument[]>("/knowledge/documents");
}

export function deleteKnowledgeDocument(
  documentId: string,
): Promise<DeleteResponse> {
  return request<DeleteResponse>(
    `/knowledge/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export function runAgent(
  body: AgentRunRequest,
): Promise<AgentRunResponse> {
  return json<AgentRunResponse>("/agent/run", body);
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export function listModels(): Promise<ModelInfo[]> {
  return request<ModelInfo[]>("/models/");
}

export function getModelsHealth(): Promise<ModelHealthInfo[]> {
  return request<ModelHealthInfo[]>("/models/health");
}
