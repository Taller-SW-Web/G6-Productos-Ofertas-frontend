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
  const catalogServices = (mode === "api" ? createOptionalCatalogHttpServices(gatewayOrigin, promotions?.session ?? null, gatewayClient ?? undefined) : null) ?? getCatalogServices(mode);
  const runtime = await createPricingRuntime(mode, {
    ...(mode === "api" && gatewayClient
      ? {
          api: async () =>
            createHttpPricingRepository({
              transport: gatewayClient,
              canManagePricing: () => promotions?.session.snapshot().user?.roles.includes("GESTOR_COMERCIAL") === true,
              listCatalogTargets: async signal => {
                const targets = [];
                const pageSize = 100;
                let page = 1;
                let totalPages = 1;
                do {
                  const result = await catalogServices.catalog.list({ page, pageSize, status: "all" }, undefined, signal);
                  if (result.page !== page || result.pageSize !== pageSize || result.items.length > result.total) throw new Error("Paginación de Catálogo incompatible.");
                  totalPages = Math.ceil(result.total / pageSize);
                  for (const product of result.items) {
                    const productTargetId = product.id;
                    targets.push({ id: productTargetId, label: product.name, productId: product.id, kind: "product" as const, ...(product.skuBase ? { referenceSku: product.skuBase } : {}) });
                    if (product.hasVariants) {
                      let variantPage = 1;
                      let variantPages = 1;
                      do {
                        const variants = await catalogServices.catalog.listVariants(product.id, { page: variantPage, pageSize }, undefined, signal);
                        if (variants.page !== variantPage || variants.pageSize !== pageSize || variants.items.length > variants.total) throw new Error("Paginación de variantes incompatible.");
                        variantPages = Math.ceil(variants.total / pageSize);
                        for (const variant of variants.items) if (variant.status === "ACTIVA") targets.push({ id: `sku:${variant.sku}`, label: `${product.name} · ${variant.sku}`, productId: product.id, kind: "variant" as const, sku: variant.sku, productTargetId });
                        variantPage++;
                      } while (variantPage <= variantPages);
                    }
                  }
                  page++;
                } while (page <= totalPages);
                return targets;
              },
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
  const combosRuntime = await createCombosRuntime(mode, runtime, {
    gateway: gatewayClient ?? undefined,
    catalog: catalogServices.catalog,
  });
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
