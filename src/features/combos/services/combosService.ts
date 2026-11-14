import type { DataMode } from "../../../app/config/dataMode";
import type { PricingRuntime } from "../../pricing/services/pricingRuntime";
import type { AuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
import type { CatalogRepository } from "../../catalog/services/catalogRepository";
import type {
  CombosAvailabilityPort,
  CombosCatalogPort,
  CombosPricingPort,
  CombosRepository,
} from "../types/combos";
import { createUnavailableCombosAdapters } from "../adapters/unavailableCombosAdapters";
import { createHttpCombosRepository } from "../adapters/httpCombosRepository";
import { CatalogCombosAdapter } from "../adapters/catalogCombosAdapter";
import { PricingCombosAdapter } from "../adapters/pricingCombosAdapter";

export interface CombosRuntime {
  combos: CombosRepository;
  catalog: CombosCatalogPort;
  pricing: CombosPricingPort;
  availability: CombosAvailabilityPort;
  // Shared demo time. In mock mode it mirrors PricingRuntime.clock so the editor,
  // the Pricing references and the final save validation agree on "now".
  now: () => number;
}

export async function createCombosRuntime(
  mode: DataMode,
  pricing: PricingRuntime,
  dependencies: { gateway?: AuthenticatedGatewayClient; catalog?: CatalogRepository; scopeId?: () => string | null } = {},
): Promise<CombosRuntime> {
  if (mode === "api") {
    if (!dependencies.gateway || !dependencies.catalog) return createUnavailableCombosAdapters();
    const catalog = new CatalogCombosAdapter({ catalog: dependencies.catalog });
    const comboRepository = createHttpCombosRepository(dependencies.gateway, catalog, dependencies.scopeId ?? (() => null));
    const availability: CombosAvailabilityPort = {
      async readStocks(skus, signal) {
        signal?.throwIfAborted();
        return skus.map((sku) => ({ sku, stock: null, stale: true, locationsCompatible: false }));
      },
    };
    return {
      combos: comboRepository,
      catalog,
      pricing: new PricingCombosAdapter({ pricing: pricing.service, gateway: dependencies.gateway }),
      availability,
      now: () => Date.now(),
    };
  }
  const { createMockCombosRuntime } = await import("../mocks/createMockCombosRuntime");
  return createMockCombosRuntime(pricing);
}
