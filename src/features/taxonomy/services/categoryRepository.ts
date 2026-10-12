import type {
  BajaSolicitudResult,
  CategoryCreateInput,
  CategoryCreateResult,
  CategoryDetail,
  CategoryNode,
  CategoryUpdateInput,
  ReactivacionResult,
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

// Deterministic scenarios for local review of the deactivation request (S04/S04-P/S04-B).
export type CategoryBajaScenario =
  | "default"
  | "verificando"
  | "rechazada-subcategorias"
  | "rechazada-productos"
  | "error";

export const scenariosBaja: {
  value: CategoryBajaScenario;
  label: string;
}[] = [
  { value: "default", label: "Por defecto (según dependencias)" },
  { value: "verificando", label: "Baja en verificación (S04-P)" },
  { value: "rechazada-subcategorias", label: "Baja rechazada por subcategorías" },
  { value: "rechazada-productos", label: "Baja rechazada por productos" },
  { value: "error", label: "Error al verificar" },
];

// Deterministic scenarios for local review of reactivation (S05-R).
export type CategoryReactivacionScenario = "default" | "bloqueada" | "error";

export const scenariosReactivacion: {
  value: CategoryReactivacionScenario;
  label: string;
}[] = [
  { value: "default", label: "Por defecto (según dependencias)" },
  { value: "bloqueada", label: "Reactivación bloqueada (S05-R)" },
  { value: "error", label: "Error al reactivar" },
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
  solicitarBaja(
    id: string,
    scenario: CategoryBajaScenario,
    signal: AbortSignal,
  ): Promise<BajaSolicitudResult>;
  reactivar(
    id: string,
    scenario: CategoryReactivacionScenario,
    signal: AbortSignal,
  ): Promise<ReactivacionResult>;
}