import { mockCatalogRepository } from "../adapters/mockCatalogRepository";
import type { CatalogRepository } from "./catalogRepository";

// Single injection point for the catalog repository.
// To switch to HTTP in the future:
// export const catalogService: CatalogRepository = new HttpCatalogRepository();
export const catalogService: CatalogRepository = mockCatalogRepository;
