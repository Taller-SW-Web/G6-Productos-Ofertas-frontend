import type { ReviewScenario } from "./pricingModels";
export const readScenarios: { value: ReviewScenario; label: string }[] = [
  { value: "default", label: "Disponible" },
  { value: "loading", label: "Cargando" },
  { value: "empty", label: "Sin dato" },
  { value: "error", label: "Error de lectura" },
];
export const mutationScenarios: { value: ReviewScenario; label: string }[] = [
  { value: "default", label: "Confirmación local" },
  { value: "conflict", label: "Conflicto de versión" },
  { value: "overlap", label: "Vigencia superpuesta" },
  { value: "error", label: "Rechazo de servicio" },
  { value: "unauthorized", label: "Sesión no válida" },
  { value: "forbidden", label: "Sin autorización" },
  { value: "unknown", label: "Resultado desconocido" },
];
