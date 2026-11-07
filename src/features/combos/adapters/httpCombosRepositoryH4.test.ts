import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpCombosRepository } from "./httpCombosRepository";
import type { AuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
import type { ComboPayload } from "../types/combos";
import { createMemoryStorage, deferred, fakeOwnerA, fakeOwnerB, jsonResponse } from "../../../../tests/fixtures/h4Controlled";

let owner = fakeOwnerA;
let storage: Storage;
beforeEach(() => { owner = fakeOwnerA; storage = createMemoryStorage(); vi.stubGlobal("sessionStorage", storage); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const payload: ComboPayload = { name: "Combo H4", description: "Prueba", components: [{ sku: "SKU-H4-001", quantity: 1 }, { sku: "SKU-H4-002", quantity: 2 }], priceMinor: 4990 };
const comboDto = (id: string, overrides: Record<string, unknown> = {}) => ({ combo_id: id, name: "Combo H4", description: "Prueba", status: "ACTIVO", price: 49.9, version: 1, components: [{ sku: "SKU-H4-001", quantity: 1 }, { sku: "SKU-H4-002", quantity: 2 }], ...overrides });
const available = (id: string) => ({ comboId: id, verificable: true, cantidadInformativa: 3, calculated_at: "2026-11-07T12:00:00Z", estadoActualizacion: "ACTUALIZADA" });
const catalog = { listProducts: async () => [], getProduct: async () => null, resolveSkus: async () => [] };
function setup(request: AuthenticatedGatewayClient["request"]) {
  const client: AuthenticatedGatewayClient = { request: vi.fn(request) };
  return { repository: createHttpCombosRepository(client, catalog, () => owner), request: client.request as ReturnType<typeof vi.fn> };
}
const query = { status: "TODOS" as const, page: 1, pageSize: 20 };

describe("Combos HTTP reconciliation H4", () => {
  it("COM-H4-01: 503 auxiliar conserva el Combo y disponibilidad no verificable", async () => {
    const { repository, request } = setup(async path => path === "/api/v1/combos?pagina=1&tamanio=20"
      ? jsonResponse(200, { items: [comboDto("combo-h4")], meta: { pagina: 1, tamanio: 20, total: 1 } })
      : jsonResponse(503, { status: 503, code: "SERVICIO_NO_DISPONIBLE" }));
    const result = await repository.list(query);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("combo-h4");
    expect(result.items[0]?.availability).toMatchObject({ verifiable: false, quantity: null, state: "NO_VERIFICABLE" });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("COM-H4-02: listado limita a cuatro consultas auxiliares simultáneas", async () => {
    const gate = deferred<void>();
    let active = 0, maximum = 0, availabilityCalls = 0;
    const items = Array.from({ length: 6 }, (_, index) => comboDto(`combo-${index + 1}`));
    const { repository } = setup(async path => {
      if (path === "/api/v1/combos?pagina=1&tamanio=20") return jsonResponse(200, { items, meta: { pagina: 1, tamanio: 20, total: 6 } });
      active += 1; availabilityCalls += 1; maximum = Math.max(maximum, active);
      if (availabilityCalls === 4) firstFour.resolve();
      await gate.promise; active -= 1;
      return jsonResponse(200, available(decodeURIComponent(path.split("/")[3] ?? "")));
    });
    const firstFour = deferred<void>();
    const listing = repository.list(query);
    await firstFour.promise;
    expect(maximum).toBe(4);
    gate.resolve();
    const result = await listing;
    expect(result.items).toHaveLength(6);
    expect(maximum).toBeLessThanOrEqual(4);
  });

  it("COM-H4-03: alta incierta conserva el marker y no duplica POST", async () => {
    const request = vi.fn(async (_path: string, init: { method: string }) => init.method === "POST" ? Promise.reject(new Error("timeout")) : jsonResponse(200, available("combo-h4")));
    const { repository } = setup(request);
    await expect(repository.create(payload)).rejects.toThrow(/incierto|No se confirmó/);
    const before = Object.keys(storage).filter(key => key.startsWith("g6:combos:uncertain:v2:")).length;
    await expect(repository.create(payload)).rejects.toThrow(/reconciliación|no se reenvió/);
    expect(before).toBe(1);
    expect(request.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
    expect(Object.keys(storage).filter(key => key.startsWith("g6:combos:uncertain:v2:")).length).toBe(1);
  });

  it("COM-H4-04: PATCH confirmado sigue confirmado aunque GET de disponibilidad falle", async () => {
    const request = vi.fn(async (path: string, init: { method: string }) => path.includes("/disponibilidad")
      ? jsonResponse(503, { status: 503, code: "SERVICIO_NO_DISPONIBLE" })
      : init.method === "PATCH" ? jsonResponse(200, comboDto("combo-h4", { name: "Combo editado", version: 2 })) : jsonResponse(200, comboDto("combo-h4")));
    const { repository } = setup(request);
    const result = await repository.update("combo-h4", { ...payload, version: 1 });
    expect(result).toMatchObject({ id: "combo-h4", name: "Combo editado", version: 2, availability: { verifiable: false } });
    expect(request.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1);
    expect(request.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1);
  });

  it("COM-H4-05: un repositorio nuevo con la misma identidad rehidrata el bloqueo", async () => {
    const first = setup(async (_path, init) => init.method === "POST" ? Promise.reject(new Error("timeout")) : jsonResponse(200, available("combo-h4")));
    await expect(first.repository.update("combo-h4", payload)).rejects.toThrow();
    const second = setup(vi.fn(async () => jsonResponse(200, comboDto("combo-h4"))));
    await expect(second.repository.update("combo-h4", payload)).rejects.toThrow(/reconciliación/);
    expect(second.request).not.toHaveBeenCalled();
    expect(Object.keys(storage).some(key => key.startsWith("g6:combos:uncertain:v2:"))).toBe(true);
  });

  it("COM-H4-06: A no bloquea la escritura independiente de B ni elimina su marker", async () => {
    const requestA = vi.fn(async (_path: string, init: { method: string }) => init.method === "PATCH" ? Promise.reject(new Error("timeout")) : jsonResponse(200, available("combo-h4")));
    const a = setup(requestA);
    await expect(a.repository.update("combo-h4", payload)).rejects.toThrow();
    const markerA = Object.keys(storage).find(key => key.startsWith("g6:combos:uncertain:v2:"));
    expect(markerA).toBeDefined();
    owner = fakeOwnerB;
    const b = setup(async (path) => path.includes("/disponibilidad") ? jsonResponse(200, available("combo-b")) : jsonResponse(200, comboDto("combo-b", { name: "Combo B", version: 2 })));
    await expect(b.repository.update("combo-b", { ...payload, name: "Combo B" })).resolves.toMatchObject({ id: "combo-b" });
    expect(storage.getItem(markerA!)).not.toBeNull();
    expect(requestA.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1);
  });
});
