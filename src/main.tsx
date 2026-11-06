import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/oswald/latin-700.css";
import { theme, cssVariablesResolver } from "./theme/theme";
import "./theme/global.css";
import { App } from "./app/App";
import { GlobalSessionGate } from "./app/config/GlobalSessionGate";
import {
  configureTaxonomyGateway,
} from "./features/taxonomy/services/taxonomyGatewayRuntime";
import { createPricingRuntime } from "./features/pricing/services/pricingService";
import { PricingProvider } from "./features/pricing/components/PricingProvider";
import { resolveDataMode } from "./app/config/dataMode";
import { DataModeContext } from "./app/config/DataModeContext";
import { PromotionApiContext } from "./app/config/PromotionApiContext";
import { PromotionSessionContext } from "./app/config/PromotionSessionContext";
import { CatalogServicesContext } from "./features/catalog/services/CatalogServicesContext";
import { getCatalogServices } from "./features/catalog/services/catalogServices";
import { createOptionalCatalogHttpServices } from "./features/catalog/services/catalogHttpRuntime";
import { createCombosRuntime } from "./features/combos/services/combosService";
import { CombosProvider } from "./features/combos/components/CombosProvider";
import { BulkRepositoryContext } from "./features/bulk/services/BulkRepositoryContext";
import { createBulkFetchTransport, createHttpBulkRepository } from "./features/bulk/adapters/httpBulkRepository";
import { createAuthenticatedGatewayClient } from "./app/config/authenticatedGatewayClient";
import { createHttpPricingRepository } from "./features/pricing/adapters/httpPricingRepository";
import { configureInventoryApi } from "./features/inventory/services/inventoryProvider";
import { createHttpInventoryRepository } from "./features/inventory/adapters/apiInventoryAdapter";
import { AuditRuntimeContext } from "./features/price-audit/services/AuditRuntimeContext";
import { createAuditRuntime } from "./features/price-audit/services/auditService";
import { createHttpAuditRepository } from "./features/price-audit/adapters/httpAuditRepository";

const root = createRoot(document.getElementById("root")!);
async function start() {
  const mode = resolveDataMode(
    import.meta.env.VITE_DATA_MODE,
    import.meta.env.DEV,
  );
  const gatewayOrigin = import.meta.env.VITE_GATEWAY_ORIGIN as
    string | undefined;
  const securityApiBase = import.meta.env.VITE_G7_API_BASE as
    string | undefined;
  const promotions =
    mode === "api" && gatewayOrigin && securityApiBase
      ? (
          await import("./features/promotions/services/promotionSessionRuntime")
        ).createOptionalPromotionSessionRuntime(gatewayOrigin, securityApiBase)
      : null;
  const gatewayClient = gatewayOrigin && promotions?.session
    ? createAuthenticatedGatewayClient(gatewayOrigin, promotions.session)
    : null;
  const runtime = await createPricingRuntime(mode, {
    ...(mode === "api" && gatewayClient
      ? {
          api: async () =>
            createHttpPricingRepository({
              transport: gatewayClient,
              canManagePricing: () =>
                promotions?.session.snapshot().user?.roles.includes("GESTOR_COMERCIAL") === true,
            }),
        }
      : {}),
  });
  const auditRuntime = await createAuditRuntime(mode, {
    ...(mode === "api" && gatewayClient
      ? { api: async () => createHttpAuditRepository(gatewayClient) }
      : {}),
  });
  if (mode === "api" && gatewayOrigin && promotions) {
    if (gatewayClient) {
      configureTaxonomyGateway({
        request: (path, signal, correlationId) =>
          gatewayClient.request(path, {
            method: "GET",
            signal,
            headers: correlationId
              ? { "X-Correlation-Id": correlationId }
              : {},
          }),
      });
      configureInventoryApi(() =>
        createHttpInventoryRepository({ transport: gatewayClient }),
      );
    }
  }
  const combosRuntime = await createCombosRuntime(mode, runtime);
  const catalogServices = (mode === "api" ? createOptionalCatalogHttpServices(gatewayOrigin, promotions?.session ?? null, gatewayClient ?? undefined) : null) ?? getCatalogServices(mode);
  const bulkRepository = mode === "api" && gatewayOrigin && promotions?.session
    ? createHttpBulkRepository(createBulkFetchTransport(gatewayOrigin), promotions.session)
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
              <AuditRuntimeContext.Provider value={auditRuntime}>
              <PromotionSessionContext.Provider
                value={promotions?.session ?? null}
              >
                <PromotionApiContext.Provider
                  value={promotions?.services ?? null}
                >
                  <CombosProvider mode={mode} runtime={combosRuntime}>
                    <GlobalSessionGate>
                      <App />
                    </GlobalSessionGate>
                  </CombosProvider>
                </PromotionApiContext.Provider>
              </PromotionSessionContext.Provider>
              </AuditRuntimeContext.Provider>
            </PricingProvider>
          </CatalogServicesContext.Provider>
          </BulkRepositoryContext.Provider>
        </DataModeContext.Provider>
      </MantineProvider>
    </StrictMode>,
  );
}
void start().catch((error: unknown) =>
  root.render(
    <div role="alert">
      {error instanceof Error
        ? error.message
        : "No se pudo iniciar la aplicación."}
    </div>,
  ),
);
