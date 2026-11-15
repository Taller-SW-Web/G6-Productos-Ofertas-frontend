import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpCombosRepository } from "./httpCombosRepository";
import type { AuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
import type { ComboPayload } from "../types/combos";
import { createMemoryStorage, fakeOwnerA, fakeOwnerB, jsonResponse } from "../../../../tests/fixtures/h4Controlled";

let owner = fakeOwnerA;
let storage: Storage;
beforeEach(() => { owner = fakeOwnerA; storage = createMemoryStorage(); vi.stubGlobal("sessionStorage", storage); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const payload: ComboPayload = { name: "Combo H4", description: "Prueba", components: [{ sku: "SKU-H4-001", quantity: 1 }, { sku: "SKU-H4-002", quantity: 2 }], priceMinor: 4990 };
const comboDto = (id: string, overrides: Record<string, unknown> = {}) => ({ combo_id: id, name: "Combo H4", description: "Prueba", status: "ACTIVO", price: 49.9, version: 1, components: [{ sku: "SKU-H4-001", quantity: 1 }, { sku: "SKU-H4-002", quantity: 2 }], ...overrides });
const catalog = { listProducts: async (_query: string, page: number, pageSize: number) => ({ items: [], total: 0, page, pageSize }), getProduct: async () => null, resolveSkus: async () => [] };
function setup(request: AuthenticatedGatewayClient["request"]) {
  const client: AuthenticatedGatewayClient = { request: vi.fn(request) };
  return { repository: createHttpCombosRepository(client, catalog, () => owner), request: client.request as ReturnType<typeof vi.fn> };
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
    expect(result.items.map(item => item.availability.state)).toEqual(["NO_VERIFICABLE", "AGOTADO", "DESACTUALIZADA"]);
    expect(result.items[0]?.availability.quantity).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.some(([path]) => path.includes("/disponibilidad"))).toBe(false);
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
    await expect(conflict.repository.create(payload)).rejects.toThrow(/No se envió/);
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
