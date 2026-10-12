import { mockCharacteristicAdapter } from "../adapters/mockCharacteristicAdapter";
import type { CharacteristicRepository } from "./characteristicRepository";

// Single adapter selection point for MK-009 characteristics.
// HTTP integration requires a separate verified contract task.
export const characteristicService: CharacteristicRepository =
  mockCharacteristicAdapter;
