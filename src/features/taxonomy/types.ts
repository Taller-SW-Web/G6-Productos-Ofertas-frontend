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

// S04/S04-B/S05-R (Baja y reactivación) — presentation models. Simulated dependencies,
// not an agency over product or inventory state.
export interface BloqueoDependencia {
  tipo: "subcategorias" | "productos" | "padre";
  cantidad: number;
  detalle: string;
}

export interface BajaSolicitudResult {
  resultado: "verificando" | "rechazada";
  categoria: CategoryDetail;
  bloqueos: BloqueoDependencia[];
  mensaje: string;
}

export interface ReactivacionResult {
  resultado: "reactivada" | "bloqueada";
  categoria: CategoryDetail;
  bloqueos: BloqueoDependencia[];
  mensaje: string;
}

// MK-009 (Características y sus valores) — presentation models. Not provider DTOs
// or a new HTTP contract. SPEC/HU/FLOW/WF-009.
export type CharacteristicType = "TEXTO" | "NUMERO" | "LISTA";

export type EntityStatus = "Activo" | "Inactivo";
export type CharacteristicStatus = EntityStatus;
export type CharacteristicValueStatus = EntityStatus;

export interface CharacteristicValue {
  valorId: string;
  nombre: string;
  estado: CharacteristicValueStatus;
  version: number;
}

export interface CharacteristicValueInput {
  nombre: string;
}

export interface CharacteristicListItem {
  id: string;
  nombre: string;
  tipo: CharacteristicType;
  estado: CharacteristicStatus;
  unidad?: string;
  valoresActivos: number;
}

export interface CharacteristicCatalogConfig {
  maxTexto: number;
  maxValoresLista: number;
}

// S02 (Crear característica) — presentation models. The type is chosen at creation
// and cannot change afterwards; NUMERO requires a unit.
export interface CharacteristicCreateInput {
  nombre: string;
  tipo: CharacteristicType;
  estado: CharacteristicStatus;
  unidad?: string;
}

export interface CharacteristicCreateResult {
  id: string;
  nombre: string;
  tipo: CharacteristicType;
  estado: CharacteristicStatus;
  unidad?: string;
}

// S03/S06 (Editar y Detalle) — single characteristic. SPEC-009 defines the type as
// immutable, so the update input intentionally excludes it and the state.
export interface CharacteristicDetail {
  id: string;
  nombre: string;
  tipo: CharacteristicType;
  estado: CharacteristicStatus;
  unidad?: string;
  valoresActivos: number;
  valores?: CharacteristicValue[];
}

export interface CharacteristicUpdateInput {
  id: string;
  nombre: string;
  unidad?: string;
}

// MK-010 (Tipos de producto y esquemas de características) — presentation models.
export type ProductTypeStatus = EntityStatus;

export interface ProductTypeListItem {
  tipoProductoId: string;
  nombre: string;
  estado: ProductTypeStatus;
  schemaVersion: number;
  caracteristicasAsignadas: number;
  limiteCaracteristicas: number;
}

export interface ProductTypeCreateInput {
  nombre: string;
}

export interface ProductTypeCreateResult {
  tipoProductoId: string;
  nombre: string;
  estado: ProductTypeStatus;
  schemaVersion: number;
}

export interface ProductTypeAssociationCharacteristic {
  id: string;
  nombre: string;
  tipo: CharacteristicType;
  estado: CharacteristicStatus;
  unidad?: string;
  valoresActivos: number;
}

export interface ProductTypeAssociation {
  caracteristicaId: string;
  obligatoria: boolean;
  estado: CharacteristicStatus;
  schemaVersion: number;
  caracteristica: ProductTypeAssociationCharacteristic;
}

export interface ProductTypeDetail {
  tipoProductoId: string;
  nombre: string;
  estado: ProductTypeStatus;
  schemaVersion: number;
  limiteCaracteristicas: number;
  caracteristicasAsignadas: number;
  asociadas: ProductTypeAssociation[];
}
