import type { AuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
import type { G7Session } from "../../promotions/adapters/g7Session";
import { createCatalogFetchTransport, type CatalogHttpTransport } from "../adapters/catalogHttp";
import { createHttpCatalogRepository } from "../adapters/httpCatalogRepository";
import { createHttpTaxonomyRepository } from "../adapters/httpTaxonomyRepository";
import { createUnavailableApiCatalogRepository } from "../adapters/unavailableApiCatalogRepository";
import { createCatalogServices, type CatalogServices } from "./catalogServices";

export function createCatalogHttpServices(transport: CatalogHttpTransport): CatalogServices {
  const taxonomy = createHttpTaxonomyRepository(transport);
  return createCatalogServices("api", { apiTaxonomy: () => taxonomy,
    apiCatalog: () => createHttpCatalogRepository(transport) });
}

// Explicit Gateway configuration only; no environment-selected authentication bypass.
export function createOptionalCatalogHttpServices(
  origin?: string,
  session?: G7Session | null,
  authenticatedClient?: AuthenticatedGatewayClient,
): CatalogServices | null {
  if (!origin) return null;
  try {
    createCatalogFetchTransport(origin);
    if (!session || !authenticatedClient) return null;
    const transport: CatalogHttpTransport = {
      request: (path, init) =>
        authenticatedClient.request(path, {
          method: init.method,
          signal: init.signal,
          headers: init.headers,
          ...(init.body === undefined ? {} : { body: init.body }),
        }),
    };
    return createCatalogHttpServices(transport);
  }
  catch {
    const message = "La configuración de Gateway de Catálogo no es válida. Se requiere un origen HTTPS o loopback HTTP sin credenciales ni ruta.";
    const unavailable = async (): Promise<never> => { throw new Error(message); };
    return { catalog: createUnavailableApiCatalogRepository(message),
      taxonomy: { getCategories: unavailable, getBrands: unavailable, getProductTypes: unavailable, getAttributeSchema: unavailable } };
  }
}
