import type {
  ProductTypeCreateInput,
  ProductTypeCreateResult,
  ProductTypeListItem,
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
}
