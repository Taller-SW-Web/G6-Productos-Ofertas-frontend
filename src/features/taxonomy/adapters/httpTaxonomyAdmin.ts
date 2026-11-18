import type { TaxonomyGatewayTransport } from "./httpProductTypeAdapter";
import type { CategoryRepository, CategoryListResult } from "../services/categoryRepository";
import type { CharacteristicRepository } from "../services/characteristicRepository";
import type { BrandRepository } from "../services/brandRepository";
import type { SeoRepository } from "../services/seoRepository";
import type { CategoryNode, CategoryDetail, CategoryCreateInput, CategoryCreateResult, CategoryUpdateInput, SlugCheckResult, BajaSolicitudResult, ReactivacionResult, CharacteristicListItem, CharacteristicDetail, CharacteristicValue, BrandDetail, SeoCategory, HistorialSlugItem, OperationFollowUpResult } from "../types";
import { taxonomySend, TaxonomyHttpError, taxonomyHttpStatus, taxonomyHttpCode, reconcileConfirmedTaxonomyResource } from "./taxonomyHttp";

const invalid = () => new Error("Respuesta administrativa de Taxonomía inválida.");
type Row = Record<string, unknown>;
function row(value: unknown): Row { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(); return value as Row; }
function str(value: unknown): string { if (typeof value !== "string") throw invalid(); return value; }
function num(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 0) throw invalid(); return Number(value); }
function status(value: unknown): "Activo" | "Inactivo" { if (value === "ACTIVO") return "Activo"; if (value === "INACTIVO") return "Inactivo"; throw invalid(); }
function treeNode(value: unknown, level = 0): CategoryNode {
  const dto = row(value); const category = row(dto.categoria ?? dto); const children = dto.hijos;
  if (children !== undefined && !Array.isArray(children)) throw invalid();
  return { id: str(category.categoriaId), nombre: str(category.nombre), nivel: level, estado: status(category.estado),
    ...(typeof category.slug === "string" ? { slug: category.slug } : {}),
    ...(typeof category.orden === "number" ? { orden: num(category.orden) } : {}),
    ...(typeof category.descripcion === "string" ? { descripcion: category.descripcion } : {}),
    ...(Array.isArray(children) ? { hijas: children.map(child => treeNode(child, level + 1)) } : {}) };
}
function categoryDetail(value: unknown): CategoryDetail {
  const dto = row(value); const children = dto.hijas ?? dto.hijos ?? [];
  return { id: str(dto.categoriaId), nombre: str(dto.nombre), slug: dto.slug === null || typeof dto.slug === "string" ? dto.slug : null,
    nivel: typeof dto.nivel === "number" ? num(dto.nivel) : null, orden: dto.orden === null || typeof dto.orden === "number" ? (dto.orden === null ? null : num(dto.orden)) : null,
    version: num(dto.version),
    estado: status(dto.estado), ...(typeof dto.descripcion === "string" ? { descripcion: dto.descripcion } : {}),
    ...(typeof dto.categoriaPadreId === "string" ? { padreId: dto.categoriaPadreId } : {}),
    ...(typeof dto.categoriaPadreNombre === "string" ? { padreNombre: dto.categoriaPadreNombre } : {}),
    hijas: Array.isArray(children) ? children.map(child => treeNode(child)) : [] };
}
function characteristicValue(value: unknown): CharacteristicValue {
  const dto = row(value); return { valorId: str(dto.valorId), nombre: str(dto.nombre), estado: status(dto.estado), version: num(dto.version) };
}
function characteristicDetail(value: unknown): CharacteristicDetail {
  const dto = row(value); if (!(dto.tipo === "TEXTO" || dto.tipo === "NUMERO" || dto.tipo === "LISTA")) throw invalid();
  const values = dto.valores == null ? undefined : Array.isArray(dto.valores) ? dto.valores.map(characteristicValue) : (() => { throw invalid(); })();
  return { id: str(dto.caracteristicaId), nombre: str(dto.nombre), tipo: dto.tipo, estado: status(dto.estado),
    ...(typeof dto.unidadMedida === "string" ? { unidad: dto.unidadMedida } : {}),
    ...(typeof dto.version === "number" ? { version: num(dto.version) } : {}),
    valoresActivos: values?.filter(value => value.estado === "Activo").length ?? (typeof dto.valoresActivos === "number" ? num(dto.valoresActivos) : null), ...(values ? { valores: values } : {}) };
}
function brandDetail(value: unknown): BrandDetail {
  const dto = row(value); const logo = dto.logoUrl; const country = dto.paisOrigenIso; const description = dto.descripcion;
  return { marcaId: str(dto.marcaId), nombre: str(dto.nombre), estado: status(dto.estado), version: num(dto.version),
    logoUrl: logo === null || typeof logo === "string" ? logo : undefined,
    paisOrigenIso: country === null || typeof country === "string" ? country : undefined,
    descripcion: description === null || typeof description === "string" ? description : undefined };
}
function followup(value: unknown): OperationFollowUpResult {
  const dto = row(value); const current = dto.status;
  const estado = current === "PENDING_DEACTIVATION" ? "pendiente" : current === "CLEAR" || current === "COMPLETED" ? "confirmada" : current === "REJECTED" ? "rechazada" : "no-concluyente";
  return { operacionId: str(dto.operation_id), estado, mensaje: typeof dto.code === "string" ? str(dto.code) : `Estado de la operación: ${String(current)}.` };
}
function append(path: string, query: Record<string, string | undefined>): string { const q = new URLSearchParams(); for (const [key, value] of Object.entries(query)) if (value) q.set(key, value); const suffix = q.toString(); return suffix ? `${path}?${suffix}` : path; }
async function listAll(transport: TaxonomyGatewayTransport, path: string, idField: string, signal?: AbortSignal): Promise<Row[]> {
  const items: Row[] = []; const ids = new Set<string>(); const pageSize = 200; let page = 1; let total: number | undefined; let totalPages: number | undefined;
  for (;;) {
    const dto = row(await send(transport, append(path, { pagina: String(page), tamanio: String(pageSize) }), "GET", undefined, signal, 200));
    const meta = row(dto.meta); const current = num(meta.pagina); const size = num(meta.tamanio); const nextTotal = num(meta.total); const nextPages = num(meta.totalPaginas);
    if (current !== page || size !== pageSize || nextPages !== Math.ceil(nextTotal / size) || (total !== undefined && (total !== nextTotal || totalPages !== nextPages)) || !Array.isArray(dto.items) || dto.items.length !== Math.min(size, Math.max(0, nextTotal - (page - 1) * size))) throw invalid();
    total = nextTotal; totalPages = nextPages;
    for (const value of dto.items) { const item = row(value); const id = str(item[idField]); if (ids.has(id)) throw invalid(); ids.add(id); items.push(item); }
    if (page >= totalPages) break;
    if (page >= 10_000) throw invalid();
    page++;
  }
  if (items.length !== total) throw invalid();
  return items;
}

export function createHttpCategoryRepository(transport: TaxonomyGatewayTransport): CategoryRepository {
  const get = async (path: string, signal?: AbortSignal) => { const owner = transport.scopeId?.() ?? "session-unavailable"; const dto = await send(transport, path, "GET", undefined, signal, 200); if ((transport.scopeId?.() ?? "session-unavailable") !== owner) throw new Error("La sesión cambió durante la lectura de Taxonomía."); await reconcileConfirmedTaxonomyResource(transport, path, dto, owner); return dto; };
  const getCategoryDetail = async (id: string, signal?: AbortSignal) => {
    const dto = row(await get(`/api/v1/categorias/${encodeURIComponent(id)}`, signal));
    if (dto.categoriaId !== id) throw invalid();
    const tree = await get("/api/v1/categorias/arbol", signal);
    if (!Array.isArray(tree)) throw invalid();
    const matches: { raw: unknown; level: number; parent?: Row }[] = [];
    const visit = (nodes: unknown[], level: number, parent?: Row) => {
      for (const item of nodes) { const node = row(item); const category = row(node.categoria ?? node); if (category.categoriaId === id) matches.push({ raw: node, level, parent: parent ? row(parent.categoria ?? parent) : undefined }); if (node.hijos !== undefined && !Array.isArray(node.hijos)) throw invalid(); if (Array.isArray(node.hijos)) visit(node.hijos, level + 1, node); }
    };
    visit(tree, 0);
    if (matches.length !== 1) throw invalid();
    const match = matches[0]; if (!match) throw invalid();
    const node = row(match.raw); const children = node.hijos === undefined ? [] : (node.hijos as unknown[]).map(child => treeNode(child, match.level + 1));
    const parentId = typeof match.parent?.categoriaId === "string" ? match.parent.categoriaId : undefined;
    if (Object.hasOwn(dto, "categoriaPadreId") && (typeof dto.categoriaPadreId === "string" ? dto.categoriaPadreId : undefined) !== parentId) throw invalid();
    return { ...categoryDetail(dto), nivel: match.level, hijas: children, ...(parentId ? { padreId: parentId } : {}), ...(match.parent ? { padreNombre: str(match.parent.nombre) } : {}) };
  };
  return {
    async list(signal): Promise<CategoryListResult> {
      const value = await get("/api/v1/categorias/arbol", signal); if (!Array.isArray(value)) throw invalid(); return { nodos: value.map(item => treeNode(item)) };
    },
    async obtener(id, signal) { try { return await getCategoryDetail(id, signal); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async comprobarSlug(slug, signal): Promise<SlugCheckResult> {
      const dto = row(await send(transport, "/api/v1/seo/categorias/slug/resolver", "POST", { nombre: slug }, signal, 200, undefined, true));
      const resolved = str(dto.slug); const colisionResuelta = dto.colisionResuelta === true;
      if (typeof dto.colisionResuelta !== "boolean") throw invalid();
      return { slug: resolved, disponible: true, ...(colisionResuelta && resolved !== slug ? { alternativo: resolved } : {}) };
    },
    async crear(input: CategoryCreateInput, signal): Promise<CategoryCreateResult> {
      return send(transport, "/api/v1/categorias", "POST", { nombre: input.nombre, slugConfirmado: input.slug, categoriaPadreId: input.padreId ?? null, descripcion: input.descripcion ?? null }, signal, 201, value => { const dto = row(value); return { id: str(dto.categoriaId), nombre: str(dto.nombre), slug: typeof dto.slug === "string" ? dto.slug : input.slug }; });
    },
    async actualizar(input: CategoryUpdateInput, signal) {
      const current = await this.obtener(input.id, signal); if (!current) throw httpError(404, "CATEGORIA_NO_ENCONTRADA");
      const resourcePath = `/api/v1/categorias/${encodeURIComponent(input.id)}`;
      const patched = await send(transport, resourcePath, "PATCH", { nombre: input.nombre, categoriaPadreId: input.padreId ?? null, descripcion: input.descripcion ?? null, orden: input.orden, version: current.version }, signal, 200, value => {
        const receipt = row(value);
        if (typeof receipt.categoriaId === "string" && receipt.categoriaId !== input.id) throw invalid();
        return { ...current, nombre: input.nombre, ...(input.padreId ? { padreId: input.padreId } : { padreId: undefined }), descripcion: input.descripcion, orden: input.orden, actualizadaSinLectura: true };
      }, false, { resourcePath, entity: "category" });
      try { return await getCategoryDetail(input.id, signal); }
      catch { return { ...patched, nombre: input.nombre, ...(input.padreId ? { padreId: input.padreId } : {}), descripcion: input.descripcion, orden: input.orden, actualizadaSinLectura: true }; }
    },
    async solicitarBaja(id, signal): Promise<BajaSolicitudResult> {
      const before = await this.obtener(id, signal); if (!before) throw httpError(404, "CATEGORIA_NO_ENCONTRADA");
      const operacionId = await send(transport, `/api/v1/categorias/${encodeURIComponent(id)}/desactivar`, "POST", undefined, signal, 202, value => str(row(value).operation_id));
      return { resultado: "verificando", categoria: { ...before, estado: "Verificando baja" }, bloqueos: [], mensaje: "Solicitud recibida; consulta el estado de la operación.", operacionId };
    },
    async reactivar(id, signal): Promise<ReactivacionResult> {
      const confirmed = await send(transport, `/api/v1/categorias/${encodeURIComponent(id)}/reactivar`, "POST", undefined, signal, 200, categoryDetail);
      try { return { resultado: "reactivada", categoria: await getCategoryDetail(id, signal), bloqueos: [], mensaje: "Categoría reactivada." }; }
      catch { return { resultado: "reactivada", categoria: { ...confirmed, estado: "Activo", actualizadaSinLectura: true }, bloqueos: [], mensaje: "La reactivación fue confirmada, pero no se pudo refrescar el detalle. Consulta la categoría antes de otra modificación." }; }
    },
    async consultarEstadoOperacion(operacionId, signal) {
      const dto = row(await get(`/api/v1/taxonomia/operaciones/${encodeURIComponent(operacionId)}`, signal));
      const result = followup(dto);
      return { ...result, ...(dto.entity_type === "CATEGORY" && result.estado === "confirmada" ? { categoria: await getCategoryDetail(str(dto.entity_id), signal) } : {}) };
    },
  };
}

export function createHttpCharacteristicRepository(transport: TaxonomyGatewayTransport): CharacteristicRepository {
  const get = async (path: string, signal?: AbortSignal) => { const owner = transport.scopeId?.() ?? "session-unavailable"; const dto = await send(transport, path, "GET", undefined, signal, 200); if ((transport.scopeId?.() ?? "session-unavailable") !== owner) throw new Error("La sesión cambió durante la lectura de Taxonomía."); await reconcileConfirmedTaxonomyResource(transport, path, dto, owner); return dto; };
  const valueOperationParents = new Map<string, { caracteristicaId: string; valorId: string }>();
  return {
    async list(signal) {
      const rows = await listAll(transport, "/api/v1/caracteristicas", "caracteristicaId", signal);
      const items: CharacteristicListItem[] = rows.map(item => { const d = characteristicDetail(item); return { id: d.id, nombre: d.nombre, tipo: d.tipo, estado: d.estado, ...(d.unidad ? { unidad: d.unidad } : {}), valoresActivos: d.valoresActivos }; });
      return { caracteristicas: items, config: { maxTexto: null, maxValoresLista: null } };
    },
    async obtener(id, signal) { try { return characteristicDetail(await get(`/api/v1/caracteristicas/${encodeURIComponent(id)}`, signal)); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async crear(input, signal) { return send(transport, "/api/v1/caracteristicas", "POST", { nombre: input.nombre, tipo: input.tipo, unidadMedida: input.unidad ?? null }, signal, 201, value => { const d = characteristicDetail(value); return { id: d.id, nombre: d.nombre, tipo: d.tipo, estado: d.estado, unidad: d.unidad }; }); },
    async actualizar(input, signal) { try { const current = await this.obtener(input.id, signal); if (!current) return null; if (current.version === undefined) throw invalid(); const resourcePath = `/api/v1/caracteristicas/${encodeURIComponent(input.id)}`; return send(transport, resourcePath, "PATCH", { nombre: input.nombre, unidadMedida: input.unidad ?? null, version: current.version }, signal, 200, characteristicDetail, false, { resourcePath, entity: "characteristic" }); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async listarValores(id, signal) { try { const values = await get(`/api/v1/caracteristicas/${encodeURIComponent(id)}/valores`, signal); if (!Array.isArray(values)) throw invalid(); return values.map(characteristicValue); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async renombrarValor(id, valorId, nombre, signal) { const values = await this.listarValores(id, signal); const current = values?.find(value => value.valorId === valorId); if (!current) throw httpError(404, "VALOR_NO_ENCONTRADO"); const resourcePath = `/api/v1/caracteristicas/${encodeURIComponent(id)}/valores`; return send(transport, `${resourcePath}/${encodeURIComponent(valorId)}`, "PATCH", { nombre, version: current.version }, signal, 200, characteristicValue, false, { resourcePath, entity: "characteristic_value" }); },
    async agregarValor(id, nombre, signal) { return send(transport, `/api/v1/caracteristicas/${encodeURIComponent(id)}/valores`, "POST", { nombre }, signal, 201, characteristicValue); },
    async solicitarBajaValor(id, valorId, signal) { const values = await this.listarValores(id, signal); const value = values?.find(item => item.valorId === valorId); if (!value) throw httpError(404, "VALOR_NO_ENCONTRADO"); const operacionId = await send(transport, `/api/v1/caracteristicas/${encodeURIComponent(id)}/valores/${encodeURIComponent(valorId)}/desactivar`, "POST", undefined, signal, 202, value => str(row(value).operation_id)); valueOperationParents.set(operacionId,{caracteristicaId:id,valorId}); return { resultado: "pendiente", valor: value, mensaje: "Baja recibida; consulta el seguimiento de operación.", bloqueos: [], operacionId }; },
    async cambiarEstado(id, next, signal) { try { return await send(transport, `/api/v1/caracteristicas/${encodeURIComponent(id)}/${next === "Activo" ? "reactivar" : "desactivar"}`, "POST", undefined, signal, 200, characteristicDetail); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async consultarEstadoOperacion(operacionId, signal) {
      const dto = row(await get(`/api/v1/taxonomia/operaciones/${encodeURIComponent(operacionId)}`, signal));
      const result = followup(dto);
      if (dto.entity_type === "CHARACTERISTIC_VALUE" && result.estado === "confirmada") {
        const parent = valueOperationParents.get(operacionId);
        if (parent) {
          const values = await this.listarValores(parent.caracteristicaId, signal);
          const value = values?.find(item => item.valorId === parent.valorId);
          if (value) return { ...result, valor: value };
        } else {
          // The operation DTO does not publish the parent characteristic ID.
          // After reload, recover the value's owner from the authoritative
          // paginated characteristic registry; never infer it from the value ID.
          const characteristics = await listAll(transport, "/api/v1/caracteristicas", "caracteristicaId", signal);
          for (const characteristic of characteristics) {
            const values = await this.listarValores(str(characteristic.caracteristicaId), signal);
            const value = values?.find(item => item.valorId === dto.entity_id);
            if (value) return { ...result, valor: value };
          }
        }
      }
      return result;
    },
  };
}

export function createHttpBrandRepository(transport: TaxonomyGatewayTransport): BrandRepository {
  const get = async (path: string, signal?: AbortSignal) => { const owner = transport.scopeId?.() ?? "session-unavailable"; const dto = await send(transport, path, "GET", undefined, signal, 200); if ((transport.scopeId?.() ?? "session-unavailable") !== owner) throw new Error("La sesión cambió durante la lectura de Taxonomía."); await reconcileConfirmedTaxonomyResource(transport, path, dto, owner); return dto; };
  const form = (input: { nombre: string; descripcion?: string | null; paisOrigenIso?: string | null; logoFile?: File | null; version?: number }) => {
    const body = new FormData(); body.set("nombre", input.nombre);
    // In multipart PATCH, absent means unchanged and an empty text part clears an optional text value.
    if (Object.hasOwn(input, "descripcion")) body.set("descripcion", input.descripcion ?? "");
    if (Object.hasOwn(input, "paisOrigenIso")) body.set("paisOrigenIso", input.paisOrigenIso ?? "");
    if (input.version !== undefined) body.set("version", String(input.version));
    if (input.logoFile) body.set("logo", input.logoFile);
    return body;
  };
  return {
    async list(signal) { const rows = await listAll(transport, "/api/v1/marcas/administracion", "marcaId", signal); const items: BrandDetail[] = rows.map(brandDetail); return { items: items.map(({ marcaId, nombre, estado, logoUrl, paisOrigenIso }) => ({ marcaId, nombre, estado, logoUrl, paisOrigenIso })) }; },
    async obtener(id, signal) { try { return brandDetail(await get(`/api/v1/marcas/${encodeURIComponent(id)}`, signal)); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async crear(input, signal) { return send(transport, "/api/v1/marcas", "POST", form(input), signal, 201, brandDetail); },
    async actualizar(input, signal) { try { const current = await this.obtener(input.marcaId, signal); if (!current) return null; const resourcePath = `/api/v1/marcas/${encodeURIComponent(input.marcaId)}`; const confirmed = await send(transport, resourcePath, "PATCH", form({ ...input, version: current.version }), signal, 200, value => { const dto = brandDetail(value); if (dto.marcaId !== input.marcaId) throw invalid(); return dto; }, false, { resourcePath, entity: "brand" }); try { await this.obtener(input.marcaId, signal); } catch { /* validated 2xx DTO is the confirmed write result */ } return confirmed; } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async solicitarBaja(id, signal) { const operacionId = await send(transport, `/api/v1/marcas/${encodeURIComponent(id)}/desactivar`, "POST", undefined, signal, 202, value => str(row(value).operation_id)); return { resultado: "pendiente", mensaje: "Baja recibida; consulta su operación.", operacionId }; },
    async reactivar(id, signal) { try { return await send(transport, `/api/v1/marcas/${encodeURIComponent(id)}/reactivar`, "POST", undefined, signal, 200, brandDetail); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async consultarResultadoBaja(operacionId, signal) { const dto = row(await get(`/api/v1/taxonomia/operaciones/${encodeURIComponent(operacionId)}`, signal)); const result = followup(dto); return { resultado: result.estado === "confirmada" ? "exito" : result.estado === "pendiente" ? "pendiente" : result.estado === "rechazada" ? "rechazada" : "no-concluyente", mensaje: result.mensaje, operacionId }; },
  };
}

export function createHttpSeoRepository(transport: TaxonomyGatewayTransport): SeoRepository {
  const get = (path: string, signal?: AbortSignal) => send(transport, path, "GET", undefined, signal, 200);
  const map = (value: unknown, nombre: string): SeoCategory => { const dto = row(value); return { id: str(dto.categoriaId), nombre, slug: str(dto.slug), ...(typeof dto.metaTitulo === "string" ? { metaTitulo: dto.metaTitulo } : {}), ...(typeof dto.metaDescripcion === "string" ? { metaDescripcion: dto.metaDescripcion } : {}) }; };
  return {
    async list(signal) {
      const categories = await listAll(transport, "/api/v1/categorias/administracion", "categoriaId", signal);
      const results: PromiseSettledResult<SeoCategory | null>[] = new Array(categories.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, categories.length) }, async () => {
        for (;;) {
          const index = next++;
          if (index >= categories.length) return;
          const category = categories[index];
          if (!category) continue;
          try { results[index] = { status: "fulfilled", value: map(await get(`/api/v1/categorias/${encodeURIComponent(str(category.categoriaId))}/seo`, signal), str(category.nombre)) }; }
          catch (reason) {
            if (signal?.aborted || httpStatus(reason) === 401 || httpStatus(reason) === 403) throw reason;
            results[index] = httpStatus(reason) === 404 ? { status: "fulfilled", value: null } : { status: "rejected", reason };
          }
        }
      }));
      const items = results.flatMap(result => result?.status === "fulfilled" && result.value ? [result.value] : []);
      return { items, enrichmentUnavailable: results.filter(result => result?.status === "rejected").length };
    },
    async obtener(id, signal) { try { const [seo,category]=await Promise.all([get(`/api/v1/categorias/${encodeURIComponent(id)}/seo`,signal),get(`/api/v1/categorias/${encodeURIComponent(id)}`,signal)]); return map(seo,str(row(category).nombre)); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async proponerSlug(nombre, signal) { const dto = row(await send(transport, "/api/v1/seo/categorias/slug/resolver", "POST", { nombre }, signal, 200, undefined, true)); return { slug: str(dto.slug), colisionResuelta: dto.colisionResuelta === true }; },
    async guardar(input, signal) { try { const category=await get(`/api/v1/categorias/${encodeURIComponent(input.id)}`,signal); return await send(transport, `/api/v1/categorias/${encodeURIComponent(input.id)}/seo`, "PATCH", { slug: input.slug, metaTitulo: input.metaTitulo, metaDescripcion: input.metaDescripcion }, signal, 200, value => map(value,str(row(category).nombre))); } catch (error) { if (httpStatus(error) === 404) return null; if (httpCode(error) === "SLUG_DUPLICADO") { const { SeoConflictError } = await import("../services/seoRepository"); throw new SeoConflictError(input.slug); } throw error; } },
    async historial(id, signal) { const values = await get(`/api/v1/categorias/${encodeURIComponent(id)}/seo/historial`, signal); if (!Array.isArray(values)) throw invalid(); return values.map(value => { const dto = row(value); return { slugAnterior: str(dto.oldSlug), slugActual: str(dto.newSlug), fecha: str(dto.changedAt) } satisfies HistorialSlugItem; }); },
  };
}

function httpStatus(error: unknown): number | undefined { return taxonomyHttpStatus(error); }
function httpCode(error: unknown): string | undefined { return taxonomyHttpCode(error); }
function httpError(status: number, code: string): Error { return new TaxonomyHttpError(status, code); }
function send<T = unknown>(transport: TaxonomyGatewayTransport, path: string, method: "GET" | "POST" | "PATCH", body: unknown, signal: AbortSignal | undefined, expected: number, map?: (value: unknown) => T, semanticQuery = false, options?: { retainConfirmed?: boolean; resourcePath?: string; entity?: string }): Promise<T> {
  return taxonomySend(transport, path, method, signal, body, expected, map, semanticQuery, options);
}
