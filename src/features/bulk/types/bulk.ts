// Domain & UI models for MK-001 (Bulk Upload and Export)
// These models represent presentation entities and repository contracts.

export type BulkImportStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED_GENERAL";

export type BulkRowStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type BulkDomain = "CATALOGO" | "PRICING" | "INVENTARIO";

export interface BulkDomainStep {
  domain: BulkDomain;
  status: BulkRowStatus;
  code?: string;
  detail?: string;
}

export interface BulkImportRow {
  row_id: number;
  sku?: string;
  nombre?: string;
  status: BulkRowStatus;
  applied_domains: BulkDomain[];
  failed_domain?: BulkDomain | null;
  needs_reconciliation: boolean;
  code?: string;
  detail?: string;
  steps: BulkDomainStep[];
}

export interface BulkImportBatch {
  batch_id: string;
  status: BulkImportStatus;
  total_rows: number;
  completed_rows: number;
  failed_rows: number;
  needs_reconciliation: boolean;
  created_at: string;
  updated_at: string;
  file_name?: string;
  file_size?: number;
  rows?: BulkImportRow[];
}

export type BulkExportFormat = "CSV" | "XLSX";

export type BulkExportStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED_GENERAL";

export interface BulkExportJob {
  export_id: string;
  status: BulkExportStatus;
  format: BulkExportFormat;
  created_at: string;
  updated_at: string;
  file_name?: string;
  file_size?: number;
  download_url?: string;
  error_message?: string;
}

export interface LocalFileCheckResult {
  valid: boolean;
  format: "CSV" | "XLSX" | "UNKNOWN";
  fileName: string;
  fileSize: number;
  detectedRows?: number;
  detectedColumns?: string[];
  missingColumns?: string[];
  warnings: string[];
  errors: string[];
  unverifiedAspects: string[];
}

export type OperationState<T> =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: T | null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: T | null; error: string };
