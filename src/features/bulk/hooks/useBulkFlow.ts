import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type {
  BulkExportFormat,
  BulkExportJob,
  BulkImportBatch,
} from "../types/bulk";
import { canRequestImportReport, type DownloadResource } from "../services/bulkRepository";
import {
  getDownloadFailureMessage,
  getUnavailableDownloadMessage,
} from "../services/downloadMessages";
import { triggerDownload } from "../utils/downloadAsset";
import { useBulkRepository, useBulkRepositorySelection } from "./useBulkRepository";
import {
  canDownloadExport,
  canResumeBatch,
  confirmsBulkResumeProgress,
  isExportSnapshotStale,
  resumeBatchWhenAllowed,
  getBulkPollDelay,
  shouldPollBatch,
  shouldPollExport,
  selectBatchQueryView,
  type BatchQueryState,
} from "./bulkQueryState";
import { useMockStateRevision } from "../../shared/useMockStateRevision";
import { PromotionSessionContext } from "../../../app/config/PromotionSessionContext";
import { clearBulkResumeRequest, getBulkResumeIntent, getOrCreateBulkResumeRequest, hasAcceptedBulkResumeForBatch, hasUncertainBulkResumeForBatch, markBulkResumeAccepted, markBulkResumeUncertain } from "../utils/bulkResumeIntent";

export function useBulkBatch(batchId: string | undefined) {
  const repository = useBulkRepository();
  const session = useContext(PromotionSessionContext);
  const [sessionIdentity, setSessionIdentity] = useState(() => session?.snapshot().user?.id);
  const [revision, setRevision] = useState(0);
  const mockRevision = useMockStateRevision(["bulk"]);
  const [response, setResponse] = useState<{
    key: string;
    state: BatchQueryState;
  }>();
  const [lastSuccess, setLastSuccess] = useState<{
    batchId: string;
    batch: BulkImportBatch;
    owner?: string;
  }>();
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeRefreshStatus, setResumeRefreshStatus] = useState<"accepted_refreshing" | "accepted_refresh_failed" | null>(() => {
    if (!batchId) return null;
    if (sessionIdentity && getBulkResumeIntent(sessionIdentity, batchId)?.status === "ACCEPTED_PENDING_REFRESH") return "accepted_refreshing";
    return hasAcceptedBulkResumeForBatch(batchId) ? "accepted_refresh_failed" : null;
  });
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const resumeInFlight = useRef(false);
  const resumeAcceptedRef = useRef(false);
  const reportInFlight = useRef(false);

  useEffect(() => {
    if (!session) return;
    const updateIdentity = () => setSessionIdentity(session.snapshot().user?.id);
    updateIdentity();
    return session.subscribe(updateIdentity);
  }, [session]);

  const requestKey = JSON.stringify([batchId, revision + mockRevision, sessionIdentity]);
  const acceptedByAnotherIdentity = Boolean(batchId && hasAcceptedBulkResumeForBatch(batchId) &&
    getBulkResumeIntent(sessionIdentity ?? "", batchId)?.status !== "ACCEPTED_PENDING_REFRESH");

  useEffect(() => {
    if (!batchId) return;
    const controller = new AbortController();
    let attempt = 0;
    const acceptedIntent = sessionIdentity ? getBulkResumeIntent(sessionIdentity, batchId) : undefined;
    resumeAcceptedRef.current = acceptedIntent?.status === "ACCEPTED_PENDING_REFRESH";
    if (acceptedByAnotherIdentity) return () => controller.abort();
    const wait = (delay: number) => new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, delay);
      controller.signal.addEventListener("abort", done, { once: true });
    });
    const poll = async () => {
      while (!controller.signal.aborted) {
        try {
          const result = await repository.getImport(batchId, controller.signal, sessionIdentity);
          if (controller.signal.aborted || session?.snapshot().user?.id !== sessionIdentity) return;
          if (!result) {
            if (resumeAcceptedRef.current) {
              setResponse({ key: requestKey, state: { status: "error", message: "La reanudación fue aceptada, pero no se pudo recuperar el lote actualizado." } });
              setResumeRefreshStatus("accepted_refresh_failed");
            } else {
              setResponse({ key: requestKey, state: { status: "not_found" } });
            }
            return;
          }
          if (result.batch_id !== batchId || (acceptedIntent?.originalCorrelationId && result.correlation_id !== acceptedIntent.originalCorrelationId)) {
            setResponse({ key: requestKey, state: { status: "error", message: "La actualización devolvió una identidad distinta; se conserva el bloqueo de reanudación." } });
            if (resumeAcceptedRef.current) setResumeRefreshStatus("accepted_refresh_failed");
            return;
          }
          const advanced = acceptedIntent?.status === "ACCEPTED_PENDING_REFRESH" && confirmsBulkResumeProgress({
            batch: result, batchId, originalCorrelationId: acceptedIntent.originalCorrelationId,
          });
          if (resumeAcceptedRef.current && !advanced) {
            setResponse({ key: requestKey, state: { status: "error", message: "La consulta aún no demuestra el avance de la reanudación; se conserva el último estado como histórico." } });
            setResumeRefreshStatus("accepted_refresh_failed");
            return;
          }
          if (resumeAcceptedRef.current && acceptedIntent && sessionIdentity) {
            clearBulkResumeRequest(sessionIdentity, batchId);
            resumeAcceptedRef.current = false;
            setResumeRefreshStatus(null);
          }
          setLastSuccess({ batchId, batch: result, owner: sessionIdentity });
          setResponse({ key: requestKey, state: { status: "success", batch: result } });
          if (!shouldPollBatch(result)) return;
          attempt = 0;
        } catch (err: unknown) {
          if (controller.signal.aborted) return;
          const message = err instanceof Error ? err.message : "No se pudo consultar la información del lote.";
          setResponse({ key: requestKey, state: { status: "error", message } });
          if (resumeAcceptedRef.current) setResumeRefreshStatus("accepted_refresh_failed");
          const status = typeof err === "object" && err !== null && "status" in err ? (err as { status?: unknown }).status : undefined;
          if (typeof status === "number" && status < 500 && status !== 408 && status !== 429) return;
        }
        await wait(getBulkPollDelay(attempt++));
      }
    };
    void poll();
    return () => controller.abort();
  }, [acceptedByAnotherIdentity, batchId, requestKey, repository, session, sessionIdentity]);

  const batchView = selectBatchQueryView({
    batchId,
    requestKey,
    owner: sessionIdentity,
    response,
    lastSuccess,
  });
  const acceptedResumePending = Boolean(batchId && hasAcceptedBulkResumeForBatch(batchId));
  const uncertainResumePending = Boolean(batchId && hasUncertainBulkResumeForBatch(batchId));
  const visibleResumeRefreshStatus = acceptedByAnotherIdentity
    ? "accepted_refresh_failed"
    : acceptedResumePending ? resumeRefreshStatus ?? "accepted_refreshing" : null;
  const batchError = acceptedByAnotherIdentity
    ? "Este lote tiene una reanudación aceptada por otra identidad de usuario. Recupera la sesión original para continuar."
    : batchView.error;
  const reportAvailable = Boolean(
    batchView.batch && canRequestImportReport(repository, batchView.batch),
  );
  // Eligibility is derived from the visible snapshot; a stale/loading/errored
  // batch never authorizes a resumption write.
  const canResume = canResumeBatch({
    batch: batchView.batch,
    loading: batchView.loading,
    error: batchError,
    isStale: batchView.isStale,
    isNotFound: batchView.isNotFound,
    resuming,
  }) && repository.resumeSupported !== false;
  const canResumeNow = canResume && !acceptedResumePending && !uncertainResumePending;

  const refreshBatch = useCallback(() => {
    setRevision((prev) => prev + 1);
  }, []);

  const resumeBatch = useCallback(async () => {
    return resumeBatchWhenAllowed(canResumeNow, async () => {
      if (!batchId || resumeInFlight.current) return undefined;
      resumeInFlight.current = true;
      setResuming(true);
      setResumeError(null);
      let requestCorrelationId: string | undefined;
      try {
        const owner = sessionIdentity ?? "mock";
        const request = getOrCreateBulkResumeRequest(owner, batchId, sessionStorage, batchView.batch?.correlation_id);
        requestCorrelationId = request.correlationId;
        const accepted = await repository.resumeImport(batchId, undefined, request);
        if (accepted.batch_id !== batchId || accepted.status !== "QUEUED" || accepted.template_version !== 2 ||
            (batchView.batch?.correlation_id !== undefined && accepted.correlation_id !== batchView.batch.correlation_id)) {
          throw new Error("La respuesta no confirmó el retry del lote solicitado; se conserva la correlación.");
        }
        markBulkResumeAccepted(owner, batchId, request.correlationId, request.originalCorrelationId);
        if (sessionIdentity && session?.snapshot().user?.id !== sessionIdentity) {
          throw new Error("La sesión cambió después de aceptar la reanudación; se conserva la identidad original y se requiere recuperar esa sesión.");
        }
        resumeAcceptedRef.current = true;
        setResumeRefreshStatus("accepted_refreshing");
        setResumeError(null);
        setRevision((prev) => prev + 1);
        return accepted;
      } catch (err: unknown) {
        const owner = sessionIdentity ?? "mock";
        if (requestCorrelationId && getBulkResumeIntent(owner, batchId)?.status !== "ACCEPTED_PENDING_REFRESH") {
          markBulkResumeUncertain(owner, batchId);
        }
        if (sessionIdentity && session?.snapshot().user?.id !== sessionIdentity) return undefined;
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo reanudar el lote de importación.";
        setResumeError(message);
        throw err;
      } finally {
        resumeInFlight.current = false;
        setResuming(false);
      }
    });
  }, [batchId, batchView.batch, canResumeNow, repository, session, sessionIdentity]);

  const downloadReport = useCallback(async () => {
    if (!batchId || reportInFlight.current) return;
    reportInFlight.current = true;
    setDownloadingReport(true);
    setReportError(null);
    try {
      const resource = await repository.getImportReport(batchId);
      if (resource) {
        triggerDownload(resource);
      } else {
        setReportError("El servicio no entregó un reporte descargable para este lote.");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Error al descargar el reporte de errores.";
      setReportError(message);
    } finally {
      reportInFlight.current = false;
      setDownloadingReport(false);
    }
  }, [batchId, repository]);

  return {
    batch: batchView.batch,
    loading: batchView.loading,
    error: batchView.error,
    isNotFound: batchView.isNotFound,
    isStale: batchView.isStale,
    resuming,
    resumeError,
    resumeRefreshStatus: visibleResumeRefreshStatus,
    canResume: canResumeNow,
    downloadingReport,
    reportError,
    reportAvailable,
    refreshBatch,
    resumeBatch,
    downloadReport,
  };
}

type ExportQueryState =
  | { exportId: string; revision: number; status: "success"; job: BulkExportJob }
  | { exportId: string; revision: number; status: "not_found" }
  | { exportId: string; revision: number; status: "error"; message: string };

export function useBulkDownloads(initialExportId?: string) {
  const { mode, repository } = useBulkRepositorySelection();
  const [exportJobState, setExportJobState] = useState<{
    routeExportId?: string;
    job: BulkExportJob;
  }>();
  const [createdJob, setCreatedJob] = useState<{
    routeExportId?: string;
    job: BulkExportJob;
  }>();
  const [queryState, setQueryState] = useState<ExportQueryState>();
  const [refreshErrorForExport, setRefreshErrorForExport] = useState<{
    exportId: string;
    message: string;
  }>();
  const [queryRevision, setQueryRevision] = useState(0);
  const [submittingExport, setSubmittingExport] = useState(false);
  const [refreshingJob, setRefreshingJob] = useState(false);
  const [downloadingExport, setDownloadingExport] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);
  const exportInFlight = useRef(false);

  useEffect(() => {
    if (!initialExportId || createdJob?.job.export_id === initialExportId) return;
    const controller = new AbortController();
    void repository.getExport(initialExportId, controller.signal).then(
      (job) => {
        if (controller.signal.aborted) return;
        if (job) {
          setExportJobState({ routeExportId: initialExportId, job });
          setRefreshErrorForExport(undefined);
          setQueryState({ exportId: initialExportId, revision: queryRevision, status: "success", job });
        } else {
          setExportJobState(undefined);
          setRefreshErrorForExport(undefined);
          setQueryState({ exportId: initialExportId, revision: queryRevision, status: "not_found" });
        }
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setQueryState({
          exportId: initialExportId,
          revision: queryRevision,
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "No se pudo consultar el trabajo de exportación.",
        });
      },
    );
    return () => controller.abort();
  }, [initialExportId, queryRevision, repository, createdJob?.job.export_id]);

  const queryMatches = Boolean(
    queryState &&
      queryState.exportId === initialExportId &&
      queryState.revision === queryRevision,
  );
  const matchingQuery = queryMatches ? queryState : undefined;
  const createdJobMatches = Boolean(
    createdJob && (createdJob.routeExportId === initialExportId || createdJob.job.export_id === initialExportId),
  );
  const jobMatchesCurrentRoute =
    exportJobState?.routeExportId === initialExportId;
  const visibleJob = createdJobMatches
    ? createdJob?.job ?? null
    : matchingQuery?.status === "success"
      ? matchingQuery.job
      : jobMatchesCurrentRoute
        ? exportJobState?.job ?? null
        : null;
  useEffect(() => {
    if (!visibleJob || !shouldPollExport(visibleJob)) return;
    const controller = new AbortController();
    let attempt = 0;
    const wait = (delay: number) => new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, delay);
      controller.signal.addEventListener("abort", done, { once: true });
    });
    const poll = async () => {
      let job = visibleJob;
      while (!controller.signal.aborted && shouldPollExport(job)) {
        await wait(getBulkPollDelay(attempt++));
        if (controller.signal.aborted) return;
        try {
          const updated = await repository.getExport(job.export_id, controller.signal);
          if (controller.signal.aborted) return;
          if (!updated) {
            setRefreshErrorForExport({ exportId: job.export_id, message: "El trabajo de exportación ya no está disponible." });
            return;
          }
          job = updated;
          setRefreshErrorForExport(undefined);
          if (createdJobMatches) setCreatedJob({ routeExportId: initialExportId, job: updated });
          else setExportJobState({ routeExportId: initialExportId, job: updated });
          if (initialExportId === updated.export_id) setQueryState({ exportId: updated.export_id, revision: queryRevision, status: "success", job: updated });
          attempt = 0;
        } catch (err: unknown) {
          if (controller.signal.aborted) return;
          const message = err instanceof Error ? err.message : "No se pudo consultar el trabajo de exportación.";
          setRefreshErrorForExport({ exportId: job.export_id, message });
          const status = typeof err === "object" && err !== null && "status" in err ? (err as { status?: unknown }).status : undefined;
          if (typeof status === "number" && status < 500 && status !== 408 && status !== 429) return;
        }
      }
    };
    void poll();
    return () => controller.abort();
  }, [visibleJob, repository, createdJobMatches, initialExportId, queryRevision]);
  const initialQueryStatus = initialExportId && !createdJobMatches
    ? matchingQuery
      ? matchingQuery.status
      : "loading"
    : null;
  const initialQueryError =
    !createdJobMatches && matchingQuery?.status === "error"
      ? matchingQuery.message
      : null;
  const exportJobStale = isExportSnapshotStale({
    visibleExportId: visibleJob?.export_id,
    initialExportId,
    routeExportId: exportJobState?.routeExportId,
    createdJobMatches,
    currentQueryStatus: matchingQuery?.status,
    refreshErrorExportId: refreshErrorForExport?.exportId,
  });
  // Only a completed, current job with a genuine resource may be downloaded. A
  // stale snapshot never authorizes a download.
  const downloadExportAllowed = canDownloadExport({
    job: visibleJob,
    isStale: exportJobStale,
    dataMode: mode,
  });

  const requestExport = useCallback(
    async (format: BulkExportFormat) => {
      if (exportInFlight.current) return;
      exportInFlight.current = true;
      setSubmittingExport(true);
      setError(null);
      try {
        const job = await repository.createExport(format);
        setCreatedJob({ routeExportId: initialExportId, job });
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo iniciar el trabajo de exportación.",
        );
      } finally {
        exportInFlight.current = false;
        setSubmittingExport(false);
      }
    },
    [initialExportId, repository],
  );

  const refreshJob = useCallback(async () => {
    if (!visibleJob || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshingJob(true);
    setError(null);
    try {
      const updated = await repository.getExport(visibleJob.export_id);
      if (updated) {
        setRefreshErrorForExport(undefined);
        if (createdJobMatches) {
          setCreatedJob({ routeExportId: initialExportId, job: updated });
        } else {
          setExportJobState({ routeExportId: initialExportId, job: updated });
        }
        if (initialExportId === updated.export_id) {
          setQueryState({ exportId: updated.export_id, revision: queryRevision, status: "success", job: updated });
        }
      } else if (initialExportId === visibleJob.export_id) {
        setRefreshErrorForExport(undefined);
        setExportJobState(undefined);
        setCreatedJob(undefined);
        setQueryState({ exportId: visibleJob.export_id, revision: queryRevision, status: "not_found" });
      } else {
        const message = "El trabajo de exportación ya no está disponible.";
        setRefreshErrorForExport({ exportId: visibleJob.export_id, message });
        setError(message);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el estado de la exportación.";
      setRefreshErrorForExport({ exportId: visibleJob.export_id, message });
      setError(message);
    } finally {
      refreshInFlight.current = false;
      setRefreshingJob(false);
    }
  }, [createdJobMatches, initialExportId, queryRevision, repository, visibleJob]);

  const retryInitialQuery = useCallback(() => {
    if (initialExportId) setQueryRevision((revision) => revision + 1);
  }, [initialExportId]);

  const downloadExportFile = useCallback(async () => {
    if (!downloadExportAllowed || !visibleJob) return;
    setDownloadingExport(true);
    setError(null);
    try {
      const resource = await repository.getExportFile(visibleJob.export_id);
      if (resource) {
        triggerDownload(resource);
      } else {
        setError(getUnavailableDownloadMessage(mode, "exportación", visibleJob.format));
      }
    } catch (err: unknown) {
      setError(getDownloadFailureMessage(err, "exportación"));
    } finally {
      setDownloadingExport(false);
    }
  }, [downloadExportAllowed, mode, repository, visibleJob]);

  const downloadTemplate = useCallback(
    async (format: BulkExportFormat) => {
      setDownloadingTemplate(true);
      setError(null);
      try {
        const resource: DownloadResource | null = await repository.getTemplate(format);
        if (resource) {
          triggerDownload(resource);
        } else {
          setError(getUnavailableDownloadMessage(mode, "plantilla", format));
        }
      } catch (err: unknown) {
        setError(getDownloadFailureMessage(err, "plantilla"));
      } finally {
        setDownloadingTemplate(false);
      }
    },
    [mode, repository],
  );

  return {
    exportJob: visibleJob,
    dataMode: mode,
    submittingExport,
    refreshingJob,
    downloadingExport,
    downloadingTemplate,
    error,
    initialQueryStatus,
    initialQueryError,
    isStale: exportJobStale,
    canDownloadExport: downloadExportAllowed,
    requestExport,
    refreshJob,
    retryInitialQuery,
    downloadExportFile,
    downloadTemplate,
  };
}
