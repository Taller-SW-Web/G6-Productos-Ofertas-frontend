import { mockCombosRepository } from "../adapters/mockCombosRepository";
import { unavailableApiCombosRepository } from "../adapters/unavailableApiCombosRepository";
import type { CombosRepository } from "./combosRepository";
import type { DataMode } from "../../../app/config/dataMode";

export function getCombosService(mode: DataMode): CombosRepository {
  if (mode === "api") {
    return unavailableApiCombosRepository;
  }
  return mockCombosRepository;
}
