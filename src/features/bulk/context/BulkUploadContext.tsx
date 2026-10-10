/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { LocalFileCheckResult } from "../types/bulk";
import { checkLocalFile } from "../utils/localFileCheck";

interface BulkUploadContextValue {
  selectedFile: File | null;
  fileCheck: LocalFileCheckResult | null;
  setSelectedFile: (file: File | null) => Promise<void>;
  clearSelection: () => void;
  submitting: boolean;
  setSubmitting: (submitting: boolean) => void;
  submissionError: string | null;
  setSubmissionError: (error: string | null) => void;
}

const BulkUploadContext = createContext<BulkUploadContextValue | null>(null);

export function BulkUploadProvider({ children }: { children: ReactNode }) {
  const [selectedFile, setFileState] = useState<File | null>(null);
  const [fileCheck, setFileCheck] = useState<LocalFileCheckResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const setSelectedFile = useCallback(async (file: File | null) => {
    setSubmissionError(null);
    if (!file) {
      setFileState(null);
      setFileCheck(null);
      return;
    }

    setFileState(file);
    const result = await checkLocalFile(file);
    setFileCheck(result);
  }, []);

  const clearSelection = useCallback(() => {
    setFileState(null);
    setFileCheck(null);
    setSubmissionError(null);
    setSubmitting(false);
  }, []);

  return (
    <BulkUploadContext.Provider
      value={{
        selectedFile,
        fileCheck,
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
