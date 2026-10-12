import type { ProductStatus, PreparationStatus } from "./catalogRepository";

export function readCatalogScenario(params: URLSearchParams): string | undefined {
  const mode = params.get("modoRevision");
  if (mode !== "1") return undefined;
  return params.get("escenario") || undefined;
}

export function readPositiveInteger(
  value: string | null,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function productStatusLabel(status: ProductStatus): string {
  switch (status) {
    case "ACTIVO":
      return "Activo";
    case "BORRADOR":
      return "Borrador";
    case "INACTIVO":
      return "Inactivo";
  }
}

export function preparationStatusLabel(status: PreparationStatus): string {
  switch (status) {
    case "COMPLETED":
      return "Completado";
    case "PENDING":
      return "En preparación";
    case "REJECTED":
      return "Rechazado";
  }
}

export function calculateVolumeCm3(
  largo?: number,
  ancho?: number,
  alto?: number,
): number | null {
  if (!largo || !ancho || !alto || largo <= 0 || ancho <= 0 || alto <= 0) {
    return null;
  }
  return largo * ancho * alto;
}
