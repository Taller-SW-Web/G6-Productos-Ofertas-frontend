import { mockBulkRepository } from "../adapters/mockBulkRepository";
import type { BulkRepository } from "./bulkRepository";

// Single adapter selection point for Bulk operations.
// HTTP integration will replace this mock adapter without modifying UI components.
export const bulkService: BulkRepository = mockBulkRepository;

// Expose on window for test observation in development / test environments only.
// In production builds, import.meta.env.DEV is replaced with false and eliminated.
if (typeof window !== "undefined" && import.meta.env.DEV) {
  (window as unknown as { __bulkService?: BulkRepository }).__bulkService = bulkService;
}

