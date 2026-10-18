import {
  MOCK_CSV_SAMPLE_DATA,
  MOCK_EXPORT_CSV_DATA,
  generateFailedRowsCsv,
  mockBatches,
  mockExports,
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
import { BulkRepositoryError } from "../services/bulkErrors";
import { canMockProvideImportReport } from "../services/reportAvailability";
import {
  clearMockState,
  isMockPersistenceAvailable,
  isRecord,
  publishMockChange,
  readMockState,
  saveMockState,
  subscribeExternalMockChanges,
} from "../../shared/mockState";

export const DEMO_CONFIG = {
  PROCESSING_DELAY_MS: 1200,
  COMPLETION_DELAY_MS: 2400,
  AUTO_ADVANCE: true,
};

// In-memory state store for dynamic test interactions and active sessions
const dynamicBatches: Map<string, BulkImportBatch> = new Map();
const dynamicExports: Map<string, BulkExportJob> = new Map();
const activeTimers: Set<ReturnType<typeof setTimeout>> = new Set();
const activeBatchSimulations: Set<string> = new Set();
const activeExportSimulations: Set<string> = new Set();
const resumingBatches = new Set<string>();

let batchSequence = 1000;
let exportSequence = 1000;
let createImportCallCount = 0;

interface MockBulkState {
  batches: [string, BulkImportBatch][];
  exports: [string, BulkExportJob][];
  batchSequence: number;
  exportSequence: number;
  createImportCallCount: number;
}

function isBatchEntry(entry: unknown): boolean {
  if (!Array.isArray(entry) || entry.length !== 2) return false;
  const [id, batch] = entry;
  return (
    typeof id === "string" &&
    isRecord(batch) &&
    typeof batch.batch_id === "string" &&
    batch.batch_id === id &&
    typeof batch.status === "string" &&
    ["QUEUED", "PROCESSING", "COMPLETED", "FAILED_GENERAL"].includes(batch.status) &&
    (batch.total_rows === undefined || batch.total_rows === null || (typeof batch.total_rows === "number" && Number.isFinite(batch.total_rows) && batch.total_rows >= 0)) &&
    typeof batch.completed_rows === "number" &&
    Number.isFinite(batch.completed_rows) &&
    batch.completed_rows >= 0 &&
    typeof batch.failed_rows === "number" &&
    Number.isFinite(batch.failed_rows) &&
    batch.failed_rows >= 0 &&
    typeof batch.needs_reconciliation === "boolean" &&
    typeof batch.created_at === "string" &&
    typeof batch.updated_at === "string"
  );
}

function isExportEntry(entry: unknown): boolean {
  if (!Array.isArray(entry) || entry.length !== 2) return false;
  const [id, job] = entry;
  return (
    typeof id === "string" &&
    isRecord(job) &&
    typeof job.export_id === "string" &&
    job.export_id === id &&
    typeof job.status === "string" &&
    ["QUEUED", "PROCESSING", "COMPLETED", "FAILED_GENERAL"].includes(job.status) &&
    typeof job.format === "string" &&
    ["CSV", "XLSX"].includes(job.format) &&
    typeof job.created_at === "string" &&
    typeof job.updated_at === "string"
  );
}

function isMockBulkState(value: unknown): value is MockBulkState {
  return (
    isRecord(value) &&
    Array.isArray(value.batches) &&
    value.batches.every(isBatchEntry) &&
    Array.isArray(value.exports) &&
    value.exports.every(isExportEntry) &&
    typeof value.batchSequence === "number" &&
    Number.isFinite(value.batchSequence) &&
    value.batchSequence >= 0 &&
    typeof value.exportSequence === "number" &&
    Number.isFinite(value.exportSequence) &&
    value.exportSequence >= 0 &&
    typeof value.createImportCallCount === "number" &&
    Number.isFinite(value.createImportCallCount) &&
    value.createImportCallCount >= 0
  );
}

// Dynamic loads and exports live in the mock demonstration only. When a real browser
// session is available they are restored and persisted per browser, without promising
// cross-device synchronization.
const persistEnabled = isMockPersistenceAvailable();

function persistBulkState(): boolean {
  if (!persistEnabled) return true;
  const ok = saveMockState("bulk", {
    batches: [...dynamicBatches.entries()],
    exports: [...dynamicExports.entries()],
    batchSequence,
    exportSequence,
    createImportCallCount,
  } satisfies MockBulkState);
  publishMockChange("bulk");
  return ok;
}

function hydrateBulkStateFromStorage(): void {
  if (!persistEnabled) return;
  const stored = readMockState<MockBulkState>("bulk", isMockBulkState);
  if (!stored) return;
  dynamicBatches.clear();
  for (const [id, batch] of stored.batches) dynamicBatches.set(id, batch);
  dynamicExports.clear();
  for (const [id, job] of stored.exports) dynamicExports.set(id, job);
  batchSequence = stored.batchSequence;
  exportSequence = stored.exportSequence;
  createImportCallCount = stored.createImportCallCount;
  // In-flight work lost its timers on reload: reschedule it deterministically.
  for (const [id, batch] of dynamicBatches) {
    if (batch.status === "QUEUED" || batch.status === "PROCESSING") {
      if (batch.needs_reconciliation || batch.rows?.some((r) => r.needs_reconciliation)) {
        scheduleResumeSimulation(id);
      } else {
        scheduleImportSimulation(id);
      }
    }
  }
  for (const [id, job] of dynamicExports) {
    if (job.status === "QUEUED" || job.status === "PROCESSING") {
      scheduleExportSimulation(id);
    }
  }
  publishMockChange("bulk");
}

function deepCloneBatch(batch: BulkImportBatch): BulkImportBatch {
  return JSON.parse(JSON.stringify(batch)) as BulkImportBatch;
}

function deepCloneExport(job: BulkExportJob): BulkExportJob {
  return JSON.parse(JSON.stringify(job)) as BulkExportJob;
}

function scheduleImportSimulation(batchId: string) {
  if (!DEMO_CONFIG.AUTO_ADVANCE || activeBatchSimulations.has(batchId)) return;
  activeBatchSimulations.add(batchId);

  const t1 = setTimeout(() => {
    activeTimers.delete(t1);
    const batch = dynamicBatches.get(batchId);
    if (batch && batch.status === "QUEUED") {
      const prev = deepCloneBatch(batch);
      batch.status = "PROCESSING";
      const total = typeof batch.total_rows === "number" ? batch.total_rows : null;
      batch.completed_rows = total !== null ? Math.floor(total * 0.7) : 0;
      batch.failed_rows = 0;
      batch.updated_at = new Date().toISOString();
      const ok = persistBulkState();
      if (!ok && persistEnabled) {
        dynamicBatches.set(batchId, prev);
      }
    }
  }, DEMO_CONFIG.PROCESSING_DELAY_MS);
  activeTimers.add(t1);

  const t2 = setTimeout(() => {
    activeTimers.delete(t2);
    activeBatchSimulations.delete(batchId);
    const batch = dynamicBatches.get(batchId);
    if (batch && (batch.status === "PROCESSING" || batch.status === "QUEUED")) {
      const prev = deepCloneBatch(batch);
      const total = typeof batch.total_rows === "number" ? batch.total_rows : null;
      // An XLSX without verified rows in browser does not finalize as COMPLETED with 0 rows in simulation
      if (total === null && (!batch.rows || batch.rows.length === 0)) {
        batch.status = "PROCESSING";
        batch.completed_rows = 0;
        batch.failed_rows = 0;
        batch.updated_at = new Date().toISOString();
      } else {
        batch.status = "COMPLETED";
        batch.completed_rows = total ?? batch.rows?.length ?? 0;
        batch.failed_rows = 0;
        batch.needs_reconciliation = false;
        batch.updated_at = new Date().toISOString();
        if (!batch.rows) {
          batch.rows = [];
        }
      }
      const ok = persistBulkState();
      if (!ok && persistEnabled) {
        dynamicBatches.set(batchId, prev);
      }
    }
  }, DEMO_CONFIG.COMPLETION_DELAY_MS);
  activeTimers.add(t2);
}

function applyReconciliationCompletion(batch: BulkImportBatch) {
  batch.status = "COMPLETED";
  batch.updated_at = new Date().toISOString();

  if (batch.rows && batch.rows.length > 0) {
    let newlyCompleted = 0;
    for (const row of batch.rows) {
      if (row.status === "FAILED" && row.needs_reconciliation) {
        row.status = "COMPLETED";
        row.needs_reconciliation = false;
        row.failed_domain = null;
        row.code = null;
        row.detail = "Reconciliación completada exitosamente";
        row.applied_domains = ["CATALOGO", "PRICING", "INVENTARIO"];
        row.steps = row.steps.map((s) => ({
          ...s,
          status: "COMPLETED",
          code: null,
          detail: "Completado tras reanudación",
        }));
        newlyCompleted++;
      }
    }
    const total = typeof batch.total_rows === "number" ? batch.total_rows : null;
    batch.completed_rows = total !== null
      ? Math.min(total, batch.completed_rows + newlyCompleted)
      : batch.completed_rows + newlyCompleted;
    batch.failed_rows = Math.max(0, batch.failed_rows - newlyCompleted);
    batch.needs_reconciliation = batch.rows.some(
      (r) => r.status === "FAILED" && r.needs_reconciliation,
    );
  } else {
    const total = typeof batch.total_rows === "number" ? batch.total_rows : null;
    batch.completed_rows = total ?? 0;
    batch.failed_rows = 0;
    batch.needs_reconciliation = false;
  }
}

function scheduleResumeSimulation(batchId: string) {
  if (!DEMO_CONFIG.AUTO_ADVANCE || activeBatchSimulations.has(batchId)) return;
  activeBatchSimulations.add(batchId);

  const t1 = setTimeout(() => {
    activeTimers.delete(t1);
    const batch = dynamicBatches.get(batchId);
    if (batch && batch.status === "QUEUED") {
      const prev = deepCloneBatch(batch);
      batch.status = "PROCESSING";
      batch.updated_at = new Date().toISOString();
      const ok = persistBulkState();
      if (!ok && persistEnabled) {
        dynamicBatches.set(batchId, prev);
      }
    }
  }, DEMO_CONFIG.PROCESSING_DELAY_MS);
  activeTimers.add(t1);

  const t2 = setTimeout(() => {
    activeTimers.delete(t2);
    activeBatchSimulations.delete(batchId);
    const batch = dynamicBatches.get(batchId);
    if (batch && (batch.status === "PROCESSING" || batch.status === "QUEUED")) {
      const prev = deepCloneBatch(batch);
      applyReconciliationCompletion(batch);
      const ok = persistBulkState();
      if (!ok && persistEnabled) {
        dynamicBatches.set(batchId, prev);
      }
    }
  }, DEMO_CONFIG.COMPLETION_DELAY_MS);
  activeTimers.add(t2);
}

function scheduleExportSimulation(exportId: string) {
  if (!DEMO_CONFIG.AUTO_ADVANCE || activeExportSimulations.has(exportId)) return;
  activeExportSimulations.add(exportId);

  const t1 = setTimeout(() => {
    activeTimers.delete(t1);
    const job = dynamicExports.get(exportId);
    if (job && job.status === "QUEUED") {
      const prev = structuredClone(job);
      job.status = "PROCESSING";
      job.updated_at = new Date().toISOString();
      const ok = persistBulkState();
      if (!ok && persistEnabled) {
        dynamicExports.set(exportId, prev);
      }
    }
  }, DEMO_CONFIG.PROCESSING_DELAY_MS);
  activeTimers.add(t1);

  const t2 = setTimeout(() => {
    activeTimers.delete(t2);
    activeExportSimulations.delete(exportId);
    const job = dynamicExports.get(exportId);
    if (job && (job.status === "PROCESSING" || job.status === "QUEUED")) {
      const prev = structuredClone(job);
      job.status = "COMPLETED";
      job.updated_at = new Date().toISOString();
      if (job.format === "CSV") {
        job.file_name = `catalogo_completo_${exportId}.csv`;
        job.file_size = MOCK_EXPORT_CSV_DATA.length;
        job.download_url = `mock://download/${exportId}.csv`;
      } else {
        job.file_name = `catalogo_completo_${exportId}.xlsx`;
      }
      const ok = persistBulkState();
      if (!ok && persistEnabled) {
        dynamicExports.set(exportId, prev);
      }
    }
  }, DEMO_CONFIG.COMPLETION_DELAY_MS);
  activeTimers.add(t2);
}

export const mockBulkRepository: BulkRepository & {
  advanceMockImport?: (batchId: string) => Promise<BulkImportBatch | null>;
  advanceMockExport?: (exportId: string) => Promise<BulkExportJob | null>;
  resetMockState?: () => void;
  clearMockTimers?: () => void;
  getCreateImportCallCount?: () => number;
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
    localSummary?: { detectedRows?: number },
    signal?: AbortSignal,
  ): Promise<BulkImportBatch> {
    createImportCallCount++;
    signal?.throwIfAborted();

    const lowerName = file.name.toLowerCase();

    // Rejection scenarios based on scenario param or file naming
    if (lowerName.includes("invalido")) {
      throw new BulkRepositoryError(
        "El archivo seleccionado no tiene una estructura legible o contiene caracteres corruptos.",
        "rejected",
      );
    }
    if (lowerName.includes("excede")) {
      throw new BulkRepositoryError(
        "El archivo excede el tamaño máximo permitido por el servicio.",
        "rejected",
      );
    }
    if (
      lowerName.includes("incompatible")
    ) {
      throw new BulkRepositoryError(
        "La plantilla no coincide con la versión vigente de carga masiva.",
        "rejected",
      );
    }
    if (
      lowerName.includes("macros")
    ) {
      throw new BulkRepositoryError(
        "El archivo contiene macros o contenido activo no admitido por la política de seguridad.",
        "rejected",
      );
    }

    // Determine observed row count for CSV using the same parser as local check
    // The review stage already streamed and counted CSV rows; do not read the file again.
    // For XLSX the browser cannot verify row count, so leave it unknown.
    const estimatedRows = lowerName.endsWith(".csv")
      ? localSummary?.detectedRows
      : undefined;

    batchSequence++;
    const batchId = `lote-imp-${batchSequence}-${Math.random().toString(36).slice(2, 6)}`;
    const newBatch: BulkImportBatch = {
      batch_id: batchId,
      status: "QUEUED",
      total_rows: estimatedRows,
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
    const ok = persistBulkState();
    if (!ok && persistEnabled) {
      dynamicBatches.delete(batchId);
      throw new BulkRepositoryError(
        "No se pudo iniciar la importación. Vuelve a intentarlo.",
        "communication",
      );
    }
    scheduleImportSimulation(batchId);

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
    if (!batch || !canMockProvideImportReport(batch)) {
      return null;
    }

    const failedRows = (batch.rows ?? []).filter((r) => r.status === "FAILED");
    if (failedRows.length === 0) {
      return null;
    }

    const csvContent = generateFailedRowsCsv(failedRows);
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    return {
      blob,
      fileName: `reporte_errores_${batchId}.csv`,
    };
  },

  canDownloadImportReport(batch: BulkImportBatch) {
    return canMockProvideImportReport(batch);
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

    if (resumingBatches.has(batchId)) {
      throw new Error(`El lote ${batchId} ya tiene una reanudación en curso.`);
    }
    resumingBatches.add(batchId);

    const resumedBatch: BulkImportBatch = {
      ...existing,
      status: "QUEUED",
      updated_at: new Date().toISOString(),
    };

    const previousBatch = dynamicBatches.get(batchId)
      ? deepCloneBatch(dynamicBatches.get(batchId)!)
      : undefined;
    dynamicBatches.set(batchId, resumedBatch);
    const ok = persistBulkState();
    if (!ok && persistEnabled) {
      if (previousBatch) {
        dynamicBatches.set(batchId, previousBatch);
      } else {
        dynamicBatches.delete(batchId);
      }
      resumingBatches.delete(batchId);
      throw new BulkRepositoryError(
        "No se pudo reanudar la importación. Vuelve a intentarlo.",
        "communication",
      );
    }
    scheduleResumeSimulation(batchId);
    // The demo returns the 202-shaped response synchronously. The guard remains active
    // until the next turn so a rapid duplicate cannot schedule a second run.
    queueMicrotask(() => resumingBatches.delete(batchId));

    return deepCloneBatch(resumedBatch);
  },

  async createExport(
    format: BulkExportFormat,
    signal?: AbortSignal,
  ): Promise<BulkExportJob> {
    signal?.throwIfAborted();

    exportSequence++;
    const exportId = `exp-${exportSequence}-${Math.random().toString(36).slice(2, 6)}`;
    const newJob: BulkExportJob = {
      export_id: exportId,
      status: "QUEUED",
      format,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    dynamicExports.set(exportId, newJob);
    const ok = persistBulkState();
    if (!ok && persistEnabled) {
      dynamicExports.delete(exportId);
      throw new BulkRepositoryError(
        "No se pudo iniciar la exportación. Vuelve a intentarlo.",
        "communication",
      );
    }
    scheduleExportSimulation(exportId);

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
      const total = typeof batch.total_rows === "number" ? batch.total_rows : null;
      batch.completed_rows = total !== null ? Math.floor(total * 0.7) : 0;
      batch.failed_rows = 0;
      batch.updated_at = new Date().toISOString();
    } else if (batch.status === "PROCESSING") {
      applyReconciliationCompletion(batch);
    }

    const ok = persistBulkState();
    if (!ok && persistEnabled) {
      throw new BulkRepositoryError(
        "No se pudo reanudar la importación. Vuelve a intentarlo.",
        "communication",
      );
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
      if (job.format === "CSV") {
        job.file_name = `catalogo_csv_${exportId}.csv`;
        job.file_size = MOCK_EXPORT_CSV_DATA.length;
        job.download_url = `mock://download/${exportId}`;
      } else {
        job.file_name = `catalogo_xlsx_${exportId}.xlsx`;
      }
      job.updated_at = new Date().toISOString();
    }

    persistBulkState();
    return deepCloneExport(job);
  },

  getCreateImportCallCount() {
    return createImportCallCount;
  },

  clearMockTimers() {
    for (const t of activeTimers) {
      clearTimeout(t);
    }
    activeTimers.clear();
    activeBatchSimulations.clear();
    activeExportSimulations.clear();
  },

  resetMockState() {
    for (const t of activeTimers) {
      clearTimeout(t);
    }
    activeTimers.clear();
    activeBatchSimulations.clear();
    activeExportSimulations.clear();
    dynamicBatches.clear();
    dynamicExports.clear();
    resumingBatches.clear();
    batchSequence = 1000;
    exportSequence = 1000;
    createImportCallCount = 0;
    if (persistEnabled) {
      clearMockState("bulk");
      publishMockChange("bulk");
    }
  },
};

// Restore this session's dynamic bulk work before the first query and keep it in sync
// with other tabs. No-op outside a real mock browser session (tests, SSR, API mode).
if (persistEnabled) {
  subscribeExternalMockChanges("bulk", hydrateBulkStateFromStorage);
  hydrateBulkStateFromStorage();
}
