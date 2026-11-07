import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpPricingRepository, type PricingHttpRequest } from "./httpPricingRepository";
import type { PriceTarget } from "../services/pricingRepository";
import type { ScheduleDraft } from "../services/pricingModels";
import { createMemoryStorage, deferred, fakeOwnerA, fakeOwnerB, jsonResponse } from "../../../../tests/fixtures/h4Controlled";

const target: PriceTarget = { id: "target-h4", label: "Producto H4, variante", productId: "product-h4", kind: "variant", sku: "SKU-H4-001", productTargetId: "parent-h4" };
const channels = { retail: "11111111-1111-4111-8111-111111111111", marketplace: "22222222-2222-4222-8222-222222222222", chatbot: "33333333-3333-4333-8333-333333333333", ventas: "44444444-4444-4444-8444-444444444444" };
const signal = () => new AbortController().signal;
let owner = fakeOwnerA;
let storage: Storage;
beforeEach(() => { owner = fakeOwnerA; storage = createMemoryStorage(); vi.stubGlobal("sessionStorage", storage); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function repository(respond: (path: string, request: PricingHttpRequest) => Promise<Response>, options: { ids?: typeof channels; targets?: PriceTarget[] } = {}) {
  const request = vi.fn(respond);
  const instance = createHttpPricingRepository({ transport: { request }, scopeId: () => owner, listCatalogTargets: async () => options.targets ?? [target], channelIds: options.ids ?? channels });
  return { instance, request };
}
function price(channelId: string | null, overrides: Record<string, unknown> = {}) {
  return { sku: target.kind === "variant" ? target.sku : "", precio_regular: 12.5, precio_oferta: null, currency: "PEN", channel_id: channelId, valid_from: "2026-11-01T00:00:00.000Z", valid_until: null, price_version: 4, vigencia_id: "vig-h4", origen: "SKU_OVERRIDE", ...overrides };
}
function page(items: unknown[], total = items.length, current = 1) {
  return { items, meta: { pagina: current, tamanio: 20, total, totalPaginas: Math.ceil(total / 20) } };
}
function schedule(id: string) {
  return { programacionId: id, sku: target.kind === "variant" ? target.sku : "", tipoPrecio: "REGULAR", importe: 49.9, moneda: "PEN", channelId: null, validFrom: "2026-11-10T14:00:00.000Z", validUntil: "2026-11-11T14:00:00.000Z", estado: "SCHEDULED", priceVersion: 5 };
}
const draft: ScheduleDraft = { kind: "REGULAR", amount: "49.90", currency: "PEN", channel: "global", start: "2026-11-10T09:00", end: "2026-11-11T09:00", reason: "Ajuste H4" };

describe("Pricing reconciliation H4", () => {
  it("PRI-H4-01: los cinco canales conservan su identidad canónica y un canal sin UUID no escribe", async () => {
    const observed: unknown[] = [];
    const setup = repository(async (_path, request) => {
      const channelId = request.method === "GET" ? new URLSearchParams(_path.split("?")[1]).get("canal") : JSON.parse(request.body ?? "{}").channelId;
      observed.push({ method: request.method, channelId });
      const mappedId = channelId === null ? null : channels[channelId.toLowerCase() as keyof typeof channels] ?? channelId;
      return jsonResponse(200, price(mappedId));
    });
    for (const channel of ["global", "retail", "marketplace", "chatbot", "ventas"] as const) {
      const view = await setup.instance.read({ targetId: target.id, channel }, signal());
      expect(view?.price.channel).toBe(channel);
    }
    const withoutUuid = repository(async () => jsonResponse(200, price(null)), { ids: { ...channels, retail: "" } });
    await expect(withoutUuid.instance.read({ targetId: target.id, channel: "retail" }, signal())).rejects.toMatchObject({ kind: "blocked_contract" });
    expect(withoutUuid.request).not.toHaveBeenCalled();
    expect(observed).toHaveLength(5);
  });

  it("PRI-H4-02: PATCH incierto persiste y el segundo PATCH se bloquea antes del transporte", async () => {
    const request = vi.fn(async (_path: string, init: PricingHttpRequest) => init.method === "GET" ? jsonResponse(200, price(null)) : Promise.reject(new Error("timeout posterior al despacho")));
    const { instance } = repository(request);
    await instance.readEditable({ targetId: target.id, channel: "global" }, signal());
    const change = { target: { targetId: target.id, channel: "global" as const }, version: 4, draft: { regular: "13.00", offer: "", offerAction: "CONSERVAR" as const, currency: "PEN", reason: "Corrección H4" } };
    await expect(instance.update(change, signal())).rejects.toMatchObject({ kind: "unknown" });
    const before = request.mock.calls.filter(([, init]) => init.method === "PATCH").length;
    await expect(instance.update(change, signal())).rejects.toMatchObject({ kind: "unknown" });
    expect(before).toBe(1);
    expect(request.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1);
    expect(Object.keys(storage).some(key => key.startsWith("g6:pricing:pending:v1:update:"))).toBe(true);
  });

  it("PRI-H4-03: programación idéntica en línea base no se atribuye al POST incierto", async () => {
    const request = vi.fn(async (_path: string, init: PricingHttpRequest) => init.method === "GET" ? jsonResponse(200, page([schedule("old-schedule")])) : Promise.reject(new Error("timeout")));
    const { instance } = repository(request);
    await expect(instance.schedule(target.id, draft, signal())).rejects.toMatchObject({ kind: "unknown" });
    const baselineIds = JSON.parse(storage.getItem(Object.keys(storage).find(key => key.startsWith("g6:pricing:pending:v1:schedule:"))!) ?? "null").expected.baselineIds as string[];
    expect(baselineIds).toEqual(["old-schedule"]);
    const callsBefore = request.mock.calls.length;
    await expect(instance.schedule(target.id, draft, signal())).rejects.toMatchObject({ kind: "unknown" });
    expect(request.mock.calls.length).toBe(callsBefore);
    expect(request.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
  });

  it("PRI-H4-04: una programación nueva y única concilia solo si no estaba en la línea base", async () => {
    let postSeen = false;
    const request = vi.fn(async (_path: string, init: PricingHttpRequest) => {
      if (init.method === "POST") { postSeen = true; throw new Error("timeout"); }
      return jsonResponse(200, page(postSeen ? [schedule("new-schedule")] : []));
    });
    const { instance } = repository(request);
    await expect(instance.schedule(target.id, draft, signal())).rejects.toMatchObject({ kind: "unknown" });
    const key = Object.keys(storage).find(item => item.startsWith("g6:pricing:pending:v1:schedule:"));
    expect(key).toBeDefined();
    await instance.listSchedules(target.id, 1, signal());
    expect(storage.getItem(key!)).toBeNull();
    expect(request.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
  });

  it("PRI-H4-05: coincidencias nuevas ambiguas requieren verificación externa", async () => {
    let postSeen = false;
    const request = vi.fn(async (_path: string, init: PricingHttpRequest) => {
      if (init.method === "POST") { postSeen = true; throw new Error("timeout"); }
      return jsonResponse(200, page(postSeen ? [schedule("new-1"), schedule("new-2")] : []));
    });
    const { instance } = repository(request);
    await expect(instance.schedule(target.id, draft, signal())).rejects.toMatchObject({ kind: "unknown" });
    const key = Object.keys(storage).find(item => item.startsWith("g6:pricing:pending:v1:schedule:"))!;
    const result = await instance.listSchedules(target.id, 1, signal());
    expect(result.items).toHaveLength(2);
    expect(JSON.parse(storage.getItem(key) ?? "null")).toMatchObject({ state: "REQUIRES_EXTERNAL_VERIFICATION" });
    expect(request.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
  });

  it("PRI-H4-06: lectura ordinaria consulta una página; conciliación recorre todas las páginas", async () => {
    let postSeen = false;
    const request = vi.fn(async (_path: string, init: PricingHttpRequest) => {
      if (init.method === "POST") { postSeen = true; throw new Error("timeout"); }
      const requested = Number(/pagina=(\d+)/.exec(_path)?.[1] ?? "1");
      const items = requested === 1
        ? Array.from({ length: 20 }, (_, index) => schedule(postSeen && index === 0 ? "old-1" : `old-${index + 1}`))
        : [schedule(postSeen ? "new-page-2" : "old-21")];
      return jsonResponse(200, page(items, 21, requested));
    });
    const { instance } = repository(request);
    await instance.listSchedules(target.id, 2, signal());
    expect(request.mock.calls.filter(([, init]) => init.method === "GET")).toHaveLength(1);
    request.mockClear();
    await expect(instance.schedule(target.id, draft, signal())).rejects.toMatchObject({ kind: "unknown" });
    request.mockClear();
    await instance.listSchedules(target.id, 1, signal());
    expect(request.mock.calls.filter(([, init]) => init.method === "GET").map(([path]) => /pagina=(\d+)/.exec(path)?.[1])).toEqual(["1", "2"]);
  });

  it("PRI-H4-07: GET tardío y su error de A no se entregan a B ni alteran el marker de A", async () => {
    const pending = deferred<Response>();
    const request = vi.fn(() => pending.promise);
    const { instance } = repository(request);
    const readA = instance.listSchedules(target.id, 1, signal());
    owner = fakeOwnerB;
    pending.resolve(jsonResponse(200, page([])));
    await expect(readA).rejects.toMatchObject({ kind: "unknown" });
    expect(owner).toBe(fakeOwnerB);
    expect(request).toHaveBeenCalledOnce();
    const failed = deferred<Response>();
    request.mockImplementationOnce(() => failed.promise);
    const readLateError = instance.listSchedules(target.id, 1, signal());
    owner = fakeOwnerA;
    failed.resolve(jsonResponse(503, { status: 503, code: "SERVICIO_NO_DISPONIBLE" }));
    await expect(readLateError).rejects.toBeDefined();
    expect(request.mock.calls).toHaveLength(2);
  });
});
