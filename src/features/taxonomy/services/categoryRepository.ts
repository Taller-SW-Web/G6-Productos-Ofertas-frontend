import type {
  BajaCategoriaSeguimiento,
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

/** Local presentation error for a slug proposal occupied between review and save. */
export class CategorySlugConflictError extends Error {
  constructor() {
    super("El slug propuesto dejó de estar disponible.");
    this.name = "CategorySlugConflictError";
  }
}

// Contract shaped like a real HTTP API: no simulation parameters. The mock adapter
// decides locally which deterministic state to reproduce for local review.
export interface CategoryRepository {
  list(signal?: AbortSignal): Promise<CategoryListResult>;
  obtener(id: string, signal?: AbortSignal): Promise<CategoryDetail | null>;
  proponerSlug(nombre: string, signal?: AbortSignal): Promise<SlugCheckResult>;
  crear(
    input: CategoryCreateInput,
    signal?: AbortSignal,
  ): Promise<CategoryCreateResult>;
  actualizar(
    input: CategoryUpdateInput,
    signal?: AbortSignal,
  ): Promise<CategoryDetail>;
  solicitarBaja(
    id: string,
    signal?: AbortSignal,
  ): Promise<BajaSolicitudResult>;
  reactivar(id: string, signal?: AbortSignal): Promise<ReactivacionResult>;
  // BLOCKED_CONTRACT: sondeo del resultado de la operación asíncrona de baja (202).
  // No hay endpoint OpenAPI confirmado; la simulación vive en el adapter mock.
  consultarEstadoOperacion(
    operacionId: string,
    signal?: AbortSignal,
  ): Promise<BajaCategoriaSeguimiento>;
}
