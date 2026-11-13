import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { theme, cssVariablesResolver } from "./theme/theme";
import type { G7Session } from "./features/promotions/adapters/g7Session";
import { App } from "./app/App";
import {
  configureTaxonomyGateway,
  createAuthenticatedTaxonomyGateway,
} from "./features/taxonomy/services/taxonomyGatewayRuntime";
import { createPricingRuntime } from "./features/pricing/services/pricingService";
import { PricingProvider } from "./features/pricing/components/PricingProvider";
import { DataModeContext } from "./app/config/DataModeContext";
import { PromotionApiContext } from "./app/config/PromotionApiContext";
import { AuthSessionContext } from "./app/config/AuthSessionContext";
import { secureBase } from "./features/promotions/adapters/g7Session";
import { createAuthenticatedCatalogTransport } from "./features/catalog/adapters/authenticatedCatalogTransport";
import { CatalogServicesContext } from "./features/catalog/services/CatalogServicesContext";
import { getCatalogServices } from "./features/catalog/services/catalogServices";
import { createCatalogHttpServices, createOptionalCatalogHttpServices } from "./features/catalog/services/catalogHttpRuntime";
import { createCombosRuntime } from "./features/combos/services/combosService";
import { CombosProvider } from "./features/combos/components/CombosProvider";
import { BulkRepositoryContext } from "./features/bulk/services/BulkRepositoryContext";
import { createBulkFetchTransport, createHttpBulkRepository } from "./features/bulk/adapters/httpBulkRepository";
import { GatewayOriginContext } from "./app/config/GatewayOriginContext";
import { configureInventoryApi } from "./features/inventory/services/inventoryProvider";
import { createHttpInventoryRepository } from "./features/inventory/adapters/apiInventoryAdapter";
import { createAuthenticatedInventoryTransport } from "./features/inventory/adapters/authenticatedInventoryTransport";


export async function startApplication(root: Root, mode: "mock" | "api", session: G7Session | null, gatewayOrigin?: string, securityApiBase?: string) {
  let gateway: string | undefined;
  try {
    if (gatewayOrigin) gateway = secureBase(gatewayOrigin, true);
  } catch { /* Each unavailable provider keeps its explicit configuration error. */ }

  // Configurar Inventario ANTES de construir los runtimes consumidores (Combos, etc.)
  // para que en modo Mock compartan la misma instancia singleton sin reiniciarla.
  if (mode === "api" && gateway) {
    const inventoryTransport = createAuthenticatedInventoryTransport(gateway, session);
    configureInventoryApi(() =>
      createHttpInventoryRepository({ transport: inventoryTransport }),
    );
  } else {
    configureInventoryApi(null);
  }

  const runtime = await createPricingRuntime(mode);
  const promotions =
    mode === "api" && gatewayOrigin && securityApiBase && session
      ? (
          await import("./features/promotions/services/promotionSessionRuntime")
        ).createOptionalPromotionSessionRuntime(gatewayOrigin, securityApiBase, session)
      : null;
  if (mode === "api" && gateway && session) {
    configureTaxonomyGateway(
      createAuthenticatedTaxonomyGateway(gateway, session, fetch),
    );
  }
  const combosRuntime = await createCombosRuntime(mode, runtime);
  let catalogServices = (mode === "api" ? createOptionalCatalogHttpServices(gatewayOrigin) : null) ?? getCatalogServices(mode);
  if (mode === "api" && gateway && session) {
    catalogServices = createCatalogHttpServices(
      createAuthenticatedCatalogTransport(gateway, session),
    );
  }
  const bulkRepository = mode === "api" && gateway && session
    ? createHttpBulkRepository(createBulkFetchTransport(gateway), session)
    : null;
  root.render(
    <StrictMode>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
        forceColorScheme="light"
      >
        <DataModeContext.Provider value={mode}>
          <BulkRepositoryContext.Provider value={bulkRepository}>
            <CatalogServicesContext.Provider value={catalogServices}>
              <PricingProvider runtime={runtime}>
                <AuthSessionContext.Provider value={session}>
                  <PromotionApiContext.Provider value={promotions?.services ?? null}>
                    <CombosProvider mode={mode} runtime={combosRuntime}>
                      <GatewayOriginContext.Provider value={gateway}><App /></GatewayOriginContext.Provider>
                    </CombosProvider>
                  </PromotionApiContext.Provider>
                </AuthSessionContext.Provider>
              </PricingProvider>
            </CatalogServicesContext.Provider>
          </BulkRepositoryContext.Provider>
        </DataModeContext.Provider>
      </MantineProvider>
    </StrictMode>,
  );
}
