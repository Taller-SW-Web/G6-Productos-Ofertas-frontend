import type {
  BulkExportFormat,
  BulkExportJob,
  BulkImportBatch,
} from "../types/bulk";

export interface DownloadResource {
  blob: Blob;
  fileName: string;
}

export interface BulkRepository {
  getTemplate(
    format: BulkExportFormat,
    signal?: AbortSignal,
  ): Promise<DownloadResource | null>;

  createImport(
    file: File,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<BulkImportBatch>;

  getImport(
    batchId: string,
    signal?: AbortSignal,
  ): Promise<BulkImportBatch | null>;

  getImportReport(
    batchId: string,
    signal?: AbortSignal,
  ): Promise<DownloadResource | null>;

  resumeImport(
    batchId: string,
    signal?: AbortSignal,
  ): Promise<BulkImportBatch>;

  createExport(
    format: BulkExportFormat,
    signal?: AbortSignal,
  ): Promise<BulkExportJob>;

  getExport(
    exportId: string,
    signal?: AbortSignal,
  ): Promise<BulkExportJob | null>;

  getExportFile(
    exportId: string,
    signal?: AbortSignal,
  ): Promise<DownloadResource | null>;
}
