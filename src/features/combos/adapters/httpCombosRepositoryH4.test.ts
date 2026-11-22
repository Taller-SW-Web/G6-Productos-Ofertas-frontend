import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpCombosRepository } from "./httpCombosRepository";
import type { AuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
import type { ComboPayload, CombosCatalogPort } from "../types/combos";
import { createMemoryStorage, fakeOwnerA, fakeOwnerB, jsonResponse } from "../../../../tests/fixtures/h4Controlled";

let owner = fakeOwnerA;
let storage: Storage;
beforeEach(() => { owner = fakeOwnerA; storage = createMemoryStorage(); vi.stubGlobal("sessionStorage", storage); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const payload: ComboPayload = { name: "Combo H4", description: "Prueba", components: [{ sku: "SKU-H4-001", quantity: 1 }, { sku: "SKU-H4-002", quantity: 2 }], priceMinor: 4990 };
const comboDto = (id: string, overrides: Record<string, unknown> = {}) => ({ combo_id: id, name: "Combo H4", description: "Prueba", status: "ACTIVO", price: 49.9, version: 1, components: [{ sku: "SKU-H4-001", quantity: 1 }, { sku: "SKU-H4-002", quantity: 2 }], ...overrides });
const catalog: CombosCatalogPort = { listProducts: async (_query: string, page: number, pageSize: number) => ({ items: [], total: 0, page, pageSize }), getProduct: async () => null, resolveSkus: async () => [] };
function setup(request: AuthenticatedGatewayClient["request"], catalogPort = catalog) {
  const client: AuthenticatedGatewayClient = { request: vi.fn(request) };
  return { repository: createHttpCombosRepository(client, catalogPort, () => owner), request: client.request as ReturnType<typeof vi.fn> };
}
const query = { status: "TODOS" as const, page: 1, pageSize: 20 };

describe("Combos HTTP reconciliation H4", () => {
  it("COM-H4-01: el DTO principal trae la disponibilidad informativa sin llamada auxiliar", async () => {
    const { repository, request } = setup(async () => jsonResponse(200, { items: [comboDto("combo-h4", { informative_availability: 3, calculated_at: "2026-11-07T12:00:00Z", freshness: "ACTUALIZADA" })], meta: { pagina: 1, tamanio: 20, total: 1 } }));
    const result = await repository.list(query);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("combo-h4");
    expect(result.items[0]?.availability).toMatchObject({ verifiable: true, quantity: 3, state: "DISPONIBLE" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("COM-H4-02: conserva null como no verificable y solo clasifica cero fresco como agotado", async () => {
    const items = [
      comboDto("combo-null", { informative_availability: null, freshness: "ACTUALIZADA", calculated_at: "2026-11-07T12:00:00Z" }),
      comboDto("combo-zero", { informative_availability: 0, freshness: "ACTUALIZADA", calculated_at: "2026-11-07T12:00:00Z" }),
      comboDto("combo-stale-zero", { informative_availability: 0, freshness: "DESACTUALIZADA", calculated_at: "2026-11-07T12:00:00Z" }),
    ];
    const { repository, request } = setup(async () => jsonResponse(200, { items, meta: { pagina: 1, tamanio: 20, total: 3 } }));
    const result = await repository.list(query);
    expect(result.items.map(item => item.availability.state)).toEqual(["NO_VERIFICABLE", "NO_DISPONIBLE", "DESACTUALIZADA"]);
    expect(result.items[0]?.availability.quantity).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.some(([path]) => path.includes("/disponibilidad"))).toBe(false);
  });

  it.each([
    [{ comboId: "combo-h4", verificable: true, cantidadInformativa: 2, calculated_at: "2026-11-20T12:00:00Z", estadoActualizacion: "ACTUALIZADA" }, "DISPONIBLE"],
    [{ comboId: "combo-h4", verificable: true, cantidadInformativa: 0, calculated_at: "2026-11-20T12:00:00Z", estadoActualizacion: "ACTUALIZADA" }, "NO_DISPONIBLE"],
    [{ comboId: "combo-h4", verificable: false, cantidadInformativa: null, calculated_at: "2026-11-20T12:00:00Z", estadoActualizacion: "INCOMPLETA" }, "INDETERMINADO"],
  ] as const)("lee disponibilidad por el GET contractual y distingue el DTO (%j)", async (dto, state) => {
    const { repository, request } = setup(async (path, init) => {
      expect(path).toBe("/api/v1/combos/combo-h4/disponibilidad");
      expect(init.method).toBe("GET");
      return jsonResponse(200, dto);
    });
    await expect(repository.readAvailability("combo-h4", "ACTIVO")).resolves.toMatchObject({ state });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("falla cerrado cuando el DTO de disponibilidad no corresponde al combo", async () => {
    const { repository } = setup(async () => jsonResponse(200, {
      comboId: "otro-combo", verificable: true, cantidadInformativa: 4,
      calculated_at: "2026-11-20T12:00:00Z", estadoActualizacion: "ACTUALIZADA",
    }));
    await expect(repository.readAvailability("combo-h4", "ACTIVO")).rejects.toThrow(/otra identidad/);
  });

  it.each(["comboId", "verificable", "calculated_at", "estadoActualizacion"])("rechaza DTO sin el campo obligatorio %s", async field => {
    const dto: Record<string, unknown> = { comboId: "combo-h4", verificable: false, cantidadInformativa: null, calculated_at: "2026-11-20T12:00:00Z", estadoActualizacion: "INCOMPLETA" };
    delete dto[field];
    const { repository } = setup(async () => jsonResponse(200, dto));
    await expect(repository.readAvailability("combo-h4", "ACTIVO")).rejects.toThrow();
  });

  it("resuelve una vez todos los SKU de la página y muestra los nombres compartidos", async () => {
    const resolver = vi.fn(async (skus: string[]) => skus.map(sku => ({ sku, productId: `p-${sku}`, productName: `Producto ${sku}`, isCombo: false, productActive: true, variantActive: true, sellable: true, isVariantParentSku: false })));
    const items = [comboDto("combo-a"), comboDto("combo-b", { components: [{ sku: "SKU-H4-002", quantity: 1 }, { sku: "SKU-H4-003", quantity: 2 }] })];
    const { repository, request } = setup(async () => jsonResponse(200, { items, meta: { pagina: 1, tamanio: 20, total: 2 } }), { ...catalog, resolveSkus: resolver });
    const page = await repository.list(query);
    expect(request).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(["SKU-H4-001", "SKU-H4-002", "SKU-H4-002", "SKU-H4-003"], undefined);
    expect(page.items.map(combo => combo.components.map(component => component.productName))).toEqual([["Producto SKU-H4-001", "Producto SKU-H4-002"], ["Producto SKU-H4-002", "Producto SKU-H4-003"]]);
  });

  it("muestra nombres no verificados y conserva SKU cuando Catalog falla", async () => {
    const resolver = vi.fn(async () => { throw new Error("Catalog offline"); });
    const { repository } = setup(async () => jsonResponse(200, { items: [comboDto("combo-a")], meta: { pagina: 1, tamanio: 20, total: 1 } }), { ...catalog, resolveSkus: resolver });
    const page = await repository.list(query);
    expect(page.items[0]?.components).toMatchObject([{ sku: "SKU-H4-001", productName: "Nombre no verificado" }, { sku: "SKU-H4-002", productName: "Nombre no verificado" }]);
  });

  it("el detalle ejecuta una sola resolución batch", async () => {
    const resolver = vi.fn(async (skus: string[]) => skus.map(sku => ({ sku, productId: sku, productName: `Producto ${sku}`, isCombo: false, productActive: true, variantActive: true, sellable: true, isVariantParentSku: false })));
    const { repository } = setup(async () => jsonResponse(200, comboDto("combo-a")), { ...catalog, resolveSkus: resolver });
    await expect(repository.getById("combo-a")).resolves.toMatchObject({ components: [{ productName: "Producto SKU-H4-001" }, { productName: "Producto SKU-H4-002" }] });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(["SKU-H4-001", "SKU-H4-002"], undefined);
  });

  it.each([401, 403, 409, 422, 503])("propaga el estado contractual HTTP %i", async (status) => {
    const { repository, request } = setup(async () => jsonResponse(status, { code: `ERROR_${status}` }));
    await expect(repository.list(query)).rejects.toThrow(`HTTP ${status} (ERROR_${status})`);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("representa 404 de detalle como recurso ausente y no recurre a datos simulados", async () => {
    const { repository, request } = setup(async () => jsonResponse(404, { code: "COMBO_NO_ENCONTRADO" }));
    await expect(repository.getById("combo-ausente")).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe("/api/v1/combos/combo-ausente");
  });

  it("rechaza un DTO de lista malformado como error de contrato, no como lista vacía", async () => {
    const { repository } = setup(async () => jsonResponse(200, {
      items: [comboDto("combo-h4", { components: [{ sku: "SKU-H4-001", quantity: 0 }] })],
      meta: { pagina: 1, tamanio: 20, total: 1 },
    }));
    await expect(repository.list(query)).rejects.toThrow(/inválida|incompletos/);
  });

  it("mantiene la creación incierta y bloquea otro payload antes de emitir otro POST", async () => {
    const posts: string[] = [];
    const first = setup(async (_path, init) => {
      if (init.method === "POST") posts.push(String(init.body));
      throw new Error("timeout");
    });
    await expect(first.repository.create(payload)).rejects.toThrow(/No se confirmó el alta/);
    const second = setup(async (_path, init) => {
      if (init.method === "POST") posts.push(String(init.body));
      return jsonResponse(201, comboDto("combo-h4"));
    });
    await expect(second.repository.create({ ...payload, name: "Otra intención" })).rejects.toThrow(/creación anterior/);
    expect(posts).toHaveLength(1);
    expect(second.request).not.toHaveBeenCalled();
  });

  it("bloquea un segundo submit concurrente de la misma intención", async () => {
    let release!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { release = resolve; });
    const { repository, request } = setup(async () => response);
    const first = repository.create(payload);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await expect(repository.create(payload)).rejects.toThrow(/ya está en curso/);
    release(jsonResponse(201, comboDto("combo-h4")));
    await expect(first).resolves.toMatchObject({ id: "combo-h4" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([202, 401, 403, 409, 422, 503])("no interpreta HTTP %i como creación terminada", async (status) => {
    const { repository, request } = setup(async () => jsonResponse(status, { code: "ERROR_PRUEBA" }));
    await expect(repository.create(payload)).rejects.toThrow(`HTTP ${status}`);
    expect(request).toHaveBeenCalledTimes(1);
    if (status === 202 || status === 503) {
      expect(Object.keys(storage).some(key => key.startsWith("g6:combos:uncertain:v2:"))).toBe(true);
    }
  });

  it("COM-H4-03: recupera el mismo combo después de perder el 201 con la clave y cuerpo originales", async () => {
    const receipts = new Map<string, string>();
    const posts: { key: string; body: string }[] = [];
    const request: AuthenticatedGatewayClient["request"] = async (path, init) => {
      if (init.method !== "POST") return jsonResponse(200, comboDto("combo-h4"));
      expect(path).toBe("/api/v1/combos/administracion");
      const key = init.headers?.["Idempotency-Key"] ?? "";
      const body = String(init.body ?? "");
      expect(key).toMatch(/^[0-9a-f-]{36}$/);
      posts.push({ key, body });
      if (receipts.has(key)) return receipts.get(key) === body
        ? jsonResponse(201, comboDto("combo-h4"))
        : jsonResponse(409, { code: "IDEMPOTENCY_CONFLICT" });
      receipts.set(key, body);
      throw new Error("respuesta perdida tras confirmar el recibo");
    };
    await expect(setup(request).repository.create(payload)).rejects.toThrow(/No se confirmó el alta/);
    expect(Object.keys(storage).filter(key => key.startsWith("g6:combos:uncertain:v2:"))).toHaveLength(1);
    await expect(setup(request).repository.create(payload)).resolves.toMatchObject({ id: "combo-h4" });
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
    expect(receipts.size).toBe(1);
    expect(Object.keys(storage).filter(key => key.startsWith("g6:combos:uncertain:v2:"))).toHaveLength(0);
  });

  it("expone la intención tras recarga y la recupera con cuerpo y clave originales", async () => {
    const sent: { key?: string; body?: string }[] = [];
    const first = setup(async (_path, init) => { sent.push({ key: init.headers?.["Idempotency-Key"], body: String(init.body) }); throw new Error("timeout"); });
    await expect(first.repository.create(payload)).rejects.toThrow(/No se confirmó/);
    const second = setup(async (_path, init) => {
      sent.push({ key: init.headers?.["Idempotency-Key"], body: String(init.body) });
      return jsonResponse(201, comboDto("combo-recovered"));
    });
    await expect(second.repository.getPendingCreate()).resolves.toMatchObject({ name: "Combo H4", componentSkus: ["SKU-H4-001", "SKU-H4-002"] });
    await expect(second.repository.recoverPendingCreate()).resolves.toMatchObject({ id: "combo-recovered" });
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[1]?.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([202, 503])("conserva y permite conciliar la intención tras HTTP %i", async status => {
    const initial = setup(async () => jsonResponse(status, { code: "PENDIENTE" }));
    await expect(initial.repository.create(payload)).rejects.toThrow();
    const calls: { key?: string; body?: string }[] = [];
    const recovery = setup(async (_path, init) => { calls.push({ key: init.headers?.["Idempotency-Key"], body: String(init.body) }); return jsonResponse(503, { code: "UPSTREAM" }); });
    await expect(recovery.repository.recoverPendingCreate()).rejects.toThrow();
    await expect(recovery.repository.getPendingCreate()).resolves.not.toBeNull();
    expect(calls).toHaveLength(1);
    expect(Object.keys(storage).some(key => key.startsWith("g6:combos:uncertain:v2:"))).toBe(true);
  });

  it("bloquea lectura y recuperación de una intención de otra identidad", async () => {
    const first = setup(async () => { throw new Error("timeout"); });
    await expect(first.repository.create(payload)).rejects.toThrow();
    owner = fakeOwnerB;
    const second = setup(vi.fn(async () => jsonResponse(201, comboDto("no-post"))));
    await expect(second.repository.getPendingCreate()).rejects.toThrow(/otra identidad/);
    await expect(second.repository.recoverPendingCreate()).rejects.toThrow(/otra identidad/);
    expect(second.request).not.toHaveBeenCalled();
  });

  it("un registro local corrupto bloquea explícitamente la lectura y cualquier nuevo POST", async () => {
    storage.setItem("g6:combos:uncertain:v2:corrupt", "{");
    const { repository, request } = setup(vi.fn(async () => jsonResponse(201, comboDto("must-not-create"))));
    await expect(repository.getPendingCreate()).rejects.toThrow(/corrupto/);
    await expect(repository.create(payload)).rejects.toThrow(/corrupto/);
    expect(request).not.toHaveBeenCalled();
  });

  it("si el ID ya está confirmado recupera por GET sin emitir un segundo POST", async () => {
    const first = setup(async (_path, init) => {
      if (init.method === "POST") { const malformed = comboDto("combo-confirmado"); delete (malformed as Record<string, unknown>).name; return jsonResponse(201, malformed); }
      throw new Error("Catalog offline");
    });
    await expect(first.repository.create(payload)).rejects.toThrow(/confirmada/);
    const paths: string[] = [];
    const second = setup(async (path, init) => { paths.push(`${init.method} ${path}`); return jsonResponse(200, comboDto("combo-confirmado")); });
    await expect(second.repository.recoverPendingCreate()).resolves.toMatchObject({ id: "combo-confirmado" });
    expect(paths).toEqual(["GET /api/v1/combos/combo-confirmado"]);
  });

  it("COM-H4-07: un 409 de idempotencia conserva la intención y no cambia el cuerpo ni la clave", async () => {
    const calls: { key?: string; body?: string }[] = [];
    const conflict = setup(async (_path, init) => {
      calls.push({ key: init.headers?.["Idempotency-Key"], body: String(init.body ?? "") });
      return jsonResponse(409, { code: "IDEMPOTENCY_CONFLICT" });
    });
    await expect(conflict.repository.create(payload)).rejects.toThrow("HTTP 409 (IDEMPOTENCY_CONFLICT)");
    await expect(conflict.repository.create(payload)).rejects.toThrow("HTTP 409 (IDEMPOTENCY_CONFLICT)");
    expect(calls[1]).toEqual(calls[0]);
    const key = Object.keys(storage).find(item => item.startsWith("g6:combos:uncertain:v2:"))!;
    const stored = JSON.parse(storage.getItem(key)!);
    storage.setItem(key, JSON.stringify({ ...stored, body: "{}" }));
    await expect(conflict.repository.create(payload)).rejects.toThrow(/corrupto|No se envió/);
    expect(calls).toHaveLength(2);
  });

  it("COM-H4-04: PATCH confirmado sigue confirmado aunque GET de disponibilidad falle", async () => {
    const request = vi.fn(async (_path: string, init: { method: string }) => init.method === "PATCH" ? jsonResponse(200, comboDto("combo-h4", { name: "Combo editado", version: 2 })) : jsonResponse(200, comboDto("combo-h4")));
    const { repository } = setup(request);
    const result = await repository.update("combo-h4", { ...payload, version: 1 });
    expect(result).toMatchObject({ id: "combo-h4", name: "Combo editado", version: 2, availability: { verifiable: false } });
    expect(request.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1);
    expect(Object.keys(storage).filter(key => key.startsWith("g6:combos:uncertain:v2:"))).toHaveLength(0);
  });

  it("COM-H4-05: un repositorio nuevo con la misma identidad rehidrata el bloqueo", async () => {
    const first = setup(async (_path, init) => init.method === "PATCH" ? Promise.reject(new Error("timeout")) : jsonResponse(200, comboDto("combo-h4")));
    await expect(first.repository.update("combo-h4", payload)).rejects.toThrow();
    const second = setup(vi.fn(async () => jsonResponse(200, comboDto("combo-h4"))));
    await expect(second.repository.update("combo-h4", payload)).rejects.toThrow(/conciliación/);
    expect(first.request).toHaveBeenCalledTimes(1);
    expect(second.request).not.toHaveBeenCalled();
    expect(Object.keys(storage).some(key => key.startsWith("g6:combos:uncertain:v2:"))).toBe(true);
  });

  it("COM-H4-06: A no bloquea la escritura independiente de B ni elimina su marker", async () => {
    const requestA = vi.fn(async (_path: string, init: { method: string }) => init.method === "PATCH" ? Promise.reject(new Error("timeout")) : jsonResponse(200, comboDto("combo-h4")));
    const a = setup(requestA);
    await expect(a.repository.update("combo-h4", payload)).rejects.toThrow();
    const markerA = Object.keys(storage).find(key => key.startsWith("g6:combos:uncertain:v2:"));
    expect(markerA).toBeDefined();
    owner = fakeOwnerB;
    const b = setup(async () => jsonResponse(200, comboDto("combo-b", { name: "Combo B", version: 2 })));
    await expect(b.repository.update("combo-b", { ...payload, name: "Combo B" })).resolves.toMatchObject({ id: "combo-b" });
    expect(storage.getItem(markerA!)).not.toBeNull();
    expect(requestA.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1);
  });
});
