import type { AttributeSchema, TaxonomyRepository } from "../services/taxonomyRepository";
import { array, blockedCatalog, boolean, choice, createCatalogHttp, encoded, integer, object, string, type CatalogHttpTransport } from "./catalogHttp";

/** Read-only Catalog port, not an implementation of Taxonomy administration. */
export function createHttpTaxonomyRepository(transport: CatalogHttpTransport): TaxonomyRepository {
  const request = createCatalogHttp(transport);
  const listAll = async (path: string, signal?: AbortSignal) => {
    const result: unknown[] = [];
    const identities = new Set<string>();
    const pageSize = 200;
    let page = 1;
    let total = -1;
    let totalPages = -1;
    while (page <= Math.max(1, totalPages)) {
      const dto = object(await request(`${path}?pagina=${page}&tamanio=${pageSize}`, "GET", undefined, signal));
      const meta = object(dto.meta);
      const current = integer(meta.pagina, 1);
      const size = integer(meta.tamanio, 1);
      const reportedTotal = integer(meta.total);
      const reportedPages = integer(meta.totalPaginas);
      const items = array(dto.items);
      const expectedPages = Math.ceil(reportedTotal / size);
      if (current !== page || size !== pageSize || reportedPages !== expectedPages ||
        items.length !== Math.min(size, Math.max(0, reportedTotal - (page - 1) * size)) ||
        (total !== -1 && (total !== reportedTotal || totalPages !== reportedPages)))
        return blockedCatalog("La paginación de datos maestros de Taxonomía es inconsistente.");
      total = reportedTotal;
      totalPages = reportedPages;
      for (const item of items) {
        const row = object(item);
        const id = string(row.categoriaId ?? row.marcaId);
        if (identities.has(id)) return blockedCatalog("Taxonomía repitió una identidad en páginas distintas.");
        identities.add(id);
        result.push(item);
      }
      if (page >= totalPages) break;
      page++;
      if (page > 10_000) return blockedCatalog("La consulta excedió el límite defensivo de paginación.");
    }
    if (result.length !== total) return blockedCatalog("Taxonomía no entregó el conjunto completo de datos maestros.");
    return result;
  };
  return {
    async getCategories(signal) {
      const rows = await listAll("/categorias/administracion", signal);
      return rows.map(value => { const row = object(value); return {
        id: string(row.categoriaId ?? row.categoria_id), nombre: string(row.nombre ?? row.name), activo: ["ACTIVO", "ACTIVA"].includes(String(row.estado ?? row.status)) };
      });
    },
    async getBrands(signal) {
      const rows = await listAll("/marcas/administracion", signal);
      return rows.map(value => { const row = object(value); return {
        id: string(row.marcaId ?? row.marca_id), nombre: string(row.nombre ?? row.name), activo: ["ACTIVO", "ACTIVA"].includes(String(row.estado ?? row.status)) };
      });
    },
    async getProductTypes(signal) {
      const result = []; let page = 1;
      while (true) {
        const dto = object(await request(`/tipos-producto?pagina=${page}&tamanio=100`, "GET", undefined, signal));
        const meta = object(dto.meta); const current = integer(meta.pagina, 1); const size = integer(meta.tamanio, 1);
        const total = integer(meta.total); const pages = integer(meta.totalPaginas);
        const items = array(dto.items);
        if (current !== page || size > 100 || pages !== Math.ceil(total / size) ||
          items.length !== Math.min(size, Math.max(0, total - (page - 1) * size))) return blockedCatalog("La lista de tipos de producto está incompleta.");
        result.push(...items.map(value => { const row = object(value); return {
          id: string(row.tipoProductoId), nombre: string(row.nombre), activo: choice(row.estado, ["ACTIVO", "INACTIVO"] as const) === "ACTIVO" };
        }));
        if (page >= pages) return result;
        page++;
      }
    },
    async getAttributeSchema(typeId, signal): Promise<AttributeSchema[]> {
      const dto = object(await request(`/tipos-producto/${encoded(typeId)}/caracteristicas`, "GET", undefined, signal));
      integer(dto.schemaVersion);
      if (object(dto.tipoProducto).tipoProductoId !== typeId) return blockedCatalog("El esquema recibido pertenece a otro tipo de producto.");
      return array(dto.caracteristicas).filter(value => choice(object(value).estado, ["ACTIVO", "INACTIVO"] as const) === "ACTIVO").map(value => {
        const association = object(value); const c = object(association.caracteristica);
        if (c.caracteristicaId !== association.caracteristicaId || c.estado !== "ACTIVO") return blockedCatalog("La característica asociada no está disponible.");
        const tipo = choice(c.tipo, ["TEXTO", "NUMERO", "LISTA"] as const);
        // The published schema has no role metadata or configurable text limit.
        // Do not turn obligatoria into esIdentificadora, or use the initial SPEC limit.
        if (tipo === "TEXTO") return blockedCatalog("Taxonomía no publica el límite de texto configurado para esta característica.");
        return { caracteristicaId: string(c.caracteristicaId), nombre: string(c.nombre), tipo,
          obligatorio: boolean(association.obligatoria), unidad: c.unidadMedida == null ? undefined : string(c.unidadMedida),
          opciones: tipo === "LISTA" ? array(c.valores).filter(v => object(v).estado === "ACTIVO").map(v => {
            const option = object(v); return { id: string(option.valorId), valor: string(option.nombre) };
          }) : undefined };
      });
    },
  };
}
