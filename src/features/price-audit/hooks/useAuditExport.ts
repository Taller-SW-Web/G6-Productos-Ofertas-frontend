import { useEffect, useRef, useState } from "react";
import { useAuditRuntime } from "../services/AuditRuntimeContext";
import {
  AuditFailure,
  type AuditExportInput,
  type AuditJob,
} from "../services/auditRepository";

const failure = (error: unknown) =>
  error instanceof AuditFailure
    ? error
    : new AuditFailure(
        "unavailable",
        "No se pudo confirmar el resultado de la operación.",
      );
export function useAuditExport(
  input: AuditExportInput,
  id: string | null,
  onAccepted: (id: string) => void,
  navigationKey: string,
) {
  const { repository, downloader } = useAuditRuntime();
  const [job, setJob] = useState<AuditJob | null>();
  const [requestError, setRequestError] = useState<AuditFailure>();
  const [readError, setReadError] = useState<AuditFailure>();
  const [downloadError, setDownloadError] = useState<AuditFailure>();
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null);
  const download = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      download.current?.abort();
    },
    [repository],
  );
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void repository.getExport(id, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (result && result.format !== input.format) {
          setReadError(
            new AuditFailure(
              "unavailable",
              "La referencia pertenece a otro formato. Vuelve al historial.",
            ),
          );
          return;
        }
        setJob(result);
        setReadError(undefined);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const value = failure(error);
        setReadError(value);
        if (["session", "forbidden"].includes(value.kind)) setJob(undefined);
      },
    );
    return () => controller.abort();
  }, [id, input.format, repository, revision, navigationKey]);
  useEffect(() => {
    if (
      !id ||
      !job ||
      readError ||
      !["QUEUED", "PROCESSING"].includes(job.status)
    )
      return;
    const timer = setTimeout(() => setRevision((value) => value + 1), 2000);
    return () => clearTimeout(timer);
  }, [id, job, readError, revision]);
  async function submit() {
    if (request.current || id || job || requestError?.kind === "unknown")
      return;
    const controller = new AbortController();
    request.current = controller;
    setSubmitting(true);
    setRequestError(undefined);
    try {
      const result = await repository.requestExport(input, controller.signal);
      if (!controller.signal.aborted) {
        setJob(result);
        onAccepted(result.id);
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted)
        setRequestError(
          error instanceof AuditFailure
            ? error
            : new AuditFailure(
                "unknown",
                "No pudimos confirmar la solicitud. No la hemos repetido.",
              ),
        );
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }
  async function save() {
    if (
      download.current ||
      !job ||
      job.status !== "COMPLETED" ||
      !job.fileAvailable ||
      readError
    )
      return;
    const controller = new AbortController();
    download.current = controller;
    setDownloading(true);
    setDownloadError(undefined);
    try {
      const file = await repository.download(job.id, controller.signal);
      if (!controller.signal.aborted) downloader.save(file);
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        const value = failure(error);
        setDownloadError(value);
        if (["session", "forbidden"].includes(value.kind)) setJob(undefined);
      }
    } finally {
      if (download.current === controller) download.current = null;
      if (!controller.signal.aborted) setDownloading(false);
    }
  }
  return {
    job,
    requestError,
    readError,
    downloadError,
    submitting,
    downloading,
    submit,
    save,
    retry: () => setRevision((value) => value + 1),
  };
}
