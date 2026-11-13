import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { theme, cssVariablesResolver } from "./theme/theme";
import type { G7Session } from "./features/promotions/adapters/g7Session";
import { App } from "./app/App";
import { configureTaxonomyGateway } from "./features/taxonomy/services/taxonomyGatewayRuntime";
import { createPricingRuntime } from "./features/pricing/services/pricingService";
import { PricingProvider } from "./features/pricing/components/PricingProvider";
import { DataModeContext } from "./app/config/DataModeContext";
import { PromotionApiContext } from "./app/config/PromotionApiContext";
import { AuthSessionContext } from "./app/config/AuthSessionContext";
import { createAuthenticatedGatewayClient } from "./app/config/authenticatedGatewayClient";
import { createHttpPricingRepository } from "./features/pricing/adapters/httpPricingRepository";
import { configureInventoryApi } from "./features/inventory/services/inventoryProvider";
import { createHttpInventoryRepository } from "./features/inventory/adapters/apiInventoryAdapter";
import { AuditRuntimeContext } from "./features/price-audit/services/AuditRuntimeContext";
import { createAuditRuntime } from "./features/price-audit/services/auditService";
import { createHttpAuditRepository } from "./features/price-audit/adapters/httpAuditRepository";
import { secureBase } from "./features/promotions/adapters/g7Session";
import { CatalogServicesContext } from "./features/catalog/services/CatalogServicesContext";
import { getCatalogServices } from "./features/catalog/services/catalogServices";
import { createOptionalCatalogHttpServices } from "./features/catalog/services/catalogHttpRuntime";
import { createCombosRuntime } from "./features/combos/services/combosService";
import { CombosProvider } from "./features/combos/components/CombosProvider";
import { BulkRepositoryContext } from "./features/bulk/services/BulkRepositoryContext";
import { createBulkFetchTransport, createHttpBulkRepository } from "./features/bulk/adapters/httpBulkRepository";
import { GatewayOriginContext } from "./app/config/GatewayOriginContext";
import { AdminApiContext } from "./app/config/AdminApiContext";
import { createAuthenticatedInventoryTransport } from "./features/inventory/adapters/authenticatedInventoryTransport";

export async function startApplication(root: Root, mode: "mock" | "api", session: G7Session | null, gatewayOrigin?: string, securityApiBase?: string, adminApiEnabled = false) {
  let gateway: string | undefined;
  try {
    if (gatewayOrigin) gateway = secureBase(gatewayOrigin, true);
  } catch { /* Each unavailable provider keeps its explicit configuration error. */ }

  const promotions =
    mode === "api" && gatewayOrigin && securityApiBase && session
      ? (
          await import("./features/promotions/services/promotionSessionRuntime")
        ).createOptionalPromotionSessionRuntime(gatewayOrigin, securityApiBase, session)
      : null;
  const gatewayClient = mode === "api" && gateway && session
    ? createAuthenticatedGatewayClient(gateway, session)
    : null;
  const scopeId = () => session?.snapshot().user?.id ?? null;
  const adminApi = adminApiEnabled && gatewayClient !== null;
  const httpCatalog = mode === "api" ? createOptionalCatalogHttpServices(gatewayOrigin, session, gatewayClient ?? undefined, adminApi) : null;
  const catalogServices = httpCatalog ?? getCatalogServices(mode);
  const commercialCatalog = httpCatalog?.commercialCatalog ?? catalogServices.catalog;
  const runtime = await createPricingRuntime(mode, {
    ...(adminApi && gatewayClient
      ? {
          api: async () =>
            createHttpPricingRepository({
              transport: gatewayClient,
              scopeId,
              canManagePricing: () => session?.snapshot().user?.roles.includes("GESTOR_COMERCIAL") === true,
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
                  const result = await commercialCatalog.list({ page, pageSize, status: "all" }, undefined, signal);
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
                        const variants = await commercialCatalog.listVariants(product.id, { page: variantPage, pageSize }, undefined, signal);
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
    ...(adminApi && gatewayClient
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
    const identity = scopeId();
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
        const result = await commercialCatalog.list({ page, pageSize: 100, status: "all" });
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
              const variants = await commercialCatalog.listVariants(product.id, { page: variantPage, pageSize: 100, status: "all" });
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
  if (gatewayClient && gateway && session) {
    configureTaxonomyGateway({
      scopeId,
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
    const inventoryTransport = createAuthenticatedInventoryTransport(gateway, session);
    configureInventoryApi(() =>
      createHttpInventoryRepository({
        transport: inventoryTransport,
        currentUserScope: scopeId,
        physicalStockEnabled: adminApi,
        listCatalogSkus: listInventoryCatalogSkus,
        getCategories: async () => (await catalogServices.taxonomy.getCategories()).map(item => ({ id: item.id, name: item.nombre, active: item.activo })),
        getBrands: async () => (await catalogServices.taxonomy.getBrands()).map(item => ({ id: item.id, name: item.nombre, active: item.activo })),
        resolveTransferPresentation: async dto => {
          const productName = (await listInventoryCatalogSkus()).find(item => item.sku === dto.sku)?.productName ?? `SKU ${dto.sku} (nombre no disponible en Catálogo)`;
          return { transferCode: `ID ${dto.traslado_id}`, productName, sourceLocationName: `ID ${dto.source_location_id}`, targetLocationName: `ID ${dto.target_location_id}` };
        },
      }),
    );
  } else {
    configureInventoryApi(null);
  }
  const combosRuntime = await createCombosRuntime(mode, runtime, {
    gateway: adminApi ? gatewayClient ?? undefined : undefined,
    catalog: commercialCatalog,
    scopeId,
  });
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
                <AuditRuntimeContext.Provider value={auditRuntime}>
                  <AuthSessionContext.Provider value={session}>
                    <PromotionApiContext.Provider value={promotions?.services ?? null}>
                      <CombosProvider mode={mode} runtime={combosRuntime}>
                        <GatewayOriginContext.Provider value={gateway}>
                          <AdminApiContext.Provider value={adminApi}><App /></AdminApiContext.Provider>
                        </GatewayOriginContext.Provider>
                      </CombosProvider>
                    </PromotionApiContext.Provider>
                  </AuthSessionContext.Provider>
                </AuditRuntimeContext.Provider>
              </PricingProvider>
            </CatalogServicesContext.Provider>
          </BulkRepositoryContext.Provider>
        </DataModeContext.Provider>
      </MantineProvider>
    </StrictMode>,
  );
}
