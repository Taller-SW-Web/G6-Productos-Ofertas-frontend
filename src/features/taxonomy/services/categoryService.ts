import { mockCategoryAdapter } from "../adapters/mockCategoryAdapter";
import type { CategoryRepository } from "./categoryRepository";

// Single adapter selection point for Taxonomy. HTTP integration requires a separate verified contract task.
export const categoryService: CategoryRepository = mockCategoryAdapter;
