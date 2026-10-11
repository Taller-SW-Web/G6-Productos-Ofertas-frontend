import type {
  CategoryCreateInput,
  CategoryCreateResult,
  CategoryDetail,
  CategoryNode,
  CategoryUpdateInput,
  SlugCheckResult,
} from "../types";

// Typed UI models for Taxonomy. These are not provider DTOs or a new HTTP contract.
export interface CategoryListResult {
  nodos: CategoryNode[];
  colapsadosPorId?: string[];
}

// Deterministic scenarios for local review of the create/edit form and slug confirmation.
export type CategoryFormScenario =
  | "default"
  | "slug-sin-colision"
  | "slug-con-colision"
  | "slug-carrera-409";

// Deterministic scenarios for local review of a single-category read.
export type CategoryCatalogScenario = "default" | "error" | "no-encontrado";

export const scenariosCatalogo: {
  value: CategoryCatalogScenario;
  label: string;
}[] = [
  { value: "default", label: "Por defecto" },
  { value: "error", label: "Error de carga" },
  { value: "no-encontrado", label: "Categoría no encontrada" },
];

export interface CategoryRepository {
  list(signal: AbortSignal): Promise<CategoryListResult>;
  obtener(
    id: string,
    scenario: CategoryCatalogScenario,
    signal: AbortSignal,
  ): Promise<CategoryDetail | null>;
  comprobarSlug(
    slug: string,
    scenario: CategoryFormScenario,
    signal: AbortSignal,
  ): Promise<SlugCheckResult>;
  crear(
    input: CategoryCreateInput,
    scenario: CategoryFormScenario,
    signal: AbortSignal,
  ): Promise<CategoryCreateResult>;
  actualizar(
    input: CategoryUpdateInput,
    scenario: CategoryFormScenario,
    signal: AbortSignal,
  ): Promise<CategoryDetail>;
}
