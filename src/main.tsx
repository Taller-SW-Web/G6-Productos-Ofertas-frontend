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
        requestWithInit: (path, init) => gatewayClient.request(path, init),
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
        createHttpInventoryRepository({
          transport: gatewayClient,
          listCatalogSkus: async signal => {
            const [categories, brands] = await Promise.all([
              catalogServices.taxonomy.getCategories(signal),
              catalogServices.taxonomy.getBrands(signal),
            ]);
            const categoryNames = new Map(categories.map(item => [item.id, item.nombre]));
            const brandNames = new Map(brands.map(item => [item.id, item.nombre]));
            const output: import("./features/inventory/adapters/apiInventoryAdapter").InventoryCatalogSku[] = [];
            let page = 1;
            let totalPages = 1;
            do {
              const result = await catalogServices.catalog.list({ page, pageSize: 100, status: "all" }, undefined, signal);
              if (result.page !== page || result.pageSize !== 100) throw new Error("Paginación de Catálogo incompatible para Inventario.");
              totalPages = Math.ceil(result.total / 100);
              for (const product of result.items) {
                if (product.status !== "ACTIVO") continue;
                const meta = { productName: product.name, categoryId: product.categoryId, categoryName: categoryNames.get(product.categoryId) ?? `ID ${product.categoryId}`, brandId: product.brandId, brandName: brandNames.get(product.brandId) ?? `ID ${product.brandId}` };
                if (!product.hasVariants && product.skuBase) output.push({ sku: product.skuBase, ...meta });
                if (product.hasVariants) {
                  let variantPage = 1;
                  let variantPages = 1;
                  do {
                    const variants = await catalogServices.catalog.listVariants(product.id, { page: variantPage, pageSize: 100, status: "all" }, undefined, signal);
                    if (variants.page !== variantPage || variants.pageSize !== 100) throw new Error("Paginación de variantes incompatible para Inventario.");
                    variantPages = Math.ceil(variants.total / 100);
                    for (const variant of variants.items) if (variant.status === "ACTIVA") output.push({ sku: variant.sku, ...meta });
                    variantPage++;
                  } while (variantPage <= variantPages);
                }
              }
              page++;
            } while (page <= totalPages);
            return output;
          },
          getCategories: async () => (await catalogServices.taxonomy.getCategories()).map(item => ({ id: item.id, name: item.nombre, active: item.activo })),
          getBrands: async () => (await catalogServices.taxonomy.getBrands()).map(item => ({ id: item.id, name: item.nombre, active: item.activo })),
          resolveTransferPresentation: async dto => {
            const skus = await catalogServices.catalog.list({ page: 1, pageSize: 100, status: "all" });
            let productName = `SKU ${dto.sku} (nombre no disponible en Catálogo)`;
            for (let page = 1; page <= Math.max(1, Math.ceil(skus.total / 100)); page++) {
              const products = page === 1 ? skus : await catalogServices.catalog.list({ page, pageSize: 100, status: "all" });
              const match = products.items.find(item => item.skuBase === dto.sku);
              if (match) { productName = match.name; break; }
              for (const product of products.items.filter(item => item.hasVariants)) {
                const variants = await catalogServices.catalog.listVariants(product.id, { page: 1, pageSize: 100, status: "all" });
                if (variants.items.some(variant => variant.sku === dto.sku)) { productName = product.name; break; }
              }
              if (productName !== `SKU ${dto.sku} (nombre no disponible en Catálogo)`) break;
            }
            return { transferCode: `ID ${dto.traslado_id}`, productName, sourceLocationName: `ID ${dto.source_location_id}`, targetLocationName: `ID ${dto.target_location_id}` };
          },
        }),
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
