/**
 * Typed API contracts for the Sovereign AI Workbench backend (v0.7.0).
 *
 * These types mirror the Pydantic models defined in backend/app/api/
 * and backend/app/knowledge/models.py.  Keep them in sync manually.
 */

// ---------------------------------------------------------------------------
// Enums
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
  | "failed";

export type FileType = "txt" | "pdf" | "docx" | "unknown";

export type VerificationStatus = "pass" | "fail" | "not_verified";

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

export interface SubsystemHealth {
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
    vector_store: SubsystemHealth;
    document_store: SubsystemHealth;
    audit: SubsystemHealth;
    network: SubsystemHealth;
    embeddings: SubsystemHealth;
  };
}

// ---------------------------------------------------------------------------
// Files (upload / list / get / delete)
// ---------------------------------------------------------------------------

export interface FileUploadResponse {
  document_id: string;
  filename: string;
  file_type: FileType;
  file_size: number;
  extraction_status: ExtractionStatus;
  page_count: number;
  text_preview: string;
}

export interface FileInfo {
  document_id: string;
  filename: string;
  file_type: FileType;
  file_size: number;
  extraction_status: ExtractionStatus;
  page_count: number;
  text_preview: string;
  uploaded_at: string;
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
// Knowledge Base (ingest / search / query)
// ---------------------------------------------------------------------------

export interface IngestResponse {
  document_id: string;
  filename: string;
  file_type: string;
  chunk_count: number;
  ingestion_status: IngestionStatus;
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
  score: float;
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
  embedding_time_ms: number;
  context_construction_time_ms: number;
  similarity_threshold: number;
  candidates_count: number;
}

export interface KnowledgeDocument {
  document_id: string;
  filename: string;
  file_type: string;
  content_hash: string;
  chunk_count: number;
  ingestion_status: IngestionStatus;
  embedding_provider: string;
  embedding_version: number;
  chunking_version: number;
  ingested_at: string | null;
  updated_at: string | null;
  ingestion_time_ms: number;
  embedding_time_ms: number;
  error_info: string | null;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agent execution
// ---------------------------------------------------------------------------

export interface TraceEvent {
  timestamp: string;
  run_id: string;
  event_type: EventType;
  step_id: string | null;
  metadata: Record<string, unknown>;
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
  plan: Record<string, unknown>[];
  tool_calls: Record<string, unknown>[];
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
  provider: string;
  capabilities: ModelCapability;
  is_available: boolean;
}

export interface ModelHealthInfo {
  name: string;
  provider: string;
  is_available: boolean;
  health_details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Utility type alias
// ---------------------------------------------------------------------------
type float = number;
