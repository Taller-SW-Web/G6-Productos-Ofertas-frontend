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
                let totalPages: number;
                let reportedTotal: number | undefined;
                const productIds = new Set<string>();
                const targetIds = new Set<string>();
                const skus = new Set<string>();
                do {
                  const result = await catalogServices.catalog.list({ page, pageSize, status: "all" }, undefined, signal);
                  if (result.page !== page || result.pageSize !== pageSize || (reportedTotal !== undefined && reportedTotal !== result.total) || result.items.length !== Math.min(pageSize, Math.max(0, result.total - (page - 1) * pageSize))) throw new Error("Paginación de Catálogo incompatible.");
                  reportedTotal = result.total;
                  totalPages = Math.ceil(result.total / pageSize);
                  for (const product of result.items) {
                    if (!product.id || productIds.has(product.id) || !(product.commerciallyActive === true || product.status === "ACTIVO")) throw new Error("Catálogo devolvió una identidad de producto duplicada o no comercialmente activa.");
                    productIds.add(product.id);
                    const productTargetId = product.id;
                    if (targetIds.has(productTargetId)) throw new Error("Catálogo devolvió un objetivo de Pricing duplicado.");
                    targetIds.add(productTargetId);
                    targets.push({ id: productTargetId, label: product.name, productId: product.id, kind: "product" as const, ...(product.skuBase ? { referenceSku: product.skuBase } : {}) });
                    if (product.hasVariants) {
                      let variantPage = 1;
                      let variantPages: number;
                      let variantTotal: number | undefined;
                      do {
                        const variants = await catalogServices.catalog.listVariants(product.id, { page: variantPage, pageSize }, undefined, signal);
                        if (variants.page !== variantPage || variants.pageSize !== pageSize || (variantTotal !== undefined && variantTotal !== variants.total) || variants.items.length !== Math.min(pageSize, Math.max(0, variants.total - (variantPage - 1) * pageSize)) || variants.items.some(variant => variant.productId !== product.id)) throw new Error("Paginación o identidad de variantes incompatible.");
                        variantTotal = variants.total;
                        variantPages = Math.ceil(variants.total / pageSize);
                        for (const variant of variants.items) if (variant.status === "ACTIVA") {
                          if (!variant.sku || skus.has(variant.sku) || targetIds.has(`sku:${variant.sku}`)) throw new Error("Catálogo devolvió un SKU u objetivo de Pricing duplicado.");
                          skus.add(variant.sku);
                          targetIds.add(`sku:${variant.sku}`);
                          targets.push({ id: `sku:${variant.sku}`, label: `${product.name} · ${variant.sku}`, productId: product.id, kind: "variant" as const, sku: variant.sku, productTargetId });
                        }
                        variantPage++;
                      } while (variantPage <= variantPages);
                    }
                  }
                  page++;
                } while (page <= totalPages);
                if (productIds.size !== (reportedTotal ?? 0)) throw new Error("La selección de Pricing no cubre el catálogo completo.");
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
  type InventorySkus = import("./features/inventory/adapters/apiInventoryAdapter").InventoryCatalogSku[];
  const inventorySkuCache = new Map<string, { items: InventorySkus; at: number }>();
  const inventorySkuLoads = new Map<string, Promise<InventorySkus>>();
  const waitForInventorySkus = (promise: Promise<InventorySkus>, signal?: AbortSignal): Promise<InventorySkus> => {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
      signal.addEventListener("abort", abort, { once: true });
      promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); });
    });
  };
  const listInventoryCatalogSkus = async (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const identity = promotions?.session.snapshot().user?.id;
    if (!identity) throw new Error("Inicia sesión para consultar las identidades de SKU.");
    const cached = inventorySkuCache.get(identity);
    if (cached && Date.now() - cached.at < 30_000) return cached.items;
    let inventorySkuLoad = inventorySkuLoads.get(identity);
    if (!inventorySkuLoad) {
      inventorySkuLoad = (async () => {
      const [categories, brands] = await Promise.all([catalogServices.taxonomy.getCategories(), catalogServices.taxonomy.getBrands()]);
      const categoryNames = new Map(categories.map(item => [item.id, item.nombre]));
      const brandNames = new Map(brands.map(item => [item.id, item.nombre]));
      const output: import("./features/inventory/adapters/apiInventoryAdapter").InventoryCatalogSku[] = [];
      let page = 1;
      let totalPages: number;
      let reportedTotal: number | undefined;
      const productIds = new Set<string>();
      do {
        const result = await catalogServices.catalog.list({ page, pageSize: 100, status: "all" });
        if (result.page !== page || result.pageSize !== 100 || (reportedTotal !== undefined && reportedTotal !== result.total) || result.items.length !== Math.min(100, Math.max(0, result.total - (page - 1) * 100))) throw new Error("Paginación de Catálogo incompleta para Inventario.");
        reportedTotal = result.total;
        totalPages = Math.ceil(result.total / 100);
        for (const product of result.items) {
          if (!product.id || productIds.has(product.id) || !(product.commerciallyActive === true || product.status === "ACTIVO")) throw new Error("Catálogo devolvió una identidad de producto duplicada o no activa para Inventario.");
          productIds.add(product.id);
          const meta = { productName: product.name, categoryId: product.categoryId, categoryName: categoryNames.get(product.categoryId) ?? `ID ${product.categoryId}`, brandId: product.brandId, brandName: brandNames.get(product.brandId) ?? `ID ${product.brandId}` };
          if (!product.hasVariants && product.skuBase) output.push({ sku: product.skuBase, ...meta });
          if (product.hasVariants) {
            let variantPage = 1;
            let variantPages: number;
            let variantTotal: number | undefined;
            do {
              const variants = await catalogServices.catalog.listVariants(product.id, { page: variantPage, pageSize: 100, status: "all" });
              if (variants.page !== variantPage || variants.pageSize !== 100 || (variantTotal !== undefined && variantTotal !== variants.total) || variants.items.length !== Math.min(100, Math.max(0, variants.total - (variantPage - 1) * 100)) || variants.items.some(variant => variant.productId !== product.id)) throw new Error("Paginación o identidad de variantes incompleta para Inventario.");
              variantTotal = variants.total;
              variantPages = Math.ceil(variants.total / 100);
              for (const variant of variants.items) if (variant.status === "ACTIVA") output.push({ sku: variant.sku, ...meta });
              variantPage++;
            } while (variantPage <= variantPages);
          }
        }
        page++;
      } while (page <= totalPages);
      if (productIds.size !== (reportedTotal ?? 0)) throw new Error("Catálogo no entregó todos los productos para Inventario.");
      if (new Set(output.map(item => item.sku)).size !== output.length) throw new Error("Catálogo devolvió SKU duplicados para Inventario.");
      return output;
      })();
      inventorySkuLoads.set(identity, inventorySkuLoad);
      void inventorySkuLoad.finally(() => { if (inventorySkuLoads.get(identity) === inventorySkuLoad) inventorySkuLoads.delete(identity); }).catch(() => undefined);
    }
    const items = await waitForInventorySkus(inventorySkuLoad, signal);
    inventorySkuCache.set(identity, { items, at: Date.now() });
    return items;
  };
  if (mode === "api" && gatewayOrigin && promotions) {
    if (gatewayClient) {
      configureTaxonomyGateway({
        scopeId: () => promotions.session.snapshot().user?.id ?? null,
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
          currentUserScope: () => promotions.session.snapshot().user?.id ?? null,
          listCatalogSkus: listInventoryCatalogSkus,
          getCategories: async () => (await catalogServices.taxonomy.getCategories()).map(item => ({ id: item.id, name: item.nombre, active: item.activo })),
          getBrands: async () => (await catalogServices.taxonomy.getBrands()).map(item => ({ id: item.id, name: item.nombre, active: item.activo })),
          resolveTransferPresentation: async dto => {
            const productName = (await listInventoryCatalogSkus()).find(item => item.sku === dto.sku)?.productName ?? `SKU ${dto.sku} (nombre no disponible en Catálogo)`;
            return { transferCode: `ID ${dto.traslado_id}`, productName, sourceLocationName: `ID ${dto.source_location_id}`, targetLocationName: `ID ${dto.target_location_id}` };
          },
        }),
      );
    }
  }
  const combosRuntime = await createCombosRuntime(mode, runtime, {
    gateway: gatewayClient ?? undefined,
    catalog: catalogServices.catalog,
    scopeId: () => promotions?.session.snapshot().user?.id ?? null,
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
