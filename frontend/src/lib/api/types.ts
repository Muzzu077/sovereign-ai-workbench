/**
 * Typed API contracts for the Sovereign AI Workbench backend (v0.7.0).
 *
 * Fully synchronized with FastAPI endpoints and domain models.
 */

// ---------------------------------------------------------------------------
// Core Enums & Literals
// ---------------------------------------------------------------------------

export type EvidenceQuality =
  | "no_evidence"
  | "weak_evidence"
  | "sufficient_evidence"
  | "strong_evidence";

export type IngestionStatus =
  | "pending"
  | "processing"
  | "chunked"
  | "embedded"
  | "indexed"
  | "failed"
  | "stale";

export type ExtractionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "ocr_required";

export type FileType = "txt" | "pdf" | "docx" | "unknown";

export type ModelHealthStatus =
  | "available"
  | "unavailable"
  | "timeout"
  | "misconfigured";

export type EventType =
  | "task_received"
  | "task_routed"
  | "plan_created"
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "verification_started"
  | "verification_completed"
  | "task_completed"
  | "task_failed";

// ---------------------------------------------------------------------------
// Root / Health
// ---------------------------------------------------------------------------

export interface RootInfo {
  service: string;
  version: string;
  status: string;
  message: string;
}

export interface VectorStoreHealth {
  status: string;
  storage_dir?: string;
  vector_count?: number;
  generation?: number;
  embedding_fingerprint?: string;
  [key: string]: unknown;
}

export interface DocumentStoreHealth {
  status: string;
  total_documents?: number;
  available_documents?: number;
  missing_files?: number;
  [key: string]: unknown;
}

export interface AuditHealth {
  status: string;
  log_file?: string;
  session_records?: number;
  tamper_evident?: boolean;
  [key: string]: unknown;
}

export interface NetworkHealth {
  status: string;
  violations?: string[];
  note?: string;
  endpoints?: Array<{
    name: string;
    url: string;
    is_loopback: boolean;
  }>;
  [key: string]: unknown;
}

export interface EmbeddingsHealth {
  status?: string;
  embedding_provider: string;
  embedding_model?: string;
  embedding_dimension?: number;
  embedding_version?: number;
  embedding_fingerprint?: string;
  offline_mode?: boolean;
  model_loaded?: boolean;
  device?: string;
  vocabulary_size?: number;
  [key: string]: unknown;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  models_registered: string[];
  tools_registered: string[];
  document_processors: string[];
  knowledge_documents: number;
  knowledge_chunks: number;
  embedding_provider: string;
  subsystems: {
    vector_store: VectorStoreHealth;
    document_store: DocumentStoreHealth;
    audit: AuditHealth;
    network: NetworkHealth;
    embeddings: EmbeddingsHealth;
  };
}

// ---------------------------------------------------------------------------
// Files (upload / list / get / delete)
// ---------------------------------------------------------------------------

export interface FileUploadResponse {
  document_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  extraction_status: string;
  page_count: number;
  text_preview: string;
}

export interface FileInfo {
  document_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  extraction_status: string;
  page_count: number;
  created_at: string;
  text_preview: string;
}

export interface FileListResponse {
  files: FileInfo[];
  total: number;
}

export interface FileInfoResponse extends FileInfo {}

export interface DeleteResponse {
  deleted: boolean;
  document_id: string;
}

// ---------------------------------------------------------------------------
// Documents (analysis)
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  document_id: string;
  summary: string;
  key_findings: string[];
  risks: string[];
  action_items: string[];
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export interface IngestResponse {
  document_id: string;
  filename: string;
  file_type: string;
  chunk_count: number;
  ingestion_status: string;
  ingestion_time_ms: number;
  embedding_time_ms: number;
}

export interface SearchRequest {
  query: string;
  top_k?: number;
  similarity_threshold?: number;
}

export interface SearchResultItem {
  chunk_id: string;
  document_id: string;
  filename: string;
  text: string;
  score: number;
  page_number: number | null;
  section: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
  retrieval_time_ms: number;
  evidence_quality: EvidenceQuality;
}

export interface Citation {
  document_id: string;
  document: string;
  page: number | null;
  section: string | null;
  chunk_id: string | null;
  relevance_score: number | null;
}

export interface QueryRequest {
  query: string;
  top_k?: number;
  similarity_threshold?: number;
}

export interface QueryResponse {
  query: string;
  answer: string;
  citations: Citation[];
  model_used: string;
  retrieval_count: number;
  retrieval_time_ms: number;
  generation_time_ms: number;
  total_time_ms: number;
  evidence_sufficient: boolean;
  evidence_quality: EvidenceQuality;
  similarity_threshold: number;
}

export interface KnowledgeDocument {
  document_id: string;
  filename: string;
  file_type: string;
  chunk_count: number;
  ingestion_status: string;
  ingested_at: string | null;
  ingestion_time_ms: number;
  embedding_time_ms: number;
  content_hash: string;
  error_info: string | null;
}

export interface DeleteKnowledgeResponse {
  status: string;
  document_id: string;
}

// ---------------------------------------------------------------------------
// Agent Execution
// ---------------------------------------------------------------------------

export interface TraceEvent {
  timestamp: string;
  run_id: string;
  event_type: EventType | string;
  step_id: string | null;
  metadata: Record<string, unknown>;
}

export interface PlanStepItem {
  step_id?: string;
  tool?: string;
  description?: string;
  input?: Record<string, unknown>;
  depends_on?: string[];
  [key: string]: unknown;
}

export interface ToolCallItem {
  step_id?: string;
  tool?: string;
  tool_result?: {
    success?: boolean;
    result?: unknown;
    error?: string | null;
    metadata?: Record<string, unknown>;
  };
  verification?: {
    status?: string;
    tool_name?: string;
    detail?: string;
  } | null;
  [key: string]: unknown;
}

export interface AgentRunRequest {
  task: string;
}

export interface AgentRunResponse {
  run_id: string;
  task: string;
  task_type: string;
  selected_model: string;
  provider: string;
  execution_status: string;
  plan: PlanStepItem[];
  tool_calls: ToolCallItem[];
  verification: Record<string, unknown>;
  result: string;
  trace: TraceEvent[];
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export interface ModelCapability {
  name: string;
  supports_text: boolean;
  supports_vision: boolean;
  supports_code: boolean;
  max_context_tokens: number;
}

export interface ModelInfo {
  name: string;
  provider_name: string;
  provider_type: string;
  available: boolean;
  local: boolean;
  base_url: string | null;
  capabilities: ModelCapability;
}

export interface RawModelsResponse {
  models: Record<
    string,
    {
      provider_name: string;
      provider_type: string;
      available: boolean;
      local: boolean;
      base_url: string | null;
      capabilities: ModelCapability;
    }
  >;
}

export interface ModelHealthInfo {
  name: string;
  provider: string;
  status: ModelHealthStatus | string;
  local: boolean;
  model_path: string | null;
}

export interface RawModelsHealthResponse {
  models: ModelHealthInfo[];
}

export interface ModelInferenceRequest {
  prompt: string;
  model_name?: string;
  system_prompt?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface ModelInferenceResponse {
  text: string;
  model_name: string;
  provider: string;
  tokens_used: number | null;
  duration_ms: number;
  fallback_used: boolean;
  metadata: Record<string, unknown>;
}
