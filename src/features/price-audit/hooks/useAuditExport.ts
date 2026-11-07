import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAuditRuntime } from "../services/AuditRuntimeContext";
import { PromotionSessionContext } from "../../../app/config/PromotionSessionContext";
import {
  AuditFailure,
  type AuditExportInput,
  type AuditJob,
} from "../services/auditRepository";

const uncertaintyKey = (scope: string, format: string, filters: string) => `g6:audit-export:uncertain:${encodeURIComponent(scope)}:${format}:${encodeURIComponent(filters)}`;
const hasUncertainOutcome = (key: string) => { try { return sessionStorage.getItem(key) === "1"; } catch { return false; } };
const setUncertainOutcome = (key: string) => { try { sessionStorage.setItem(key, "1"); } catch { /* the hook latch still protects this mount */ } };
const clearUncertainOutcome = (key: string) => { try { sessionStorage.removeItem(key); } catch { /* storage can be unavailable in restricted browsers */ } };

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
  const session = useContext(PromotionSessionContext);
  const scopeId = useSyncExternalStore(
    session?.subscribe ?? (() => () => undefined),
    () => session?.snapshot().user?.id ?? "anonymous",
    () => "anonymous",
  );
  const filters = JSON.stringify(input.filters);
  const context = useMemo(
    () => ({ repository, id, format: input.format, filters, scopeId }),
    [repository, id, input.format, filters, scopeId],
  );
  type State = {
    context: typeof context;
    job?: AuditJob | null;
    requestError?: AuditFailure;
    readError?: AuditFailure;
    downloadError?: AuditFailure;
    submitting?: boolean;
    downloading?: boolean;
  };
  const [stored, setStored] = useState<State>({ context });
  // Invalidate during render, before effects: never expose a prior reference.
  const state: State = stored.context === context ? stored : { context };
  const { job, requestError, readError } = state;
  const [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null);
  const download = useRef<AbortController | null>(null);
  const update = (patch: Partial<Omit<State, "context">>) =>
    setStored((previous) => ({
      ...(previous.context === context ? previous : { context }),
      ...patch,
    }));
  useLayoutEffect(
    () => () => {
      request.current?.abort();
      download.current?.abort();
      request.current = null;
      download.current = null;
    },
    [context],
  );
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const record = (patch: Partial<Omit<State, "context">>) =>
      setStored((previous) => ({
        ...(previous.context === context ? previous : { context }),
        ...patch,
      }));
    void repository.getExport(id, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (result && (result.id !== id || result.format !== context.format)) {
          record({
            job: undefined,
            readError: new AuditFailure(
              "unavailable",
              "El servicio devolvió un trabajo distinto de la referencia o formato solicitados. Vuelve al historial.",
            ),
          });
          return;
        }
        record({ job: result, readError: undefined });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const value = failure(error);
        record({
          readError: value,
          ...(["session", "forbidden"].includes(value.kind)
            ? { job: undefined }
            : {}),
        });
      },
    );
    return () => controller.abort();
  }, [context, id, repository, revision, navigationKey]);
  useEffect(() => {
    if (
      !id ||
      !job ||
      job.id !== id ||
      readError ||
      !["QUEUED", "PROCESSING"].includes(job.status)
    )
      return;
    const timer = setTimeout(() => setRevision((value) => value + 1), 2000);
    return () => clearTimeout(timer);
  }, [id, job, readError, revision]);
  async function submit() {
    const pendingKey = uncertaintyKey(scopeId, input.format, filters);
    if (request.current || id || job || requestError?.kind === "unknown" || hasUncertainOutcome(pendingKey))
      return;
    const controller = new AbortController();
    request.current = controller;
    let repeatable = false;
    setUncertainOutcome(pendingKey);
    update({ submitting: true, requestError: undefined });
    try {
      const result = await repository.requestExport(input, controller.signal);
      if (!controller.signal.aborted) {
        if (!result.id || result.format !== input.format)
          throw new AuditFailure(
            "unknown",
            "No pudimos confirmar la referencia de la solicitud. No la hemos repetido.",
          );
        clearUncertainOutcome(pendingKey);
        onAccepted(result.id);
      }
    } catch (error: unknown) {
      repeatable = error instanceof AuditFailure && error.kind !== "unknown";
      if (!controller.signal.aborted)
        update({
          requestError:
            error instanceof AuditFailure
              ? error
              : new AuditFailure(
                  "unknown",
                  "No pudimos confirmar la solicitud. No la hemos repetido.",
                ),
        });
    } finally {
      // Keep the latch until the accepted reference is committed to navigation.
      // Unknown outcomes also stay latched, even before React paints the error.
      if (repeatable) clearUncertainOutcome(pendingKey);
      if (repeatable && request.current === controller) request.current = null;
      if (!controller.signal.aborted) update({ submitting: false });
    }
  }
  async function save() {
    if (
      download.current ||
      !id ||
      !job ||
      job.id !== id ||
      job.format !== input.format ||
      job.status !== "COMPLETED" ||
      !job.fileAvailable ||
      readError
    )
      return;
    const controller = new AbortController();
    download.current = controller;
    update({ downloading: true, downloadError: undefined });
    try {
      const file = await repository.download(id, controller.signal);
      if (!controller.signal.aborted) downloader.save(file);
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        const value = failure(error);
        update({
          downloadError: value,
          ...(["session", "forbidden"].includes(value.kind)
            ? { job: undefined }
            : {}),
        });
      }
    } finally {
      if (download.current === controller) download.current = null;
      if (!controller.signal.aborted) update({ downloading: false });
    }
  }
  return {
    job,
    requestError,
    readError,
    exportOutcomeUncertain: !id && hasUncertainOutcome(uncertaintyKey(scopeId, input.format, filters)),
    downloadError: state.downloadError,
    submitting: !!state.submitting,
    downloading: !!state.downloading,
    submit,
    save,
    retry: () => setRevision((value) => value + 1),
  };
}
