import { MockCombosRepository } from "../adapters/mockCombosRepository";
export function createMockCombosRuntime() {
  const repository = new MockCombosRepository();
  return { combos: repository, catalog: repository, pricing: repository };
}
