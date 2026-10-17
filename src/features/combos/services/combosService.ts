import type { DataMode } from "../../../app/config/dataMode";
import type {
  CombosAvailabilityPort,
  CombosCatalogPort,
  CombosPricingPort,
  CombosRepository,
} from "../types/combos";
import { createUnavailableCombosAdapters } from "../adapters/unavailableCombosAdapters";

export interface CombosRuntime {
  combos: CombosRepository;
  catalog: CombosCatalogPort;
  pricing: CombosPricingPort;
  availability: CombosAvailabilityPort;
}

export async function createCombosRuntime(mode: DataMode): Promise<CombosRuntime> {
  if (mode === "api") return createUnavailableCombosAdapters();
  const { createMockCombosRuntime } = await import("../mocks/createMockCombosRuntime");
  return createMockCombosRuntime();
}
