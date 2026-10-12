import type { SeoCategory, SlugPropuesta, HistorialSlugItem } from "../types";

export type SeoListScenario = "default" | "empty" | "error";

export const scenariosSeo: {
  value: SeoListScenario;
  label: string;
}[] = [
  { value: "default", label: "Con SEO" },
  { value: "empty", label: "Sin SEO" },
  { value: "error", label: "Error de carga" },
];

export interface SeoListResult {
  items: SeoCategory[];
}

export interface SeoRepository {
  list(scenario: SeoListScenario, signal: AbortSignal): Promise<SeoListResult>;
  obtener(id: string, signal: AbortSignal): Promise<SeoCategory | null>;
  proponerSlug(nombre: string, signal: AbortSignal): Promise<SlugPropuesta>;
  guardarMetadatos(id: string, metaTitulo: string, metaDescripcion: string, signal: AbortSignal): Promise<SeoCategory | null>;
  historial(id: string, signal: AbortSignal): Promise<HistorialSlugItem[]>;
}
