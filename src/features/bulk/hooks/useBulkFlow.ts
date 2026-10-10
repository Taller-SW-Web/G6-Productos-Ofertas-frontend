import { useCallback, useEffect, useState } from "react";
import { bulkService } from "../services/bulkService";
import type {
  BulkExportFormat,
  BulkExportJob,
  BulkImportBatch,
} from "../types/bulk";
import { triggerDownload } from "../utils/downloadAsset";

type BatchQueryState =
  | { status: "loading" }
  | { status: "success"; batch: BulkImportBatch }
  | { status: "error"; message: string };

export function useBulkBatch(batchId: string | undefined) {
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    state: BatchQueryState;
  }>();
  const [lastSuccess, setLastSuccess] = useState<{
    batchId: string;
    batch: BulkImportBatch;
  }>();
  const [resuming, setResuming] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const requestKey = JSON.stringify([batchId, revision]);

  useEffect(() => {
    if (!batchId) return;
    const controller = new AbortController();
    void bulkService.getImport(batchId, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (result) {
          setLastSuccess({ batchId, batch: result });
          setResponse({
            key: requestKey,
            state: { status: "success", batch: result },
          });
        } else {
          setResponse({
            key: requestKey,
            state: {
              status: "error",
              message: `No se encontró el lote con identificador ${batchId}`,
            },
          });
        }
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo consultar la información del lote.";
        setResponse({
          key: requestKey,
          state: { status: "error", message },
        });
      },
    );
    return () => controller.abort();
  }, [batchId, revision, requestKey]);

  const refreshBatch = useCallback(async () => {
    setRevision((prev) => prev + 1);
  }, []);

  const resumeBatch = useCallback(async () => {
    if (!batchId) return;
    setResuming(true);
    try {
      const resumed = await bulkService.resumeImport(batchId);
      setLastSuccess({ batchId, batch: resumed });
      setResponse({
        key: requestKey,
        state: { status: "success", batch: resumed },
      });
      return resumed;
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo reanudar el lote de importación.";
      setResponse({
        key: requestKey,
        state: { status: "error", message },
      });
      throw err;
    } finally {
      setResuming(false);
    }
  }, [batchId, requestKey]);

  const downloadReport = useCallback(async () => {
    if (!batchId) return;
    setDownloadingReport(true);
    try {
      const resource = await bulkService.getImportReport(batchId);
      if (resource) {
        triggerDownload(resource);
      } else {
        setResponse({
          key: requestKey,
          state: {
            status: "error",
            message: "No hay reporte de errores disponible para este lote.",
          },
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Error al descargar el reporte de errores.";
      setResponse({
        key: requestKey,
        state: { status: "error", message },
      });
    } finally {
      setDownloadingReport(false);
    }
  }, [batchId, requestKey]);

  const isCurrent = response?.key === requestKey;
  const currentBatch =
    isCurrent && response.state.status === "success"
      ? response.state.batch
      : lastSuccess?.batchId === batchId
        ? (lastSuccess?.batch ?? null)
        : null;

  const loading = !isCurrent || response?.state.status === "loading";
  const error =
    isCurrent && response?.state.status === "error"
      ? response.state.message
      : null;

  return {
    batch: currentBatch,
    loading,
    error,
    resuming,
    downloadingReport,
    refreshBatch,
    resumeBatch,
    downloadReport,
  };
}

export function useBulkDownloads() {
  const [exportJob, setExportJob] = useState<BulkExportJob | null>(null);
  const [submittingExport, setSubmittingExport] = useState(false);
  const [refreshingJob, setRefreshingJob] = useState(false);
  const [downloadingExport, setDownloadingExport] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestExport = useCallback(async (format: BulkExportFormat) => {
    setSubmittingExport(true);
    setError(null);
    try {
      const job = await bulkService.createExport(format);
      setExportJob(job);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo iniciar el trabajo de exportación.";
      setError(message);
    } finally {
      setSubmittingExport(false);
    }
  }, []);

  const refreshJob = useCallback(async () => {
    if (!exportJob) return;
    setRefreshingJob(true);
    setError(null);
    try {
      const updated = await bulkService.getExport(exportJob.export_id);
      if (updated) {
        setExportJob(updated);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el estado de la exportación.";
      setError(message);
    } finally {
      setRefreshingJob(false);
    }
  }, [exportJob]);

  const downloadExportFile = useCallback(async () => {
    if (!exportJob) return;
    setDownloadingExport(true);
    setError(null);
    try {
      const resource = await bulkService.getExportFile(exportJob.export_id);
      if (resource) {
        triggerDownload(resource);
      } else {
        setError(
          "El recurso descargable no está disponible en este momento o el formato XLSX de demostración requiere integración con el servicio exportador.",
        );
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Error al descargar el archivo de exportación.";
      setError(message);
    } finally {
      setDownloadingExport(false);
    }
  }, [exportJob]);

  const downloadTemplate = useCallback(async (format: BulkExportFormat) => {
    setDownloadingTemplate(true);
    setError(null);
    try {
      const resource = await bulkService.getTemplate(format);
      if (resource) {
        triggerDownload(resource);
      } else {
        setError(
          "La plantilla XLSX no está disponible localmente (limitación de demostración: use formato CSV).",
        );
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Error al obtener la plantilla oficial.";
      setError(message);
    } finally {
      setDownloadingTemplate(false);
    }
  }, []);

  return {
    exportJob,
    submittingExport,
    refreshingJob,
    downloadingExport,
    downloadingTemplate,
    error,
    requestExport,
    refreshJob,
    downloadExportFile,
    downloadTemplate,
  };
}
