import { getCatalogServices } from "../../catalog/services/catalogServices";
import { CatalogCombosAdapter } from "../adapters/catalogCombosAdapter";
import { MockCombosRepository } from "../adapters/mockCombosRepository";
import type { CombosRuntime } from "../services/combosService";
import { stockFixtures } from "./comboFixtures";
import { MockCombosAvailabilityAdapter } from "./mockCombosAvailabilityAdapter";
import { MockCombosPricingAdapter } from "./mockCombosPricingAdapter";

// Composes the mock Combos runtime against the SAME shared Catalog used by
// MK-003/MK-004. There is no parallel combos catalog: SKUs, activity and
// pagination come from getCatalogServices("mock").catalog.
export function createMockCombosRuntime(): CombosRuntime {
  const catalog = new CatalogCombosAdapter({ catalog: getCatalogServices("mock").catalog });
  const pricing = new MockCombosPricingAdapter();
  const availability = new MockCombosAvailabilityAdapter({ snapshot: stockFixtures });
  const combos = new MockCombosRepository({ catalog, pricing, availability });
  return { combos, catalog, pricing, availability };
}
