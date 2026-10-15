/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LocalFileCheckResult } from "../types/bulk";
import type { BulkFailureCategory } from "../services/bulkService";
import { checkLocalFile } from "../utils/localFileCheck";

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
  submitting: boolean;
  setSubmitting: (submitting: boolean) => void;
  submissionError: BulkSubmissionError | null;
  setSubmissionError: (error: BulkSubmissionError | null) => void;
}

const BulkUploadContext = createContext<BulkUploadContextValue | null>(null);

export function BulkUploadProvider({ children }: { children: ReactNode }) {
  const [selectedFile, setFileState] = useState<File | null>(null);
  const [fileCheck, setFileCheck] = useState<LocalFileCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] =
    useState<BulkSubmissionError | null>(null);

  // Counter to guarantee that only the latest file check result is applied
  const validationVersionRef = useRef(0);
  const validationControllerRef = useRef<AbortController | null>(null);

  const setSelectedFile = useCallback(async (file: File | null) => {
    validationControllerRef.current?.abort();
    const currentVersion = ++validationVersionRef.current;
    setSubmissionError(null);

    if (!file) {
      setFileState(null);
      setFileCheck(null);
      setChecking(false);
      return;
    }

    setFileState(file);
    setFileCheck(null); // Invalidate previous result immediately
    setChecking(true);
    const controller = new AbortController();
    validationControllerRef.current = controller;

    try {
      const result = await checkLocalFile(file, controller.signal);
      // Only commit result if this is still the active validation
      if (validationVersionRef.current === currentVersion) {
        setFileCheck(result);
      }
    } finally {
      if (validationVersionRef.current === currentVersion) {
        setChecking(false);
      }
    }
  }, []);

  const clearSelection = useCallback(() => {
    validationControllerRef.current?.abort();
    validationControllerRef.current = null;
    validationVersionRef.current++;
    setFileState(null);
    setFileCheck(null);
    setChecking(false);
    setSubmissionError(null);
    setSubmitting(false);
  }, []);

  return (
    <BulkUploadContext.Provider
      value={{
        selectedFile,
        fileCheck,
        checking,
        setSelectedFile,
        clearSelection,
        submitting,
        setSubmitting,
        submissionError,
        setSubmissionError,
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
