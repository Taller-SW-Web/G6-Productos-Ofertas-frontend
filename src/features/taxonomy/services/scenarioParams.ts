import {
  scenariosBaja,
  scenariosCatalogo,
  scenariosReactivacion,
  type CategoryBajaScenario,
  type CategoryCatalogScenario,
  type CategoryReactivacionScenario,
} from "./categoryRepository";

export function parseCatalogScenario(
  raw: string | null,
): CategoryCatalogScenario {
  return scenariosCatalogo.some((item) => item.value === raw)
    ? (raw as CategoryCatalogScenario)
    : "default";
}

export function parseBajaScenario(raw: string | null): CategoryBajaScenario {
  return scenariosBaja.some((item) => item.value === raw)
    ? (raw as CategoryBajaScenario)
    : "default";
}

export function parseReactivacionScenario(
  raw: string | null,
): CategoryReactivacionScenario {
  return scenariosReactivacion.some((item) => item.value === raw)
    ? (raw as CategoryReactivacionScenario)
    : "default";
}