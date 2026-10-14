import { unavailableApiCombosRepository } from "../adapters/unavailableApiCombosRepository";
import type { CombosRepository } from "./combosRepository";
import type { DataMode } from "../../../app/config/dataMode";

let sharedMockProxy: CombosRepository | null = null;

function createLazyMockCombosProxy(): CombosRepository {
  let instance: CombosRepository | null = null;
  const getInstance = async () => {
    if (!instance) {
      const { mockCombosRepository } = await import(
        "../adapters/mockCombosRepository"
      );
      instance = mockCombosRepository;
    }
    return instance;
  };

  return {
    listCombos: async (q, sc, sig) => (await getInstance()).listCombos(q, sc, sig),
    getCombo: async (id, sc, sig) => (await getInstance()).getCombo(id, sc, sig),
    createCombo: async (p, sc, sig) => (await getInstance()).createCombo(p, sc, sig),
    updateCombo: async (id, p, sc, sig) => (await getInstance()).updateCombo(id, p, sc, sig),
    deactivateCombo: async (id, sig) => (await getInstance()).deactivateCombo(id, sig),
    getComponentsPricing: async (skus, sc, sig) =>
      (await getInstance()).getComponentsPricing(skus, sc, sig),
  };
}

export function getCombosService(mode: DataMode): CombosRepository {
  if (mode === "api") {
    return unavailableApiCombosRepository;
  }
  if (!sharedMockProxy) {
    sharedMockProxy = createLazyMockCombosProxy();
  }
  return sharedMockProxy;
}
