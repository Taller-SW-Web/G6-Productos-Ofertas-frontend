/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useContext as useReactContext,
  type ReactNode,
} from "react";
import type { BulkImportIntent, LocalFileCheckResult } from "../types/bulk";
import { useAuthSession } from "../../../app/config/useAuthSession";
import { DataModeContext } from "../../../app/config/DataModeContext";
import type { BulkFailureCategory } from "../services/bulkService";
import { checkLocalFile } from "../utils/localFileCheck";
import {
  AdmissionCoordinator,
  type AdmissionStatus,
  type AdmissionTask,
  LatestTaskCoordinator,
} from "../utils/asyncGuards";

export interface BulkSubmissionError {
  category: BulkFailureCategory;
  message: string;
}
export type BulkAdmissionTask = AdmissionTask<File> & { owner?: string; contentHash?: string };
type AdmissionIntent = Readonly<{ owner: string; key: string; contentHash: string; correlationId: string; batchId?: string }>;
type PendingAdmissionIntent = Pick<AdmissionIntent, "owner" | "key" | "contentHash" | "correlationId">;

interface BulkUploadContextValue {
  selectedFile: File | null;
  fileCheck: LocalFileCheckResult | null;
  checking: boolean;
  setSelectedFile: (file: File | null) => Promise<void>;
  clearSelection: () => void;
  admissionStatus: AdmissionStatus;
  beginAdmission: (file: File, retryUncertain?: boolean) => BulkAdmissionTask | null;
  finishAdmission: (
    task: BulkAdmissionTask,
    status: "ready" | "accepted" | "uncertain",
    error?: BulkSubmissionError | null,
    batchId?: string,
  ) => boolean;
  submissionError: BulkSubmissionError | null;
  pendingCorrelationId: string | null;
  pendingAdmission: PendingAdmissionIntent | null;
  expectedBatchId: string | null;
  recoveryOwnerIsCurrent: () => boolean;
  confirmReconciliation: (intent: BulkImportIntent, batchId: string) => boolean;
}

const BulkUploadContext = createContext<BulkUploadContextValue | null>(null);
const correlationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function findUncertainAdmission(owner: string): PendingAdmissionIntent | null {
  const prefix = `g6:bulk:admission:v1:${encodeURIComponent(owner)}:`;
  for (let index = 0; index < sessionStorage.length; index++) {
    const key = sessionStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as (Partial<AdmissionIntent> & { state?: string }) | null;
      if (saved?.owner === owner && saved.key === key && saved.state === "uncertain" && /^[0-9a-f]{64}$/i.test(saved.contentHash ?? "") && correlationPattern.test(saved.correlationId ?? "")) {
        return { owner, key, contentHash: saved.contentHash!, correlationId: saved.correlationId! };
      }
    } catch { throw new Error("Hay un marcador incierto ilegible para esta identidad; se bloquea una intención nueva."); }
  }
  return null;
}

export function BulkUploadProvider({ children }: { children: ReactNode }) {
  const { session, view: sessionView } = useAuthSession();
  const dataMode = useReactContext(DataModeContext);
  const [initialRecovery] = useState(() => {
    try {
      const pending = sessionView.user?.id ? findUncertainAdmission(sessionView.user.id) : null;
      return { pending, error: null as string | null };
    } catch {
      return { pending: null, error: "Hay un marcador incierto ilegible para esta identidad; se bloquea el reenvío." };
    }
  });
  const [selectedFile, setFileState] = useState<File | null>(null);
  const [fileCheck, setFileCheck] = useState<LocalFileCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [admissionStatus, setAdmissionStatus] = useState<AdmissionStatus>(initialRecovery.pending ? "uncertain" : "idle");
  const [submissionError, setSubmissionError] = useState<BulkSubmissionError | null>(initialRecovery.error
    ? { category: "unknown", message: initialRecovery.error }
    : initialRecovery.pending ? { category: "unknown", message: "Se recuperó una admisión incierta de esta identidad; no se enviará otro POST." } : null);
  const [pendingCorrelationId, setPendingCorrelationId] = useState<string | null>(initialRecovery.pending?.correlationId ?? null);
  const [pendingAdmission, setPendingAdmission] = useState<PendingAdmissionIntent | null>(initialRecovery.pending);
  const [expectedBatchId, setExpectedBatchId] = useState<string | null>(null);
  const admissionOwnerByCorrelation = useRef(new Map<string, AdmissionIntent>());
  const selectedIntent = useRef<AdmissionIntent | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const selectionGenerationRef = useRef(0);

  const admissionCoordinatorRef = useRef<AdmissionCoordinator<File> | null>(null);
  if (admissionCoordinatorRef.current == null) {
    admissionCoordinatorRef.current = new AdmissionCoordinator<File>();
  }
  const validationCoordinatorRef = useRef<LatestTaskCoordinator | null>(null);
  if (validationCoordinatorRef.current == null) {
    validationCoordinatorRef.current = new LatestTaskCoordinator();
  }

  const setSelectedFile = useCallback(async (file: File | null) => {
    const generation = ++selectionGenerationRef.current;
    selectedFileRef.current = file;
    selectedIntent.current = null;
    setPendingCorrelationId(null);
    setPendingAdmission(null);
    setExpectedBatchId(null);
    const coordinator = validationCoordinatorRef.current;
    if (!coordinator) return;
    const admissionCoordinator = admissionCoordinatorRef.current;
    let restored: { correlationId: string; status: AdmissionStatus } | undefined;
    const owner = session?.snapshot().user?.id ?? null;
    let intentKey: string | undefined;
    let fingerprint: string | null = null;
    if (file && owner) {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      fingerprint = [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
      if (generation !== selectionGenerationRef.current || selectedFileRef.current !== file || session?.snapshot().user?.id !== owner) return;
      intentKey = `g6:bulk:admission:v1:${encodeURIComponent(owner)}:${fingerprint}`;
      try {
        const raw = sessionStorage.getItem(intentKey);
        if (raw) {
          const saved = JSON.parse(raw) as { owner?: string; key?: string; contentHash?: string; correlationId?: string; batchId?: string; state?: string };
          if (saved.owner !== owner || saved.key !== intentKey || saved.contentHash !== fingerprint || !correlationPattern.test(saved.correlationId ?? "") || !["accepted", "uncertain"].includes(saved.state ?? "") || (saved.state === "accepted" && !saved.batchId)) throw new Error("Marcador de admisión incompatible.");
          if (saved.state === "uncertain") {
            restored = { correlationId: saved.correlationId!, status: "uncertain" };
            const intent = Object.freeze({ owner, key: intentKey, contentHash: fingerprint, correlationId: saved.correlationId! });
            selectedIntent.current = intent;
            setPendingAdmission(intent);
            setPendingCorrelationId(saved.correlationId!);
            setSubmissionError({ category: "unknown", message: "La admisión quedó incierta. Se conserva su identidad; no se enviará otro POST." });
          } else {
            // Selecting the same bytes again after a confirmed batch is a new, explicit intention.
            sessionStorage.removeItem(intentKey);
            setSubmissionError(null);
            const unresolved = findUncertainAdmission(owner);
            if (unresolved) {
              restored = { correlationId: unresolved.correlationId, status: "uncertain" };
              selectedIntent.current = unresolved;
              setPendingAdmission(unresolved);
              setPendingCorrelationId(unresolved.correlationId);
              setSubmissionError({ category: "unknown", message: "Hay otra admisión incierta para esta identidad. No se crea una intención nueva hasta conciliarla." });
            }
          }
        } else {
          const unresolved = findUncertainAdmission(owner);
          if (unresolved) {
            restored = { correlationId: unresolved.correlationId, status: "uncertain" };
            selectedIntent.current = unresolved;
            setPendingAdmission(unresolved);
            setPendingCorrelationId(unresolved.correlationId);
            setSubmissionError({ category: "unknown", message: "Hay otra admisión incierta para esta identidad. No se crea una intención nueva hasta conciliarla." });
          }
        }
      } catch {
        restored = { correlationId: "", status: "uncertain" };
        setPendingCorrelationId(null);
        setPendingAdmission(null);
        setSubmissionError({ category: "unknown", message: "El marcador de admisión está ilegible o inaccesible; se bloquea el reenvío." });
      }
    }
    if (generation !== selectionGenerationRef.current || selectedFileRef.current !== file) return;
    admissionCoordinator?.select(file, restored);
    const correlation = restored?.correlationId ?? admissionCoordinator?.correlationId;
    if (file && owner && intentKey && correlation && fingerprint && !selectedIntent.current) {
      selectedIntent.current = Object.freeze({ owner, key: intentKey, contentHash: fingerprint, correlationId: correlation });
    }
    setAdmissionStatus(admissionCoordinator?.status ?? "idle");
    if (!restored) setSubmissionError(null);

    if (!file) {
      coordinator.cancel();
      setFileState(null);
      setFileCheck(null);
      setChecking(false);
      return;
    }

    setFileState(file);
    setFileCheck(null); // Invalidate previous result immediately
    setChecking(true);
    const task = coordinator.start();

    try {
      const result = await checkLocalFile(file, task.signal, dataMode === "api" ? 2 : undefined);
      // Only commit result if this is still the active validation
      if (task.isCurrent() && generation === selectionGenerationRef.current && selectedFileRef.current === file && (!owner || session?.snapshot().user?.id === owner)) {
        setFileCheck(result);
      }
    } catch (err) {
      if (!task.signal.aborted) throw err;
    } finally {
      if (task.isCurrent() && generation === selectionGenerationRef.current && selectedFileRef.current === file && (!owner || session?.snapshot().user?.id === owner)) {
        setChecking(false);
      }
    }
  }, [session, dataMode]);

  const clearSelection = useCallback(() => {
    selectionGenerationRef.current++;
    selectedFileRef.current = null;
    selectedIntent.current = null;
    validationCoordinatorRef.current?.cancel();
    admissionCoordinatorRef.current?.select(null);
    setFileState(null);
    setFileCheck(null);
    setChecking(false);
    setSubmissionError(null);
    setAdmissionStatus("idle");
    setPendingCorrelationId(null);
    setPendingAdmission(null);
    setExpectedBatchId(null);
  }, []);

  const beginAdmission = useCallback((file: File, retryUncertain = false): BulkAdmissionTask | null => {
    const intent = selectedIntent.current;
    const owner = session?.snapshot().user?.id;
    if (retryUncertain && dataMode !== "mock") return null;
    if (selectedFileRef.current !== file) return null;
    if (dataMode !== "mock" && (!intent || !owner || intent.owner !== owner)) return null;
    const task = admissionCoordinatorRef.current?.begin(file, retryUncertain) ?? null;
    if (task) {
      if (intent) {
        if (task.correlationId !== intent.correlationId || intent.owner !== owner || intent.key !== `g6:bulk:admission:v1:${encodeURIComponent(owner)}:${intent.contentHash}`) {
          admissionCoordinatorRef.current?.finish(task, "ready");
          return null;
        }
        const immutableIntent = Object.freeze({ ...intent, correlationId: task.correlationId });
        admissionOwnerByCorrelation.current.set(task.correlationId, immutableIntent);
        try {
          const existingRaw = sessionStorage.getItem(intent.key);
          if (existingRaw !== null) {
            const existing = JSON.parse(existingRaw) as Partial<AdmissionIntent>;
            if (existing.owner !== immutableIntent.owner || existing.contentHash !== immutableIntent.contentHash || existing.correlationId !== immutableIntent.correlationId) throw new Error("Marcador distinto para esta intención.");
          }
          sessionStorage.setItem(intent.key, JSON.stringify({ ...immutableIntent, state: "uncertain" }));
        }
        catch {
          admissionCoordinatorRef.current?.finish(task, "ready");
          setAdmissionStatus("ready");
          setSubmissionError({ category: "unknown", message: "No se pudo guardar la correlación; no se envió el archivo." });
          return null;
      }
      }
    }
    if (task) setAdmissionStatus(admissionCoordinatorRef.current?.status ?? "idle");
    return task ? { ...task, ...(intent ? { owner: intent.owner, contentHash: intent.contentHash } : {}) } : null;
  }, [dataMode, session]);

  const finishAdmission = useCallback((
    task: BulkAdmissionTask,
    status: "ready" | "accepted" | "uncertain",
    error: BulkSubmissionError | null = null,
    batchId?: string,
  ) => {
    const coordinator = admissionCoordinatorRef.current;
    const intent = admissionOwnerByCorrelation.current.get(task.correlationId);
    if (intent && (task.correlationId !== intent.correlationId || task.owner !== intent.owner || task.contentHash !== intent.contentHash || session?.snapshot().user?.id !== intent.owner)) {
      coordinator?.finish(task, status);
      return false;
    }
    if (intent?.key) {
      try {
        const existing = JSON.parse(sessionStorage.getItem(intent.key) ?? "null") as Partial<AdmissionIntent> | null;
        if (!existing || existing.owner !== intent.owner || existing.key !== intent.key || existing.contentHash !== intent.contentHash || existing.correlationId !== intent.correlationId) return false;
        if (status === "accepted") {
          if (!batchId) return false;
          const acceptedIntent = Object.freeze({ ...intent, batchId });
          selectedIntent.current = acceptedIntent;
          setExpectedBatchId(batchId);
          sessionStorage.setItem(intent.key, JSON.stringify({ ...acceptedIntent, state: status }));
          setPendingAdmission(null);
        } else if (status === "uncertain") {
          sessionStorage.setItem(intent.key, JSON.stringify({ ...intent, state: status }));
          setPendingAdmission(intent);
        } else {
          sessionStorage.removeItem(intent.key);
          setPendingAdmission(null);
        }
      } catch { /* repository-level marker remains fail-closed */ }
      if (status !== "uncertain") setPendingCorrelationId(null);
    }
    if (!coordinator?.finish(task, status)) return false;
    setAdmissionStatus(coordinator.status);
    setSubmissionError(error);
    return true;
  }, [session]);

  const recoveryOwnerIsCurrent = useCallback(() => {
    const owner = selectedIntent.current?.owner ?? pendingAdmission?.owner;
    return owner === sessionView.user?.id && owner === session?.snapshot().user?.id;
  }, [pendingAdmission?.owner, session, sessionView.user?.id]);

  const confirmReconciliation = useCallback((intent: BulkImportIntent, batchId: string) => {
    if (!correlationPattern.test(intent.correlationId) || !correlationPattern.test(batchId) || session?.snapshot().user?.id !== intent.owner) return false;
    const key = `g6:bulk:admission:v1:${encodeURIComponent(intent.owner)}:${intent.contentHash}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as (Partial<AdmissionIntent> & { state?: string }) | null;
      if (!saved || saved.owner !== intent.owner || saved.key !== key || saved.contentHash !== intent.contentHash || saved.correlationId !== intent.correlationId || saved.state !== "uncertain") return false;
      const accepted = Object.freeze({ owner: intent.owner, key, contentHash: intent.contentHash, correlationId: intent.correlationId, batchId });
      sessionStorage.setItem(key, JSON.stringify({ ...accepted, state: "accepted" }));
      const transportKey = `g6:bulk:import-pending:${encodeURIComponent(intent.owner)}:${encodeURIComponent(intent.correlationId)}`;
      const transportMarker = JSON.parse(sessionStorage.getItem(transportKey) ?? "null") as Record<string, unknown> | null;
      if (transportMarker?.userId === intent.owner && transportMarker.correlationId === intent.correlationId && transportMarker.contentHash === intent.contentHash) {
        sessionStorage.setItem(transportKey, JSON.stringify({ ...transportMarker, batchId, state: "CONFIRMED" }));
      }
      selectedIntent.current = accepted;
      setPendingAdmission(null);
      setPendingCorrelationId(null);
      setExpectedBatchId(batchId);
      setAdmissionStatus("accepted");
      setSubmissionError(null);
      return true;
    } catch { return false; }
  }, [session]);

  return (
    <BulkUploadContext.Provider
      value={{
        selectedFile,
        fileCheck,
        checking,
        setSelectedFile,
        clearSelection,
        admissionStatus,
        beginAdmission,
        finishAdmission,
        submissionError,
        pendingCorrelationId,
        pendingAdmission,
        expectedBatchId,
        recoveryOwnerIsCurrent,
        confirmReconciliation,
      }}
    >
      {children}
    </BulkUploadContext.Provider>
  );
}

export function useBulkUploadContext(): BulkUploadContextValue {
  const context = useContext(BulkUploadContext);
  if (!context) {
    throw new Error(
      "useBulkUploadContext debe utilizarse dentro de un BulkUploadProvider",
    );
  }
  return context;
}
