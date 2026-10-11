export interface CategoryNode {
  id: string;
  nombre: string;
  nivel: number;
  estado: "Activo" | "Inactivo" | "Verificando baja";
  slug?: string;
  orden?: number;
  descripcion?: string;
  hijas?: CategoryNode[];
}

export interface CategoryTreeProps {
  nodos: CategoryNode[];
  nodoSeleccionadoId?: string;
  colapsadosPorId?: string[];
  estadoPorNodo?: Map<string, "Activo" | "Inactivo" | "Verificando baja">;
  onSeleccionar?: (id: string) => void;
  onExpandir?: (id: string) => void;
  onClicar?: (id: string) => void;
}

export type CategoryTreeStates =
  | "default"
  | "loading"
  | "empty"
  | "sin-resultados"
  | "error";

export interface CategoryTreeFixture {
  default: CategoryNode[];
  loading: CategoryNode[];
  empty: CategoryNode[];
  sinResultados: CategoryNode[];
  error: {
    problem: string;
    codigo: "VALIDACION" | "ERROR_INTERNO";
  };
  sesion: {
    codigo: "TOKEN_INVALIDO" | "SCOPE_INSUFICIENTE";
    mensaje: string;
  };
}

// S02 (Crear categoría) — presentation models. Not provider DTOs or a new HTTP contract.
export interface CategoryCreateInput {
  nombre: string;
  slug: string;
  padreId?: string;
  descripcion?: string;
}

export interface SlugCheckResult {
  slug: string;
  disponible: boolean;
  alternativo?: string;
}

export interface CategoryCreateResult {
  id: string;
  nombre: string;
  slug: string;
}

// S03/S05 (Editar y Detalle) — presentation models for a single category.
export interface CategoryDetail {
  id: string;
  nombre: string;
  slug: string;
  nivel: number;
  orden: number;
  estado: CategoryNode["estado"];
  descripcion?: string;
  padreId?: string;
  padreNombre?: string;
  hijas: CategoryNode[];
}

export interface CategoryUpdateInput {
  id: string;
  nombre: string;
  slug: string;
  padreId?: string;
  descripcion?: string;
  orden: number;
}