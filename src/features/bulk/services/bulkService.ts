import { mockBulkRepository } from "../adapters/mockBulkRepository";
import type { BulkRepository } from "./bulkRepository";

// Single adapter selection point for Bulk operations.
// HTTP integration will replace this mock adapter without modifying UI components.
export const bulkService: BulkRepository = mockBulkRepository;
