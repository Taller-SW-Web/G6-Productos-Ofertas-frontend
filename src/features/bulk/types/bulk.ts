// Domain & UI models for MK-001 (Bulk Upload and Export)
// Base HTTP models aligned with the frontend's verified OpenAPI 0.7.0-rc.2 reference.

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

// Canonical error codes from OpenAPI 0.5.0 ErrorCode enum
export type BulkErrorCode =
  | "VALIDACION"
  | "TOKEN_INVALIDO"
  | "SCOPE_INSUFICIENTE"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "ERROR_INTERNO"
  | "SERVICIO_NO_DISPONIBLE"
  | "PRODUCTO_NO_ENCONTRADO"
  | "SKU_DUPLICADO"
  | "CATEGORIA_INVALIDA"
  | "TIPO_PRODUCTO_INVALIDO"
  | "TIPO_PRODUCTO_NO_ENCONTRADO"
  | "MARCA_INVALIDA"
  | "DATOS_INCOMPLETOS"
  | "CAMBIO_ESTRUCTURAL_NO_PERMITIDO"
  | "VARIANTE_NO_ENCONTRADA"
  | "SKU_INVALIDO"
  | "UBICACION_NO_ENCONTRADA"
  | "CANTIDAD_INVALIDA"
  | "STOCK_INSUFICIENTE"
  | "PRECIO_INVALIDO"
  | "CATEGORIA_NO_ENCONTRADA"
  | "CATEGORIA_DUPLICADA"
  | "PROFUNDIDAD_CATEGORIA_EXCEDIDA"
  | "RETRY_PROTOCOL_NOT_APPROVED"
  | "RETRY_NOT_ELIGIBLE"
  | "IDEMPOTENCY_CONFLICT";

export interface BulkDomainStep {
  domain: BulkDomain;
  status: BulkRowStatus;
  code?: BulkErrorCode | null;
  detail?: string | null;
}

export interface BulkImportRow {
  row_id: string | number;
  sku?: string;
  nombre?: string;
  status: BulkRowStatus;
  applied_domains: BulkDomain[];
  failed_domain?: BulkDomain | null;
  needs_reconciliation: boolean;
  code?: BulkErrorCode | null;
  detail?: string | null;
  steps: BulkDomainStep[];
  precio_regular?: number;
  stock_inicial?: number;
  descripcion?: string;
  categoria?: string;
  marca?: string;
  tipo_producto?: string;
  moneda?: string;
}

export type BulkResumeBlockReason =
  | "LOTE_NO_TERMINAL"
  | "SIN_PASOS_REINTENTABLES"
  | "RESULTADO_INCIERTO"
  | "PROTOCOLO_DOMINIO_NO_HABILITADO";

export interface BulkResumeStep {
  row_id: string;
  domain: "CATALOGO" | "INVENTARIO";
}

export interface BulkResumeEligibility {
  protocol: "BULK_RETRY_V1";
  eligible: boolean;
  steps: BulkResumeStep[];
  blockedReason: BulkResumeBlockReason | null;
}

export interface BulkAdmissionReconciliation {
  batch_id: string;
  correlation_id: string;
  status: BulkImportStatus;
  template_version: 2;
}

export interface BulkImportIntent {
  owner: string;
  contentHash: string;
  correlationId: string;
}

export interface BulkResumeRequest {
  correlationId: string;
  motivo: null;
  originalCorrelationId?: string;
}

/** Durable admission receipt for a retry POST; it is not a batch snapshot. */
export interface BulkResumeAccepted {
  batch_id: string;
  correlation_id: string;
  status: "QUEUED";
  template_version: 2;
}

export interface BulkImportBatch {
  batch_id: string;
  correlation_id?: string;
  status: BulkImportStatus;
  total_rows?: number | null;
  completed_rows: number;
  failed_rows: number;
  needs_reconciliation: boolean;
  created_at: string;
  updated_at: string;
  file_name?: string;
  file_size?: number;
  rows?: BulkImportRow[];
  reanudacion?: BulkResumeEligibility;
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
  warnings: string[];
  errors: string[];
  unverifiedAspects: string[];
}
