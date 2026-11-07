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
import type { LocalFileCheckResult } from "../types/bulk";
import { PromotionSessionContext } from "../../../app/config/PromotionSessionContext";
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
export type BulkAdmissionTask = AdmissionTask<File> & { owner?: string; contentHash?: string; expectedBatchId?: string };

interface BulkUploadContextValue {
  selectedFile: File | null;
  fileCheck: LocalFileCheckResult | null;
  checking: boolean;
  setSelectedFile: (file: File | null) => Promise<void>;
  clearSelection: () => void;
  admissionStatus: AdmissionStatus;
  beginAdmission: (file: File, retryUncertain?: boolean) => BulkAdmissionTask | null;
  finishAdmission: (
    task: AdmissionTask<File>,
    status: "ready" | "accepted" | "uncertain",
    error?: BulkSubmissionError | null,
  ) => boolean;
  submissionError: BulkSubmissionError | null;
  pendingCorrelationId: string | null;
  expectedBatchId: string | null;
  confirmRecoveredBatch: (batchId: string) => boolean;
  recoveryOwnerIsCurrent: () => boolean;
  recoveryOwnerId: () => string | null;
}

const BulkUploadContext = createContext<BulkUploadContextValue | null>(null);

export function BulkUploadProvider({ children }: { children: ReactNode }) {
  const session = useReactContext(PromotionSessionContext);
  const dataMode = useReactContext(DataModeContext);
  const [selectedFile, setFileState] = useState<File | null>(null);
  const [fileCheck, setFileCheck] = useState<LocalFileCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [admissionStatus, setAdmissionStatus] = useState<AdmissionStatus>("idle");
  const [submissionError, setSubmissionError] =
    useState<BulkSubmissionError | null>(null);
  const [pendingCorrelationId, setPendingCorrelationId] = useState<string | null>(null);
  const [expectedBatchId, setExpectedBatchId] = useState<string | null>(null);
  const admissionOwnerByCorrelation = useRef(new Map<string, { owner: string; key: string; contentHash?: string; batchId?: string }>());
  const selectedIntent = useRef<{ owner: string; key: string; contentHash: string; batchId: string } | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const selectionGenerationRef = useRef(0);

  const deriveBatchId = async (correlationId: string, contentHash: string) => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${correlationId}:${contentHash}`)));
    const hex = [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
    const value = hex.slice(0, 12) + "4" + hex.slice(13, 16) + "8" + hex.slice(17, 20) + hex.slice(20, 32);
    return [value.slice(0, 8), value.slice(8, 12), value.slice(12, 16), value.slice(16, 20), value.slice(20)].join("-");
  };

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
    setExpectedBatchId(null);
    const coordinator = validationCoordinatorRef.current;
    if (!coordinator) return;
    const admissionCoordinator = admissionCoordinatorRef.current;
    let restored: { correlationId: string; status: AdmissionStatus } | undefined;
    const owner = session?.snapshot().user?.id ?? null;
    let intentKey: string | undefined;
    if (file && owner) {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      const fingerprint = [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
      if (generation !== selectionGenerationRef.current || selectedFileRef.current !== file || session?.snapshot().user?.id !== owner) return;
      intentKey = `g6:bulk:admission:v1:${encodeURIComponent(owner)}:${fingerprint}`;
      try {
        const raw = sessionStorage.getItem(intentKey);
        if (raw) {
          const saved = JSON.parse(raw) as { owner?: string; contentHash?: string; correlationId?: string; batchId?: string; state?: string };
          if (saved.owner !== owner || saved.contentHash !== fingerprint || !saved.correlationId || !saved.batchId) throw new Error("Marcador de admisión incompatible.");
          restored = { correlationId: saved.correlationId, status: saved.state === "accepted" ? "accepted" : "uncertain" };
          selectedIntent.current = { owner, key: intentKey, contentHash: fingerprint, batchId: saved.batchId };
          setPendingCorrelationId(saved.correlationId);
          setExpectedBatchId(saved.batchId);
          setSubmissionError(restored.status === "accepted" ? null : { category: "unknown", message: "Importación sin respuesta recuperada. Se consultará el batchId determinista; un 404 no acredita que el POST no se haya aplicado." });
        } else setPendingCorrelationId(null);
      } catch {
        restored = { correlationId: "", status: "uncertain" };
        setPendingCorrelationId(null);
        setSubmissionError({ category: "unknown", message: "El marcador de admisión está ilegible o inaccesible; se bloquea el reenvío." });
      }
    }
    if (generation !== selectionGenerationRef.current || selectedFileRef.current !== file) return;
    admissionCoordinator?.select(file, restored);
    const correlation = restored?.correlationId ?? admissionCoordinator?.correlationId;
    if (file && owner && intentKey && correlation && !selectedIntent.current) {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      const contentHash = [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
      const batchId = await deriveBatchId(correlation, contentHash);
      selectedIntent.current = { owner, key: intentKey, contentHash, batchId };
      setExpectedBatchId(batchId);
    }
    const selectedCorrelation = restored?.correlationId;
    if (selectedCorrelation && owner && intentKey) admissionOwnerByCorrelation.current.set(selectedCorrelation, { owner, key: intentKey });
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
      const result = await checkLocalFile(file, task.signal);
      // Only commit result if this is still the active validation
      if (task.isCurrent()) {
        setFileCheck(result);
      }
    } catch (err) {
      if (!task.signal.aborted) throw err;
    } finally {
      if (task.isCurrent()) {
        setChecking(false);
      }
    }
  }, [session]);

  const clearSelection = useCallback(() => {
    validationCoordinatorRef.current?.cancel();
    admissionCoordinatorRef.current?.select(null);
    setFileState(null);
    setFileCheck(null);
    setChecking(false);
    setSubmissionError(null);
    setAdmissionStatus("idle");
  }, []);

  const beginAdmission = useCallback((file: File, retryUncertain = false): BulkAdmissionTask | null => {
    const intent = selectedIntent.current;
    const owner = session?.snapshot().user?.id;
    if (selectedFileRef.current !== file) return null;
    if (dataMode !== "mock" && (!intent || !owner || intent.owner !== owner)) return null;
    const task = admissionCoordinatorRef.current?.begin(file, retryUncertain) ?? null;
    if (task) {
      if (intent) {
        admissionOwnerByCorrelation.current.set(task.correlationId, { owner: intent.owner, key: intent.key });
        try { sessionStorage.setItem(intent.key, JSON.stringify({ owner: intent.owner, contentHash: intent.contentHash, correlationId: task.correlationId, batchId: intent.batchId })); }
        catch {
          admissionCoordinatorRef.current?.finish(task, "ready");
          setAdmissionStatus("ready");
          setSubmissionError({ category: "unknown", message: "No se pudo guardar la correlación y el batchId; no se envió el archivo." });
          return null;
      }
      }
    }
    if (task) setAdmissionStatus(admissionCoordinatorRef.current?.status ?? "idle");
    return task ? { ...task, ...(intent ? { owner: intent.owner, contentHash: intent.contentHash, expectedBatchId: intent.batchId } : {}) } : null;
  }, [dataMode, session]);

  const finishAdmission = useCallback((
    task: AdmissionTask<File>,
    status: "ready" | "accepted" | "uncertain",
    error: BulkSubmissionError | null = null,
  ) => {
    const coordinator = admissionCoordinatorRef.current;
    const intent = admissionOwnerByCorrelation.current.get(task.correlationId);
    if (intent?.owner && session?.snapshot().user?.id !== intent.owner) {
      coordinator?.finish(task, status);
      return false;
    }
    if (intent?.key) {
      try {
        if (status === "accepted" || status === "uncertain") sessionStorage.setItem(intent.key, JSON.stringify({ owner: intent.owner, contentHash: intent.contentHash, correlationId: task.correlationId, batchId: intent.batchId, state: status }));
        else sessionStorage.removeItem(intent.key);
      } catch { /* repository-level marker remains fail-closed */ }
      if (status !== "uncertain") setPendingCorrelationId(null);
    }
    if (!coordinator?.finish(task, status)) return false;
    setAdmissionStatus(coordinator.status);
    setSubmissionError(error);
    return true;
  }, [session]);

  const confirmRecoveredBatch = useCallback((batchId: string) => {
    const intent = selectedIntent.current;
    if (!intent || intent.batchId !== batchId || session?.snapshot().user?.id !== intent.owner) return false;
    try { sessionStorage.setItem(intent.key, JSON.stringify({ owner: intent.owner, contentHash: intent.contentHash, correlationId: admissionCoordinatorRef.current?.correlationId, batchId: intent.batchId, state: "accepted" })); } catch { /* confirmed GET remains available in the current route */ }
    setAdmissionStatus("accepted");
    setSubmissionError(null);
    return true;
  }, [session]);
  const recoveryOwnerIsCurrent = useCallback(() => selectedIntent.current?.owner === session?.snapshot().user?.id, [session]);
  const recoveryOwnerId = useCallback(() => selectedIntent.current?.owner ?? null, []);

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
        expectedBatchId,
        confirmRecoveredBatch,
        recoveryOwnerIsCurrent,
        recoveryOwnerId,
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
