import type { TaxonomyGatewayTransport } from "./httpProductTypeAdapter";
import type { CategoryRepository, CategoryListResult } from "../services/categoryRepository";
import type { CharacteristicRepository } from "../services/characteristicRepository";
import type { BrandRepository } from "../services/brandRepository";
import type { SeoRepository } from "../services/seoRepository";
import type { CategoryNode, CategoryDetail, CategoryCreateInput, CategoryCreateResult, CategoryUpdateInput, SlugCheckResult, BajaSolicitudResult, ReactivacionResult, CharacteristicListItem, CharacteristicDetail, CharacteristicValue, BrandDetail, SeoCategory, HistorialSlugItem, OperationFollowUpResult } from "../types";

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
  const get = async (path: string, signal?: AbortSignal) => send(transport, path, "GET", undefined, signal, 200);
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
    if ((typeof dto.categoriaPadreId === "string" ? dto.categoriaPadreId : undefined) !== parentId) throw invalid();
    return { ...categoryDetail(dto), nivel: match.level, hijas: children, ...(match.parent ? { padreNombre: str(match.parent.nombre) } : {}) };
  };
  return {
    async list(signal): Promise<CategoryListResult> {
      const value = await get("/api/v1/categorias/arbol", signal); if (!Array.isArray(value)) throw invalid(); return { nodos: value.map(item => treeNode(item)) };
    },
    async obtener(id, signal) { try { return await getCategoryDetail(id, signal); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async comprobarSlug(slug, signal): Promise<SlugCheckResult> {
      const dto = row(await send(transport, "/api/v1/seo/categorias/slug/resolver", "POST", { nombre: slug }, signal, 200));
      const resolved = str(dto.slug); const colisionResuelta = dto.colisionResuelta === true;
      if (typeof dto.colisionResuelta !== "boolean") throw invalid();
      return { slug: resolved, disponible: true, ...(colisionResuelta && resolved !== slug ? { alternativo: resolved } : {}) };
    },
    async crear(input: CategoryCreateInput, signal): Promise<CategoryCreateResult> {
      const dto = row(await send(transport, "/api/v1/categorias", "POST", { nombre: input.nombre, slugConfirmado: input.slug, categoriaPadreId: input.padreId ?? null, descripcion: input.descripcion ?? null }, signal, 201));
      return { id: str(dto.categoriaId), nombre: str(dto.nombre), slug: typeof dto.slug === "string" ? dto.slug : input.slug };
    },
    async actualizar(input: CategoryUpdateInput, signal) {
      const current = await this.obtener(input.id, signal); if (!current) throw httpError(404, "CATEGORIA_NO_ENCONTRADA");
      await send(transport, `/api/v1/categorias/${encodeURIComponent(input.id)}`, "PATCH", { nombre: input.nombre, categoriaPadreId: input.padreId ?? null, descripcion: input.descripcion ?? null, orden: input.orden, version: current.version }, signal, 200);
      const detail = await getCategoryDetail(input.id, signal); return detail;
    },
    async solicitarBaja(id, signal): Promise<BajaSolicitudResult> {
      const before = await this.obtener(id, signal); if (!before) throw httpError(404, "CATEGORIA_NO_ENCONTRADA");
      const operation = row(await send(transport, `/api/v1/categorias/${encodeURIComponent(id)}/desactivar`, "POST", undefined, signal, 202));
      return { resultado: "verificando", categoria: { ...before, estado: "Verificando baja" }, bloqueos: [], mensaje: "Solicitud recibida; consulta el estado de la operación.", operacionId: str(operation.operation_id) };
    },
    async reactivar(id, signal): Promise<ReactivacionResult> {
      await send(transport, `/api/v1/categorias/${encodeURIComponent(id)}/reactivar`, "POST", undefined, signal, 200);
      const result = await getCategoryDetail(id, signal);
      return { resultado: "reactivada", categoria: result, bloqueos: [], mensaje: "Categoría reactivada." };
    },
    async consultarEstadoOperacion(operacionId, signal) {
      const dto = row(await get(`/api/v1/taxonomia/operaciones/${encodeURIComponent(operacionId)}`, signal));
      const result = followup(dto);
      return { ...result, ...(dto.entity_type === "CATEGORY" && result.estado === "confirmada" ? { categoria: await getCategoryDetail(str(dto.entity_id), signal) } : {}) };
    },
  };
}

export function createHttpCharacteristicRepository(transport: TaxonomyGatewayTransport): CharacteristicRepository {
  const get = (path: string, signal?: AbortSignal) => send(transport, path, "GET", undefined, signal, 200);
  const valueOperationParents = new Map<string, { caracteristicaId: string; valorId: string }>();
  return {
    async list(signal) {
      const rows = await listAll(transport, "/api/v1/caracteristicas", "caracteristicaId", signal);
      const items: CharacteristicListItem[] = rows.map(item => { const d = characteristicDetail(item); return { id: d.id, nombre: d.nombre, tipo: d.tipo, estado: d.estado, ...(d.unidad ? { unidad: d.unidad } : {}), valoresActivos: d.valoresActivos }; });
      return { caracteristicas: items, config: { maxTexto: null, maxValoresLista: null } };
    },
    async obtener(id, signal) { try { return characteristicDetail(await get(`/api/v1/caracteristicas/${encodeURIComponent(id)}`, signal)); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async crear(input, signal) { const d = characteristicDetail(await send(transport, "/api/v1/caracteristicas", "POST", { nombre: input.nombre, tipo: input.tipo, unidadMedida: input.unidad ?? null }, signal, 201)); return { id: d.id, nombre: d.nombre, tipo: d.tipo, estado: d.estado, unidad: d.unidad }; },
    async actualizar(input, signal) { try { const current = await this.obtener(input.id, signal); if (!current) return null; if (current.version === undefined) throw invalid(); return characteristicDetail(await send(transport, `/api/v1/caracteristicas/${encodeURIComponent(input.id)}`, "PATCH", { nombre: input.nombre, unidadMedida: input.unidad ?? null, version: current.version }, signal, 200)); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async listarValores(id, signal) { try { const values = await get(`/api/v1/caracteristicas/${encodeURIComponent(id)}/valores`, signal); if (!Array.isArray(values)) throw invalid(); return values.map(characteristicValue); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async renombrarValor(id, valorId, nombre, signal) { const values = await this.listarValores(id, signal); const current = values?.find(value => value.valorId === valorId); if (!current) throw httpError(404, "VALOR_NO_ENCONTRADO"); return characteristicValue(await send(transport, `/api/v1/caracteristicas/${encodeURIComponent(id)}/valores/${encodeURIComponent(valorId)}`, "PATCH", { nombre, version: current.version }, signal, 200)); },
    async agregarValor(id, nombre, signal) { return characteristicValue(await send(transport, `/api/v1/caracteristicas/${encodeURIComponent(id)}/valores`, "POST", { nombre }, signal, 201)); },
    async solicitarBajaValor(id, valorId, signal) { const values = await this.listarValores(id, signal); const value = values?.find(item => item.valorId === valorId); if (!value) throw httpError(404, "VALOR_NO_ENCONTRADO"); const operation = row(await send(transport, `/api/v1/caracteristicas/${encodeURIComponent(id)}/valores/${encodeURIComponent(valorId)}/desactivar`, "POST", undefined, signal, 202)); const operacionId = str(operation.operation_id); valueOperationParents.set(operacionId,{caracteristicaId:id,valorId}); return { resultado: "pendiente", valor: value, mensaje: "Baja recibida; consulta el seguimiento de operación.", bloqueos: [], operacionId }; },
    async cambiarEstado(id, next, signal) { try { return characteristicDetail(await send(transport, `/api/v1/caracteristicas/${encodeURIComponent(id)}/${next === "Activo" ? "reactivar" : "desactivar"}`, "POST", undefined, signal, 200)); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
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
  const get = (path: string, signal?: AbortSignal) => send(transport, path, "GET", undefined, signal, 200);
  const form = (input: { nombre: string; descripcion?: string | null; paisOrigenIso?: string | null; logoFile?: File | null; version?: number }) => { const body = new FormData(); body.set("nombre", input.nombre); if (input.descripcion != null) body.set("descripcion", input.descripcion); if (input.paisOrigenIso != null) body.set("paisOrigenIso", input.paisOrigenIso); if (input.version !== undefined) body.set("version", String(input.version)); if (input.logoFile) body.set("logo", input.logoFile); return body; };
  return {
    async list(signal) { const rows = await listAll(transport, "/api/v1/marcas/administracion", "marcaId", signal); const items: BrandDetail[] = rows.map(brandDetail); return { items: items.map(({ marcaId, nombre, estado, logoUrl, paisOrigenIso }) => ({ marcaId, nombre, estado, logoUrl, paisOrigenIso })) }; },
    async obtener(id, signal) { try { return brandDetail(await get(`/api/v1/marcas/${encodeURIComponent(id)}`, signal)); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async crear(input, signal) { return brandDetail(await send(transport, "/api/v1/marcas", "POST", form(input), signal, 201)); },
    async actualizar(input, signal) { try { const current = await this.obtener(input.marcaId, signal); if (!current) return null; return brandDetail(await send(transport, `/api/v1/marcas/${encodeURIComponent(input.marcaId)}`, "PATCH", form({ ...input, version: current.version }), signal, 200)); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async solicitarBaja(id, signal) { const operation = row(await send(transport, `/api/v1/marcas/${encodeURIComponent(id)}/desactivar`, "POST", undefined, signal, 202)); return { resultado: "pendiente", mensaje: "Baja recibida; consulta su operación.", operacionId: str(operation.operation_id) }; },
    async reactivar(id, signal) { try { return brandDetail(await send(transport, `/api/v1/marcas/${encodeURIComponent(id)}/reactivar`, "POST", undefined, signal, 200)); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async consultarResultadoBaja(operacionId, signal) { const dto = row(await get(`/api/v1/taxonomia/operaciones/${encodeURIComponent(operacionId)}`, signal)); const result = followup(dto); return { resultado: result.estado === "confirmada" ? "exito" : result.estado === "pendiente" ? "pendiente" : result.estado === "rechazada" ? "rechazada" : "no-concluyente", mensaje: result.mensaje, operacionId }; },
  };
}

export function createHttpSeoRepository(transport: TaxonomyGatewayTransport): SeoRepository {
  const get = (path: string, signal?: AbortSignal) => send(transport, path, "GET", undefined, signal, 200);
  const map = (value: unknown, nombre: string): SeoCategory => { const dto = row(value); return { id: str(dto.categoriaId), nombre, slug: str(dto.slug), ...(typeof dto.metaTitulo === "string" ? { metaTitulo: dto.metaTitulo } : {}), ...(typeof dto.metaDescripcion === "string" ? { metaDescripcion: dto.metaDescripcion } : {}) }; };
  return {
    async list(signal) { const categories=await listAll(transport,"/api/v1/categorias/administracion","categoriaId",signal); const items:SeoCategory[]=[]; for(const category of categories){ try { items.push(map(await get(`/api/v1/categorias/${encodeURIComponent(str(category.categoriaId))}/seo`,signal),str(category.nombre))); } catch(error){ if(httpStatus(error)!==404) throw error; } } return {items}; },
    async obtener(id, signal) { try { const [seo,category]=await Promise.all([get(`/api/v1/categorias/${encodeURIComponent(id)}/seo`,signal),get(`/api/v1/categorias/${encodeURIComponent(id)}`,signal)]); return map(seo,str(row(category).nombre)); } catch (error) { if (httpStatus(error) === 404) return null; throw error; } },
    async proponerSlug(nombre, signal) { const dto = row(await send(transport, "/api/v1/seo/categorias/slug/resolver", "POST", { nombre }, signal, 200)); return { slug: str(dto.slug), colisionResuelta: dto.colisionResuelta === true }; },
    async guardar(input, signal) { try { const category=await get(`/api/v1/categorias/${encodeURIComponent(input.id)}`,signal); const dto=await send(transport, `/api/v1/categorias/${encodeURIComponent(input.id)}/seo`, "PATCH", { slug: input.slug, metaTitulo: input.metaTitulo, metaDescripcion: input.metaDescripcion }, signal, 200); return map(dto,str(row(category).nombre)); } catch (error) { if (httpStatus(error) === 404) return null; if (httpCode(error) === "SLUG_DUPLICADO") { const { SeoConflictError } = await import("../services/seoRepository"); throw new SeoConflictError(input.slug); } throw error; } },
    async historial(id, signal) { const values = await get(`/api/v1/categorias/${encodeURIComponent(id)}/seo/historial`, signal); if (!Array.isArray(values)) throw invalid(); return values.map(value => { const dto = row(value); return { slugAnterior: str(dto.oldSlug), slugActual: str(dto.newSlug), fecha: str(dto.changedAt) } satisfies HistorialSlugItem; }); },
  };
}

class TaxonomyHttpError extends Error { constructor(readonly status: number, readonly code?: string, message?: string) { super(message ?? `Taxonomía respondió HTTP ${status}${code ? ` (${code})` : ""}.`); } }
function httpStatus(error: unknown): number | undefined { return error instanceof TaxonomyHttpError ? error.status : undefined; }
function httpCode(error: unknown): string | undefined { return error instanceof TaxonomyHttpError ? error.code : undefined; }
function httpError(status: number, code: string): Error { return new TaxonomyHttpError(status, code); }
async function send(transport: TaxonomyGatewayTransport, path: string, method: "GET" | "POST" | "PATCH", body: unknown, signal: AbortSignal | undefined, expected: number): Promise<unknown> {
  signal?.throwIfAborted();
  if (!transport.requestWithInit) throw new Error("El cliente autenticado de Taxonomía no admite esta operación.");
  const init = body instanceof FormData ? { method, signal, body } : body === undefined ? { method, signal } : { method, signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  let response: Response;
  try { response = await transport.requestWithInit(path, init); } catch (error) { if (signal?.aborted) throw error; if (method !== "GET") throw new Error("Resultado de escritura de Taxonomía incierto. Consulta el recurso antes de reintentar.", { cause: error }); throw error; }
  if (!response.ok) { let code: string | undefined; try { const data = row(await response.clone().json()); if (typeof data.code === "string") code = data.code; } catch { /* retain HTTP status */ } if (method !== "GET" && (response.status === 408 || response.status >= 500)) throw new Error(`Resultado de escritura incierto (HTTP ${response.status}); consulta Taxonomía antes de reintentar.`); throw new TaxonomyHttpError(response.status, code); }
  if (response.status !== expected) { if (method !== "GET") throw new Error(`Taxonomía respondió HTTP ${response.status}; confirma el estado antes de reintentar.`); throw new TaxonomyHttpError(response.status); }
  if (response.status === 204) return null;
  const type = response.headers.get("content-type")?.toLowerCase() ?? ""; if (!type.includes("application/json")) throw new Error("Taxonomía devolvió un MIME incompatible.");
  try { return await response.json(); } catch (error) { if (method !== "GET") throw new Error("La escritura pudo completarse, pero su respuesta es ilegible; no la repitas sin reconciliar.", { cause: error }); throw invalid(); }
}
