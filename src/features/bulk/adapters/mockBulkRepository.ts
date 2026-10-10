import {
  MOCK_CSV_SAMPLE_DATA,
  MOCK_EXPORT_CSV_DATA,
  generateFailedRowsCsv,
  mockBatches,
  mockExports,
  samplePartialRows,
} from "../mocks/bulkFixtures";
import type {
  BulkExportFormat,
  BulkExportJob,
  BulkImportBatch,
} from "../types/bulk";
import type {
  BulkRepository,
  DownloadResource,
} from "../services/bulkRepository";

// In-memory state store for dynamic test interactions and active sessions
const dynamicBatches: Map<string, BulkImportBatch> = new Map();
const dynamicExports: Map<string, BulkExportJob> = new Map();

function deepCloneBatch(batch: BulkImportBatch): BulkImportBatch {
  return JSON.parse(JSON.stringify(batch)) as BulkImportBatch;
}

function deepCloneExport(job: BulkExportJob): BulkExportJob {
  return JSON.parse(JSON.stringify(job)) as BulkExportJob;
}

export const mockBulkRepository: BulkRepository & {
  advanceMockImport?: (batchId: string) => Promise<BulkImportBatch | null>;
  advanceMockExport?: (exportId: string) => Promise<BulkExportJob | null>;
  resetMockState?: () => void;
} = {
  async getTemplate(
    format: BulkExportFormat,
    signal?: AbortSignal,
  ): Promise<DownloadResource | null> {
    signal?.throwIfAborted();
    if (format === "CSV") {
      const blob = new Blob([MOCK_CSV_SAMPLE_DATA], {
        type: "text/csv;charset=utf-8;",
      });
      return {
        blob,
        fileName: "ejemplo_carga_productos.csv",
      };
    }
    // Official XLSX template is pending integration with bulk-svc provider
    return null;
  },

  async createImport(
    file: File,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<BulkImportBatch> {
    signal?.throwIfAborted();

    const lowerName = file.name.toLowerCase();

    // Rejection scenarios based on scenario param or file naming
    if (scenario === "ARCHIVO_INVALIDO" || lowerName.includes("invalido")) {
      throw new Error(
        "El archivo seleccionado no tiene una estructura legible o contiene caracteres corruptos.",
      );
    }
    if (scenario === "ARCHIVO_EXCEDE_LIMITE" || lowerName.includes("excede")) {
      throw new Error(
        "El archivo excede el tamaño máximo permitido por el servicio.",
      );
    }
    if (
      scenario === "PLANTILLA_INCOMPATIBLE" ||
      lowerName.includes("incompatible")
    ) {
      throw new Error(
        "La plantilla no coincide con la versión vigente de carga masiva.",
      );
    }
    if (
      scenario === "CONTENIDO_ACTIVO_NO_PERMITIDO" ||
      lowerName.includes("macros")
    ) {
      throw new Error(
        "El archivo contiene macros o contenido activo no admitido por la política de seguridad.",
      );
    }

    // Generate unique batch ID
    const batchId = `lote-${Date.now().toString().slice(-6)}`;
    const newBatch: BulkImportBatch = {
      batch_id: batchId,
      status: "QUEUED",
      total_rows: 120,
      completed_rows: 0,
      failed_rows: 0,
      needs_reconciliation: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      file_name: file.name,
      file_size: file.size,
      rows: [],
    };

    dynamicBatches.set(batchId, newBatch);

    return deepCloneBatch(newBatch);
  },

  /**
   * Pure, idempotent read of batch state with ZERO side-effects.
   * Priority: 1) Dynamic instance, 2) Static fixture, 3) null.
   */
  async getImport(
    batchId: string,
    signal?: AbortSignal,
  ): Promise<BulkImportBatch | null> {
    signal?.throwIfAborted();

    if (batchId === "batch-status-unavailable") {
      throw new Error(
        "No se pudo consultar el estado del lote en este momento. La última información confirmada se conserva.",
      );
    }

    // 1. Check dynamic in-memory batch first (e.g. newly created or resumed)
    const dynamic = dynamicBatches.get(batchId);
    if (dynamic) {
      return deepCloneBatch(dynamic);
    }

    // 2. Fallback to fixed static fixture
    const fixture = mockBatches[batchId];
    if (fixture) {
      return deepCloneBatch(fixture);
    }

    return null;
  },

  async getImportReport(
    batchId: string,
    signal?: AbortSignal,
  ): Promise<DownloadResource | null> {
    signal?.throwIfAborted();
    const batch = await this.getImport(batchId, signal);
    if (!batch || batch.failed_rows === 0) {
      return null;
    }

    const rows = batch.rows ?? samplePartialRows;
    const csvContent = generateFailedRowsCsv(rows);
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    return {
      blob,
      fileName: `reporte_errores_${batchId}.csv`,
    };
  },

  /**
   * Idempotent resume of an eligible batch.
   * Preserves batch_id, total_rows, and confirmed completed rows.
   */
  async resumeImport(
    batchId: string,
    signal?: AbortSignal,
  ): Promise<BulkImportBatch> {
    signal?.throwIfAborted();

    const existing = await this.getImport(batchId, signal);
    if (!existing) {
      throw new Error(`No se encontró el lote ${batchId} para reanudar.`);
    }

    // Validate eligibility for resume
    if (existing.status === "QUEUED" || existing.status === "PROCESSING") {
      throw new Error(
        `El lote ${batchId} ya se encuentra en proceso de reanudación o ejecución.`,
      );
    }

    if (!existing.needs_reconciliation || existing.failed_rows === 0) {
      throw new Error(
        `El lote ${batchId} no contiene operaciones pendientes ni requiere reconciliación.`,
      );
    }

    const resumedBatch: BulkImportBatch = {
      ...existing,
      status: "QUEUED",
      updated_at: new Date().toISOString(),
    };

    dynamicBatches.set(batchId, resumedBatch);

    return deepCloneBatch(resumedBatch);
  },

  async createExport(
    format: BulkExportFormat,
    signal?: AbortSignal,
  ): Promise<BulkExportJob> {
    signal?.throwIfAborted();

    const exportId = `exp-${Date.now().toString().slice(-6)}`;
    const newJob: BulkExportJob = {
      export_id: exportId,
      status: "QUEUED",
      format,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    dynamicExports.set(exportId, newJob);

    return deepCloneExport(newJob);
  },

  /**
   * Pure, idempotent read of export job state with ZERO side-effects.
   */
  async getExport(
    exportId: string,
    signal?: AbortSignal,
  ): Promise<BulkExportJob | null> {
    signal?.throwIfAborted();

    if (exportId === "export-status-unavailable") {
      throw new Error(
        "No se pudo consultar el estado de la exportación. Reintente en unos momentos.",
      );
    }

    const dynamic = dynamicExports.get(exportId);
    if (dynamic) {
      return deepCloneExport(dynamic);
    }

    const fixture = mockExports[exportId];
    if (fixture) {
      return deepCloneExport(fixture);
    }

    return null;
  },

  /**
   * Pure download resource retrieval with ZERO state transition side-effects.
   */
  async getExportFile(
    exportId: string,
    signal?: AbortSignal,
  ): Promise<DownloadResource | null> {
    signal?.throwIfAborted();

    // Read job directly without mutating state
    const job = dynamicExports.get(exportId) ?? mockExports[exportId];
    if (!job || job.status !== "COMPLETED") {
      return null;
    }

    if (job.format === "CSV") {
      const blob = new Blob([MOCK_EXPORT_CSV_DATA], {
        type: "text/csv;charset=utf-8;",
      });
      return {
        blob,
        fileName: job.file_name ?? `exportacion_catalogo_${exportId}.csv`,
      };
    }

    // XLSX format requires real backend export service
    return null;
  },

  /**
   * Internal simulation transition helper for testing and development.
   */
  async advanceMockImport(batchId: string): Promise<BulkImportBatch | null> {
    let batch = dynamicBatches.get(batchId);
    if (!batch) {
      const fixture = mockBatches[batchId];
      if (fixture) {
        batch = deepCloneBatch(fixture);
        dynamicBatches.set(batchId, batch);
      } else {
        return null;
      }
    }

    if (batch.status === "QUEUED") {
      batch.status = "PROCESSING";
      batch.completed_rows = Math.min(82, batch.total_rows);
      batch.failed_rows = 4;
      batch.updated_at = new Date().toISOString();
    } else if (batch.status === "PROCESSING") {
      batch.status = "COMPLETED";
      batch.completed_rows = Math.min(114, batch.total_rows);
      batch.failed_rows = 6;
      batch.needs_reconciliation = true;
      batch.rows = samplePartialRows;
      batch.updated_at = new Date().toISOString();
    }

    return deepCloneBatch(batch);
  },

  /**
   * Internal simulation transition helper for testing exports.
   */
  async advanceMockExport(exportId: string): Promise<BulkExportJob | null> {
    let job = dynamicExports.get(exportId);
    if (!job) {
      const fixture = mockExports[exportId];
      if (fixture) {
        job = deepCloneExport(fixture);
        dynamicExports.set(exportId, job);
      } else {
        return null;
      }
    }

    if (job.status === "QUEUED") {
      job.status = "PROCESSING";
      job.updated_at = new Date().toISOString();
    } else if (job.status === "PROCESSING") {
      job.status = "COMPLETED";
      job.file_name = `catalogo_${job.format.toLowerCase()}_${exportId}.${job.format.toLowerCase()}`;
      job.file_size = 128500;
      job.download_url = `mock://download/${exportId}`;
      job.updated_at = new Date().toISOString();
    }

    return deepCloneExport(job);
  },

  resetMockState() {
    dynamicBatches.clear();
    dynamicExports.clear();
  },
};
