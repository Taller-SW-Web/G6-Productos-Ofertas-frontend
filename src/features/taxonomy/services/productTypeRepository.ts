import type {
  DesasociacionSeguimiento,
  ProductTypeAssociarInput,
  ProductTypeCreateInput,
  ProductTypeCreateResult,
  ProductTypeDesasociarResult,
  ProductTypeDesactivarResult,
  ProductTypeDetail,
  ProductTypeListItem,
  ProductTypeAssociationCharacteristic,
} from "../types";

export const PRODUCT_TYPE_ATTRIBUTE_LIMIT = 20;

export interface ProductTypeListResult {
  items: ProductTypeListItem[];
  limite: number;
}

// Contract shaped like a real HTTP API: no simulation parameters. The mock adapter
// decides locally which deterministic state to reproduce for local review.
export interface ProductTypeRepository {
  list(signal?: AbortSignal): Promise<ProductTypeListResult>;
  crear(
    input: ProductTypeCreateInput,
    signal?: AbortSignal,
  ): Promise<ProductTypeCreateResult>;
  obtener(id: string, signal?: AbortSignal): Promise<ProductTypeDetail | null>;
  listarCaracteristicasDisponibles(
    id: string,
    signal?: AbortSignal,
  ): Promise<ProductTypeAssociationCharacteristic[]>;
  asociarCaracteristica(
    input: ProductTypeAssociarInput,
    signal?: AbortSignal,
  ): Promise<ProductTypeDetail | null>;
  desasociarCaracteristica(
    id: string,
    caracteristicaId: string,
    signal?: AbortSignal,
  ): Promise<ProductTypeDesasociarResult>;
  desactivar(
    id: string,
    signal?: AbortSignal,
  ): Promise<ProductTypeDesactivarResult>;
  // BLOCKED_CONTRACT: sondeo del resultado de la desasociación asíncrona (202).
  // No hay endpoint OpenAPI confirmado; la simulación vive en el adapter mock.
  consultarEstadoOperacion(
    operacionId: string,
    signal?: AbortSignal,
  ): Promise<DesasociacionSeguimiento>;
}