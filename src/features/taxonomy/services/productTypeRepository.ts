import type {
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

export type ProductTypeListScenario = "default" | "empty" | "error";

export const scenariosProductTypes: {
  value: ProductTypeListScenario;
  label: string;
}[] = [
  { value: "default", label: "Con tipos de producto" },
  { value: "empty", label: "Sin tipos de producto" },
  { value: "error", label: "Error de carga" },
];

export interface ProductTypeListResult {
  items: ProductTypeListItem[];
  limite: number;
}

export interface ProductTypeRepository {
  list(
    scenario: ProductTypeListScenario,
    signal: AbortSignal,
  ): Promise<ProductTypeListResult>;
  crear(
    input: ProductTypeCreateInput,
    signal: AbortSignal,
  ): Promise<ProductTypeCreateResult>;
  obtener(id: string, signal: AbortSignal): Promise<ProductTypeDetail | null>;
  listarCaracteristicasDisponibles(
    id: string,
    signal: AbortSignal,
  ): Promise<ProductTypeAssociationCharacteristic[]>;
  asociarCaracteristica(
    input: ProductTypeAssociarInput,
    signal: AbortSignal,
  ): Promise<ProductTypeDetail | null>;
  desasociarCaracteristica(
    id: string,
    caracteristicaId: string,
    signal: AbortSignal,
  ): Promise<ProductTypeDesasociarResult>;
  desactivar(
    id: string,
    signal: AbortSignal,
  ): Promise<ProductTypeDesactivarResult>;
}