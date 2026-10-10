import {
  MOCK_CSV_TEMPLATE,
  MOCK_EXPORT_CSV_DATA,
  MOCK_FAILED_ROWS_REPORT_CSV,
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
const queryCounters: Map<string, number> = new Map();

export const mockBulkRepository: BulkRepository = {
  async getTemplate(
    format: BulkExportFormat,
    signal?: AbortSignal,
  ): Promise<DownloadResource | null> {
    signal?.throwIfAborted();
    if (format === "CSV") {
      const blob = new Blob([MOCK_CSV_TEMPLATE], {
        type: "text/csv;charset=utf-8;",
      });
      return {
        blob,
        fileName: "plantilla_carga_productos.csv",
      };
    }
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
        "El archivo excede el tamaño máximo permitido por el servicio (límite: 25 MB).",
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
    queryCounters.set(batchId, 0);

    return { ...newBatch };
  },

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

    // Check fixed fixture
    if (mockBatches[batchId]) {
      return { ...mockBatches[batchId] };
    }

    // Check dynamic in-memory batch
    const batch = dynamicBatches.get(batchId);
    if (!batch) {
      return null;
    }

    // Deterministic progression on queries for dynamic batches
    const count = (queryCounters.get(batchId) ?? 0) + 1;
    queryCounters.set(batchId, count);

    if (batch.status === "QUEUED" && count >= 1) {
      batch.status = "PROCESSING";
      batch.completed_rows = 82;
      batch.failed_rows = 4;
      batch.updated_at = new Date().toISOString();
    } else if (batch.status === "PROCESSING" && count >= 2) {
      batch.status = "COMPLETED";
      batch.completed_rows = 114;
      batch.failed_rows = 6;
      batch.needs_reconciliation = true;
      batch.rows = samplePartialRows;
      batch.updated_at = new Date().toISOString();
    }

    return { ...batch };
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

    const blob = new Blob([MOCK_FAILED_ROWS_REPORT_CSV], {
      type: "text/csv;charset=utf-8;",
    });
    return {
      blob,
      fileName: `reporte_errores_${batchId}.csv`,
    };
  },

  async resumeImport(
    batchId: string,
    signal?: AbortSignal,
  ): Promise<BulkImportBatch> {
    signal?.throwIfAborted();

    const existing = await this.getImport(batchId, signal);
    if (!existing) {
      throw new Error(`No se encontró el lote ${batchId} para reanudar.`);
    }

    const resumedBatch: BulkImportBatch = {
      ...existing,
      status: "QUEUED",
      updated_at: new Date().toISOString(),
    };

    dynamicBatches.set(batchId, resumedBatch);
    queryCounters.set(batchId, 0);

    return { ...resumedBatch };
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
    queryCounters.set(exportId, 0);

    return { ...newJob };
  },

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

    if (mockExports[exportId]) {
      return { ...mockExports[exportId] };
    }

    const job = dynamicExports.get(exportId);
    if (!job) {
      return null;
    }

    const count = (queryCounters.get(exportId) ?? 0) + 1;
    queryCounters.set(exportId, count);

    if (job.status === "QUEUED" && count >= 1) {
      job.status = "PROCESSING";
      job.updated_at = new Date().toISOString();
    } else if (job.status === "PROCESSING" && count >= 2) {
      job.status = "COMPLETED";
      job.file_name = `catalogo_${job.format.toLowerCase()}_${exportId}.${job.format.toLowerCase()}`;
      job.file_size = 128500;
      job.download_url = `mock://download/${exportId}`;
      job.updated_at = new Date().toISOString();
    }

    return { ...job };
  },

  async getExportFile(
    exportId: string,
    signal?: AbortSignal,
  ): Promise<DownloadResource | null> {
    signal?.throwIfAborted();

    const job = await this.getExport(exportId, signal);
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

    return null;
  },
};
