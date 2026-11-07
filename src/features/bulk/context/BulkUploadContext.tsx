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

interface BulkUploadContextValue {
  selectedFile: File | null;
  fileCheck: LocalFileCheckResult | null;
  checking: boolean;
  setSelectedFile: (file: File | null) => Promise<void>;
  clearSelection: () => void;
  admissionStatus: AdmissionStatus;
  beginAdmission: (file: File, retryUncertain?: boolean) => AdmissionTask<File> | null;
  finishAdmission: (
    task: AdmissionTask<File>,
    status: "ready" | "accepted" | "uncertain",
    error?: BulkSubmissionError | null,
  ) => boolean;
  submissionError: BulkSubmissionError | null;
  pendingCorrelationId: string | null;
}

const BulkUploadContext = createContext<BulkUploadContextValue | null>(null);

export function BulkUploadProvider({ children }: { children: ReactNode }) {
  const session = useReactContext(PromotionSessionContext);
  const [selectedFile, setFileState] = useState<File | null>(null);
  const [fileCheck, setFileCheck] = useState<LocalFileCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [admissionStatus, setAdmissionStatus] = useState<AdmissionStatus>("idle");
  const [submissionError, setSubmissionError] =
    useState<BulkSubmissionError | null>(null);
  const [pendingCorrelationId, setPendingCorrelationId] = useState<string | null>(null);
  const admissionOwnerByCorrelation = useRef(new Map<string, { owner: string; key: string }>());
  const selectedIntent = useRef<{ owner: string; key: string } | null>(null);

  const admissionCoordinatorRef = useRef<AdmissionCoordinator<File> | null>(null);
  if (admissionCoordinatorRef.current == null) {
    admissionCoordinatorRef.current = new AdmissionCoordinator<File>();
  }
  const validationCoordinatorRef = useRef<LatestTaskCoordinator | null>(null);
  if (validationCoordinatorRef.current == null) {
    validationCoordinatorRef.current = new LatestTaskCoordinator();
  }

  const setSelectedFile = useCallback(async (file: File | null) => {
    selectedIntent.current = null;
    setPendingCorrelationId(null);
    const coordinator = validationCoordinatorRef.current;
    if (!coordinator) return;
    const admissionCoordinator = admissionCoordinatorRef.current;
    let restored: { correlationId: string; status: AdmissionStatus } | undefined;
    const owner = session?.snapshot().user?.id ?? null;
    let intentKey: string | undefined;
    if (file && owner) {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      const fingerprint = [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
      intentKey = `g6:bulk:admission:v1:${encodeURIComponent(owner)}:${fingerprint}`;
      selectedIntent.current = { owner, key: intentKey };
      try {
        const raw = sessionStorage.getItem(intentKey);
        if (raw) {
          const saved = JSON.parse(raw) as { owner?: string; correlationId?: string };
          if (saved.owner !== owner || !saved.correlationId) throw new Error("Marcador de admisión incompatible.");
          restored = { correlationId: saved.correlationId, status: "uncertain" };
          setPendingCorrelationId(saved.correlationId);
          setSubmissionError({ category: "unknown", message: "Existe una admisión incierta para este archivo y usuario. El contrato no permite recuperar el lote mediante correlación; no se enviará otro POST." });
        } else setPendingCorrelationId(null);
      } catch {
        restored = { correlationId: "", status: "uncertain" };
        setPendingCorrelationId(null);
        setSubmissionError({ category: "unknown", message: "El marcador de admisión está ilegible o inaccesible; se bloquea el reenvío." });
      }
    }
    admissionCoordinator?.select(file, restored);
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

  const beginAdmission = useCallback((file: File, retryUncertain = false) => {
    const task = admissionCoordinatorRef.current?.begin(file, retryUncertain) ?? null;
    if (task) {
      const intent = selectedIntent.current;
      admissionOwnerByCorrelation.current.set(task.correlationId, intent ?? { owner: session?.snapshot().user?.id ?? "session-unavailable", key: "" });
    }
    if (task) setAdmissionStatus(admissionCoordinatorRef.current?.status ?? "idle");
    return task;
  }, [session]);

  const finishAdmission = useCallback((
    task: AdmissionTask<File>,
    status: "ready" | "accepted" | "uncertain",
    error: BulkSubmissionError | null = null,
  ) => {
    const coordinator = admissionCoordinatorRef.current;
    const intent = admissionOwnerByCorrelation.current.get(task.correlationId);
    if (intent?.key) {
      try {
        if (status === "uncertain") sessionStorage.setItem(intent.key, JSON.stringify({ owner: intent.owner, correlationId: task.correlationId }));
        else sessionStorage.removeItem(intent.key);
      } catch { /* repository-level marker remains fail-closed */ }
      if (status !== "uncertain") setPendingCorrelationId(null);
    }
    if (!coordinator?.finish(task, status)) return false;
    setAdmissionStatus(coordinator.status);
    setSubmissionError(error);
    return true;
  }, []);

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
