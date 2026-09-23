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
