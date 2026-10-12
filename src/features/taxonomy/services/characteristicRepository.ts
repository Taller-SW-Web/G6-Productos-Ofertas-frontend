import type {
  CharacteristicCatalogConfig,
  CharacteristicCreateInput,
  CharacteristicCreateResult,
  CharacteristicDetail,
  CharacteristicListItem,
  CharacteristicUpdateInput,
} from "../types";

// SPEC-009 documented defaults for the configurable limits. The provider owns the
// authoritative values; these are only used by the local mock and rule helpers.
export const characteristicConfigDefaults: CharacteristicCatalogConfig = {
  maxTexto: 100,
  maxValoresLista: 50,
};

// Deterministic scenarios for local review of the MK-009 list (S-01).
// These simulate local states; they do not assert a real backend response.
export type CharacteristicListScenario = "default" | "empty" | "error";

export const scenariosCaracteristicas: {
  value: CharacteristicListScenario;
  label: string;
}[] = [
  { value: "default", label: "Con características" },
  { value: "empty", label: "Sin características" },
  { value: "error", label: "Error de carga" },
];

// Deterministic scenarios for local review of the create/edit form (S-02/S-03).
export type CharacteristicFormScenario = "default" | "error";

export const scenariosFormularioCaracteristica: {
  value: CharacteristicFormScenario;
  label: string;
}[] = [
  { value: "default", label: "Por defecto" },
  { value: "error", label: "Error al guardar" },
];

// Deterministic scenarios for local review of a single-characteristic read (S-03/S-06).
export type CharacteristicCatalogScenario = "default" | "error" | "no-encontrado";

export const scenariosCatalogoCaracteristica: {
  value: CharacteristicCatalogScenario;
  label: string;
}[] = [
  { value: "default", label: "Por defecto" },
  { value: "error", label: "Error de carga" },
  { value: "no-encontrado", label: "Característica no encontrada" },
];

export interface CharacteristicListResult {
  caracteristicas: CharacteristicListItem[];
  config: CharacteristicCatalogConfig;
}

import type { CharacteristicValue } from "../types";

export interface CharacteristicRepository {
  list(
    scenario: CharacteristicListScenario,
    signal: AbortSignal,
  ): Promise<CharacteristicListResult>;
  obtener(
    id: string,
    scenario: CharacteristicCatalogScenario,
    signal: AbortSignal,
  ): Promise<CharacteristicDetail | null>;
  crear(
    input: CharacteristicCreateInput,
    scenario: CharacteristicFormScenario,
    signal: AbortSignal,
  ): Promise<CharacteristicCreateResult>;
  actualizar(
    input: CharacteristicUpdateInput,
    scenario: CharacteristicFormScenario,
    signal: AbortSignal,
  ): Promise<CharacteristicDetail | null>;
  listarValores(
    id: string,
    scenario: CharacteristicCatalogScenario,
    signal: AbortSignal,
  ): Promise<CharacteristicValue[] | null>;
  agregarValor(
    id: string,
    nombre: string,
    signal: AbortSignal,
  ): Promise<CharacteristicValue>;
  solicitarBajaValor(
    id: string,
    valorId: string,
    signal: AbortSignal,
  ): Promise<CharacteristicValue | "REJECTED" | null>;
  cambiarEstado(
    id: string,
    estado: "Activo" | "Inactivo",
    signal: AbortSignal,
  ): Promise<CharacteristicDetail | null>;
}
