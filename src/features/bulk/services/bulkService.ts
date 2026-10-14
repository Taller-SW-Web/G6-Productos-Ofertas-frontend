import { mockBulkRepository } from "../adapters/mockBulkRepository";
import type { BulkRepository } from "./bulkRepository";

// Single adapter selection point for Bulk operations.
// HTTP integration will replace this mock adapter without modifying UI components.
export const bulkService: BulkRepository = mockBulkRepository;

// Expose on window for test observation in Playwright/E2E if running in browser
if (typeof window !== "undefined") {
  (window as unknown as { __bulkService?: BulkRepository }).__bulkService = bulkService;
}
