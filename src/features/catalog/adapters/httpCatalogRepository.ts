import { CatalogError, type CatalogRepository, type ProductCreatePayload, type ProductUpdatePayload } from "../services/catalogRepository";
import { array, blockedCatalog, choice, createCatalogHttp, encoded, integer, object, string, type CatalogHttpTransport } from "./catalogHttp";
import { mapCommercialAttributes, mapPreparation, mapProduct, mapVariant, requestAttributes, requestPhysical, type CatalogAttributeMetadata } from "./httpCatalogMapper";

/** El listado comercial contiene solo productos publicables; no se usa para gestionar borradores. */
export function createHttpCatalogRepository(transport: CatalogHttpTransport): CatalogRepository {
  const request = createCatalogHttp(transport);
  const productPath = (id: string) => `/productos/${encoded(id)}`;
  const variantPath = (pid: string, vid?: string) => `${productPath(pid)}/variantes${vid === undefined ? "" : "/" + encoded(vid)}`;
  const preparation = async (id: string, signal?: AbortSignal) => {
    const result = mapPreparation(await request(`${productPath(id)}/preparacion`, "GET", undefined, signal));
    if (result.productId !== id) return blockedCatalog("La preparación pertenece a otro producto.");
    return result;
  };
  // Type/unit come from the published characteristic GET. The response already
  // separates identifying/non-identifying values; no roles are inferred here.
  const readSchemas = async (values: unknown[], signal?: AbortSignal): Promise<CatalogAttributeMetadata[]> => {
    const ids = [...new Set(values.map(value => string(object(value).caracteristica_id)))];
    return Promise.all(ids.map(async id => {
      const dto = object(await request(`/caracteristicas/${encoded(id)}`, "GET", undefined, signal));
      if (dto.caracteristicaId !== id) return blockedCatalog("La característica recibida no coincide con la solicitada.");
      return { caracteristicaId: id, tipo: choice(dto.tipo, ["TEXTO", "NUMERO", "LISTA"] as const),
        unidad: dto.unidadMedida == null ? undefined : string(dto.unidadMedida) };
    }));
  };
  const variantAttributes = (dto: Record<string, unknown>) => [...array(dto.identifying_attributes), ...array(dto.non_identifying_attributes)];
  const productSchemas = (dto: Record<string, unknown>, signal?: AbortSignal) => {
    const attributes = dto.attributes === undefined ? [] : array(dto.attributes);
    return readSchemas([...attributes, ...array(dto.variants).flatMap(v => variantAttributes(object(v)))], signal);
  };
  const productResult = async (value: unknown, signal?: AbortSignal, expectedId?: string) => {
    const dto = object(value); const id = string(dto.product_id);
    if (expectedId !== undefined && id !== expectedId) return blockedCatalog("La respuesta pertenece a otro producto.");
    const [prep, schema] = await Promise.all([preparation(id, signal), productSchemas(dto, signal)]);
    return mapProduct(dto, prep, schema);
  };
  const commercialSummary = (value: unknown) => {
    const dto = object(value);
    const id = string(dto.product_id);
    if (!id.trim()) return blockedCatalog("Catálogo devolvió un producto sin identidad.");
    // GET /productos is explicitly a commercial-active listing. ProductSummary
    // does not carry administrative status/version/preparation/variants.
    const images = dto.images === undefined ? undefined : array(dto.images).map(string);
    return { id, name: string(dto.name), skuBase: dto.sku_base == null ? null : string(dto.sku_base),
      hasVariants: typeof dto.tiene_variantes === "boolean" ? dto.tiene_variantes : blockedCatalog("Catálogo omitió tiene_variantes."),
      categoryId: string(dto.categoria_id), categoryName: string(dto.categoria_id),
      typeId: string(dto.tipo_producto_id), typeName: string(dto.tipo_producto_id),
      brandId: string(dto.marca_id), brandName: string(dto.marca_id), status: null, commerciallyActive: true,
      preparationSummary: null, imageUrl: images?.[0], catalogVersion: null };
  };
  const variantResult = async (value: unknown, pid: string, signal?: AbortSignal, expectedId?: string) => {
    const dto = object(value);
    if (expectedId !== undefined && dto.variant_id !== expectedId) return blockedCatalog("La respuesta pertenece a otra variante.");
    const [prep, schema] = await Promise.all([preparation(pid, signal), readSchemas(variantAttributes(dto), signal)]);
    return mapVariant(dto, pid, prep, schema);
  };
  const write = async <T>(path: string, method: "POST" | "PATCH", body: unknown, signal: AbortSignal | undefined,
    map: (value: unknown) => Promise<T>, status = 200): Promise<T> => {
    const result = await request(path, method, body, signal, status);
    try { return await map(result); }
    catch { throw new CatalogError("write_unknown", "El servicio confirmó la escritura, pero no se pudo recuperar toda la vista administrativa. No repita el envío; consulte el registro y su preparación."); }
  };
  const productBody = (p: ProductCreatePayload | ProductUpdatePayload) => ({ ...p,
    atributos: requestAttributes(p.atributos), perfilFisico: requestPhysical(p.perfilFisico) });
  const retry = async (path: string, body: unknown, signal?: AbortSignal) => {
    const dto = object(await request(path, "POST", body, signal, 202));
    if (dto.status !== "ACCEPTED") return blockedCatalog("No se confirmó la admisión del reintento.");
    string(dto.correlation_id);
    return { accepted: true, operationId: string(dto.operation_id), message: "Solicitud admitida. Consulte la preparación para conocer el resultado final." };
  };
  const variantState = async (pid: string, vid: string, action: string, signal?: AbortSignal) => ({
    variant: await write(`${variantPath(pid, vid)}/${action}`, "POST", undefined, signal, value => variantResult(value, pid, signal, vid)),
    // Variante does not publish the updated parent status. Do not derive it from a page.
  });
  return {
    async list(q, _scenario, signal) {
      if (q.typeId || (q.saleModel && q.saleModel !== "all")) return blockedCatalog("Los filtros por tipo y modelo de venta no están publicados para esta consulta.");
      if (q.status && q.status !== "all" && q.status !== "ACTIVO") return blockedCatalog("El resumen comercial sólo publica productos comercialmente activos; no acredita el estado administrativo solicitado.");
      const params = new URLSearchParams({ pagina: String(q.page), tamanio: String(q.pageSize) });
      if (q.q) params.set("q", q.q);
      if (q.categoryId) params.set("categoriaId", q.categoryId);
      if (q.status && q.status !== "all") params.set("estado", q.status);
      const dto = object(await request(`/productos?${params}`, "GET", undefined, signal));
      const items = array(dto.items); const total = integer(dto.total);
      const page = integer(dto.pagina, 1); const pageSize = integer(dto.tamanio, 1);
      const totalPages = Math.ceil(total / pageSize);
      if (page !== q.page || pageSize !== q.pageSize || pageSize > 100 || items.length > pageSize ||
        items.length !== Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize)) || (total === 0 ? totalPages !== 0 : totalPages < page))
        return blockedCatalog("Catálogo devolvió una página comercial inconsistente.");
      return { items: items.map(commercialSummary), total, page, pageSize };
    },
    async getById(id, _scenario, signal) {
      // Commercial detail is useful for display and selection. Administrative
      // state/version/profile remain absent unless a separate DTO publishes them.
      let dto: Record<string, unknown>;
      try { dto = object(await request(productPath(id), "GET", undefined, signal)); }
      catch (error) {
        if (error instanceof CatalogError && error.kind === "not_found")
          return null;
        throw error;
      }
      const summary = commercialSummary(dto);
      if (summary.id !== id || !Array.isArray(dto.variants)) return blockedCatalog("El detalle comercial no coincide con la identidad o carece de la lista contractual de variantes.");
      const prep = await preparation(id, signal);
      const schemas = await productSchemas(dto, signal);
      const adminVariants: Awaited<ReturnType<CatalogRepository["listVariants"]>> = { items: [], total: 0, page: 1, pageSize: 100 };
      if (summary.hasVariants) {
        const seen = new Set<string>(); let page = 1; let total = -1;
        while (total < 0 || adminVariants.items.length < total) {
          const batch = await this.listVariants(id, { page, pageSize: 100, status: "all" }, undefined, signal);
          if (batch.page !== page || batch.pageSize !== 100 || (total >= 0 && total !== batch.total) || batch.items.length === 0 && adminVariants.items.length < batch.total) return blockedCatalog("La paginación de variantes administrativas es incompleta.");
          total = batch.total;
          for (const variant of batch.items) { if (seen.has(variant.variantId)) return blockedCatalog("Catálogo repitió una variante en páginas distintas."); seen.add(variant.variantId); adminVariants.items.push(variant); }
          page++;
          if (page > 10_000) return blockedCatalog("La consulta de variantes excedió el límite defensivo de paginación.");
        }
        adminVariants.total = total;
      }
      const statusList = [prep.pricing.status, ...(prep.inventario ? [prep.inventario.status] : []), ...adminVariants.items.filter(v => v.status === "ACTIVA").map(v => v.inventoryPreparationStatus)];
      const preparationSummary = statusList.every(s => s === "COMPLETED") ? "COMPLETED" : statusList.every(s => s === "PENDING") ? "PENDING" : statusList.includes("REJECTED") ? "REJECTED" : "PARTIAL";
      const images = dto.images === undefined ? [] : array(dto.images).map(string);
      const attributes = dto.attributes === undefined ? [] : array(dto.attributes);
      return { ...summary, description: typeof dto.description === "string" ? string(dto.description) : null, images: images.map(url => ({ url })),
        attributes: mapCommercialAttributes(attributes, schemas), physicalProfile: undefined, preparation: prep,
        variants: adminVariants.items.map(v => ({ variantId: v.variantId, sku: v.sku, attributesSummary: v.identifyingAttributes.map(a => String(a.valor)).join(" / "), status: v.status, preparationStatus: v.inventoryPreparationStatus, manualRetryAllowed: v.inventoryManualRetryAllowed })),
        preparationSummary, publishedCommercially: true };
    },
    create: (p, _sc, sig) => write("/productos", "POST", productBody(p), sig, value => productResult(value, sig), 201),
    update: (id, p, _sc, sig) => write(productPath(id), "PATCH", productBody(p), sig, value => productResult(value, sig, id)),
    activate: (id, p, _sc, sig) => write(`${productPath(id)}/activar`, "POST", p ?? {}, sig, value => productResult(value, sig, id)),
    deactivate: (id, p, _sc, sig) => write(`${productPath(id)}/desactivar`, "POST", p ?? {}, sig, value => productResult(value, sig, id)),
    reactivate: (id, p, _sc, sig) => write(`${productPath(id)}/reactivar`, "POST", p ?? {}, sig, value => productResult(value, sig, id)),
    getPreparation: (id, _sc, sig) => preparation(id, sig),
    retryPreparation: (id, p, _sc, sig) => retry(`${productPath(id)}/preparacion/reintentar`, p, sig),
    async listVariants(pid, q, _sc, sig) {
      const params = new URLSearchParams({ pagina: String(q?.page ?? 1), tamanio: String(q?.pageSize ?? q?.limit ?? 20) });
      if (q?.status && q.status !== "all") params.set("estado", q.status);
      const dto = object(await request(`${variantPath(pid)}?${params}`, "GET", undefined, sig));
      const meta = object(dto.meta);
      const items = array(dto.items);
      const requestedPage = q?.page ?? 1;
      const requestedPageSize = q?.pageSize ?? q?.limit ?? 20;
      const total = integer(meta.total);
      const totalPages = Math.ceil(total / requestedPageSize);
      if (integer(meta.pagina, 1) !== requestedPage || integer(meta.tamanio, 1) !== requestedPageSize ||
        items.length !== Math.min(requestedPageSize, Math.max(0, total - (requestedPage - 1) * requestedPageSize)) ||
        (total > 0 && requestedPage > totalPages)) return blockedCatalog("Catálogo devolvió una página de variantes inconsistente.");
      // One preparation snapshot and one metadata read per characteristic/page.
      const mapped = items.length ? await Promise.all([
        preparation(pid, sig), readSchemas(items.flatMap(v => variantAttributes(object(v))), sig),
      ]).then(([prep, schema]) => items.map(v => mapVariant(v, pid, prep, schema))) : [];
      return { items: mapped, total, page: requestedPage, pageSize: requestedPageSize };
    },
    getVariantById: async (pid, vid, _sc, sig) => variantResult(await request(variantPath(pid, vid), "GET", undefined, sig), pid, sig, vid),
    createVariant: async (pid, p, _sc, sig) => {
      if (typeof p.sku !== "string" || !p.sku.trim()) throw new CatalogError("validation", "El SKU es obligatorio (SKU_INVALIDO).", { sku: "Ingrese un SKU explícito." });
      return write(variantPath(pid), "POST", { sku: p.sku,
        atributosIdentificadores: requestAttributes(p.identifyingAttributes ?? p.atributosIdentificadores),
        atributosNoIdentificadores: requestAttributes(p.nonIdentifyingAttributes ?? p.atributosNoIdentificadores),
        imagenUrl: p.imageUrl ?? p.imagenUrl, perfilFisico: requestPhysical(p.physicalProfile !== undefined ? p.physicalProfile : p.perfilFisico) },
        sig, value => variantResult(value, pid, sig), 201);
    },
    updateVariant: (pid, vid, p, _sc, sig) => write(variantPath(pid, vid), "PATCH", {
      atributosNoIdentificadores: requestAttributes(p.nonIdentifyingAttributes ?? p.atributosNoIdentificadores),
      imagenUrl: p.imageUrl ?? p.imagenUrl, perfilFisico: requestPhysical(p.physicalProfile !== undefined ? p.physicalProfile : p.perfilFisico), catalogVersion: p.catalogVersion },
      sig, value => variantResult(value, pid, sig, vid)),
    activateVariant: (pid, vid, _sc, sig) => variantState(pid, vid, "activar", sig),
    deactivateVariant: (pid, vid, _sc, sig) => variantState(pid, vid, "desactivar", sig),
    reactivateVariant: (pid, vid, _sc, sig) => variantState(pid, vid, "reactivar", sig),
    retryVariantPreparation: (pid, vid, _sc, sig) => retry(`${variantPath(pid, vid)}/preparacion/reintentar`, {}, sig),
  };
}
