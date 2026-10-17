import type { BulkImportBatch } from "../types/bulk";

export type BatchQueryState =
  | { status: "loading" }
  | { status: "success"; batch: BulkImportBatch }
  | { status: "not_found" }
  | { status: "error"; message: string };

export interface BatchQueryResponse {
  key: string;
  state: BatchQueryState;
}

export interface LastSuccessfulBatch {
  batchId: string;
  batch: BulkImportBatch;
}

export function selectBatchQueryView(input: {
  batchId: string | undefined;
  requestKey: string;
  response?: BatchQueryResponse;
  lastSuccess?: LastSuccessfulBatch;
}) {
  const responseIsCurrent = input.response?.key === input.requestKey;
  const state = responseIsCurrent ? input.response?.state : undefined;
  const isNotFound = state?.status === "not_found";
  const lastSuccess = input.lastSuccess;
  const batch = isNotFound
    ? null
    : state?.status === "success"
      ? state.batch
      : lastSuccess && lastSuccess.batchId === input.batchId
        ? lastSuccess.batch
        : null;
  const error = state?.status === "error" ? state.message : null;

  return {
    batch,
    loading: !responseIsCurrent || state?.status === "loading",
    error,
    isNotFound,
    isStale: Boolean(batch && (error || !responseIsCurrent)),
  };
}

export function isExportSnapshotStale(input: {
  visibleExportId?: string;
  initialExportId?: string;
  routeExportId?: string;
  createdJobMatches: boolean;
  currentQueryStatus?: "success" | "not_found" | "error";
  refreshErrorExportId?: string;
}): boolean {
  if (!input.visibleExportId) return false;
  const initialQueryIsStale = Boolean(
    input.initialExportId &&
      input.routeExportId === input.initialExportId &&
      !input.createdJobMatches &&
      input.currentQueryStatus !== "success",
  );
  return (
    initialQueryIsStale ||
    input.refreshErrorExportId === input.visibleExportId
  );
}
