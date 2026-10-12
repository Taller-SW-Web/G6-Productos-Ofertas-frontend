import type { BrandCreateInput, BrandDetail, BrandListItem, BrandUpdateInput } from "../types";

export type BrandListScenario = "default" | "empty" | "error";

export const scenariosBrands: {
  value: BrandListScenario;
  label: string;
}[] = [
  { value: "default", label: "Con marcas" },
  { value: "empty", label: "Sin marcas" },
  { value: "error", label: "Error de carga" },
];

export interface BrandListResult {
  items: BrandListItem[];
}

export interface BrandRepository {
  list(scenario: BrandListScenario, signal: AbortSignal): Promise<BrandListResult>;
  obtener(id: string, signal: AbortSignal): Promise<BrandDetail | null>;
  crear(input: BrandCreateInput, signal: AbortSignal): Promise<BrandDetail>;
  actualizar(input: BrandUpdateInput, signal: AbortSignal): Promise<BrandDetail | null>;
}
