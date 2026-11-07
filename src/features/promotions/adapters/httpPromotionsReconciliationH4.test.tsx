import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpPromotionServices } from "./httpPromotionServices";
import type { CouponInput, CouponView } from "../services/couponRepository";
import type { CampaignDraft } from "../services/campaignRepository";
import type { RecommendationDraft } from "../services/recommendationRepository";
import { createMemoryStorage, fakeOwnerA, jsonResponse } from "../../../../tests/fixtures/h4Controlled";

let owner = fakeOwnerA;
let storage: Storage;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { owner = fakeOwnerA; storage = createMemoryStorage(); vi.stubGlobal("sessionStorage", storage); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const signal = () => new AbortController().signal;
function services(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  fetchMock = vi.fn(handler); vi.stubGlobal("fetch", fetchMock);
  return createHttpPromotionServices({ gatewayOrigin: "http://127.0.0.1:9000", getAccessToken: async () => "h4.fake.token", scopeId: () => owner });
}
const couponInput: CouponInput = { code: "H4-CUPON-001", promotionId: "promo-h4", status: "active", globalLimit: 25, customerLimit: 2, minimumAmount: "10.00", cancellationPolicy: "restore" };
const couponDto = (overrides: Record<string, unknown> = {}) => ({ cuponId: "coupon-h4", promocionId: "promo-h4", codigo: "H4-CUPON-001", estado: "ACTIVO", maxUsosGlobal: 25, maxUsosPorCliente: 2, montoMinimo: 10, politicaCancelacion: "RESTAURAR_EN_CANCELACION", usosGlobalesConsumidos: 0, usosDisponibles: 25, createdAt: "2026-11-07T12:00:00Z", updatedAt: "2026-11-07T12:00:00Z", ...overrides });
const couponPage = (item: unknown | null, page = 2, total = 101) => jsonResponse(200, { items: item ? [item] : [], meta: { pagina: page, total } });
const campaignDraft: CampaignDraft = { name: "Campaña H4", mode: "coupon", status: "active", discountType: "percentage", benefit: "10", priority: "1", validFrom: "2026-11-08T00:00", validUntil: "2026-11-10T00:00", channels: ["retail"], productIds: ["product-h4"], skus: [], combination: { pricing: false, automatic: false, coupon: true } };
const campaignDto = (overrides: Record<string, unknown> = {}) => ({ promotionId: "promo-h4", nombre: "Campaña H4", estado: "ACTIVO", puedeCambiarModalidad: true, modalidad: "CUPON", tipoDescuento: "PORCENTAJE", valor: 10, prioridad: 1, validFrom: "2026-11-08T05:00:00Z", validUntil: "2026-11-10T05:00:00Z", alcance: { productIds: ["product-h4"], skus: [] }, canalesHabilitados: ["RETAIL"], politicaCombinacion: { ofertaPricing: false, promocionAutomatica: false, cupon: true }, ...overrides });
const recommendationDraft: RecommendationDraft = { name: "Regla H4", kind: "cross-sell", originType: "product", originId: "product-h4", priority: "1", status: "active", validFrom: "2026-11-08T00:00", validUntil: "2026-11-10T00:00", candidates: [{ productId: "product-next", order: "1", criterion: "", justification: "" }] };

describe("Promotions reconciliation H4", () => {
  it("PRO-H4-01: cupón incierto se encuentra en segunda página, concilia y elimina el marker sin reenviar", async () => {
    const servicesApi = services(async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === "POST" && url.pathname.endsWith("/cupones")) throw new TypeError("timeout posterior al despacho");
      if (url.pathname.endsWith("/cupones") && url.searchParams.get("pagina") === "1") return couponPage(null, 1);
      if (url.pathname.endsWith("/cupones") && url.searchParams.get("pagina") === "2") return couponPage(couponDto(), 2);
      throw new Error(`Solicitud inesperada ${init?.method} ${url.pathname}`);
    });
    await expect(servicesApi.coupons.create(couponInput, signal())).rejects.toMatchObject({ kind: "unknown" });
    const reconciled = await servicesApi.coupons.reconcilePending!(null, couponInput.code, signal());
    expect(reconciled.status).toBe("reconciled");
    expect((reconciled as { value: CouponView }).value).toMatchObject({ id: "coupon-h4", code: couponInput.code, writeOutcome: "RECONCILED" });
    expect(Object.keys(storage).filter(key => key.startsWith("g6:promotions:uncertain:v1:"))).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/cupones?")).map(([url]) => new URL(String(url)).searchParams.get("pagina"))).toEqual(["1", "2"]);
  });

  it("PRO-H4-02: monto 10.01 no concilia con 10.00 y conserva el marcador", async () => {
    const api = services(async (_input, init) => {
      if (init?.method === "POST") throw new TypeError("timeout");
      return couponPage(couponDto({ montoMinimo: 10.01 }), 1, 1);
    });
    await expect(api.coupons.create(couponInput, signal())).rejects.toMatchObject({ kind: "unknown" });
    const result = await api.coupons.reconcilePending!(null, couponInput.code, signal());
    expect(result).toEqual({ status: "not_accredited" });
    expect(Object.keys(storage).filter(key => key.startsWith("g6:promotions:uncertain:v1:")).length).toBe(1);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("PRO-H4-02b: monto 10 equivale exactamente a 10.00 y la reconciliación elimina el marcador", async () => {
    const api = services(async (_input, init) => {
      if (init?.method === "POST") throw new TypeError("timeout posterior al despacho");
      return couponPage(couponDto({ montoMinimo: 10 }), 1, 1);
    });
    await expect(api.coupons.create(couponInput, signal())).rejects.toMatchObject({ kind: "unknown" });
    const marker = Object.keys(storage).find(key => key.startsWith("g6:promotions:uncertain:v1:"));
    expect(marker).toBeDefined();
    expect(storage.getItem(marker!)).not.toBeNull();
    await expect(api.coupons.reconcilePending!(null, couponInput.code, signal())).resolves.toMatchObject({ status: "reconciled" });
    expect(storage.getItem(marker!)).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("PRO-H4-03: cupón 201 confirmado no se revierte por promoción auxiliar 503", async () => {
    const api = services(async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === "POST" && url.pathname.endsWith("/cupones")) return jsonResponse(201, couponDto());
      if (url.pathname.endsWith("/promociones/promo-h4")) return jsonResponse(503, { status: 503, code: "SERVICIO_NO_DISPONIBLE" });
      return jsonResponse(404, { status: 404, code: "NO_ENCONTRADO" });
    });
    const result = await api.coupons.create(couponInput, signal());
    expect(result).toMatchObject({ id: "coupon-h4", code: couponInput.code, relatedDataUnavailable: true });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(Object.keys(storage).filter(key => key.startsWith("g6:promotions:uncertain:v1:"))).toHaveLength(0);
  });

  it.each([401, 403])("PRO-H4-04: lectura auxiliar HTTP %i conserva la confirmación y tipa el acceso", async status => {
    const api = services(async (input, init) => new URL(String(input)).pathname.endsWith("/cupones") && init?.method === "POST"
      ? jsonResponse(201, couponDto())
      : jsonResponse(status, { status, code: status === 401 ? "TOKEN_INVALIDO" : "SCOPE_INSUFICIENTE" }));
    const result = await api.coupons.create(couponInput, signal());
    expect(result.id).toBe("coupon-h4");
    expect(result.relatedDataAccess).toBe(status === 401 ? "session" : "forbidden");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("PRO-H4-05: campaña incierta solo concilia tras observar estado esperado y elimina marker", async () => {
    let status = "ACTIVO";
    const api = services(async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === "POST" && url.pathname.endsWith("/promociones/promo-h4/desactivar")) throw new TypeError("timeout");
      if (url.pathname.endsWith("/promociones/promo-h4")) return jsonResponse(200, campaignDto({ estado: status }));
      return jsonResponse(404, { status: 404, code: "NO_ENCONTRADO" });
    });
    await expect(api.campaigns.changeStatus("promo-h4", "inactive", signal())).rejects.toMatchObject({ kind: "unknown" });
    const marker = Object.keys(storage).find(key => key.startsWith("g6:promotions:uncertain:v1:"));
    expect(marker).toBeDefined();
    expect((await api.campaigns.reconcilePending!("promo-h4", signal())).status).toBe("not_accredited");
    expect(storage.getItem(marker!)).not.toBeNull();
    status = "INACTIVO";
    expect((await api.campaigns.reconcilePending!("promo-h4", signal())).status).toBe("reconciled");
    expect(storage.getItem(marker!)).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("PRO-H4-06: campaña con mismo ID pero configuración distinta no acredita la escritura", async () => {
    let changed = true;
    const api = services(async (_input, init) => {
      if (init?.method === "GET") return jsonResponse(200, campaignDto({ nombre: changed ? "Nombre diferente" : "Campaña H4" }));
      if (init?.method === "PATCH") throw new TypeError("timeout");
      return jsonResponse(404, { status: 404, code: "NO_ENCONTRADO" });
    });
    await api.campaigns.read("promo-h4", signal());
    await expect(api.campaigns.save("promo-h4", campaignDraft, signal())).rejects.toMatchObject({ kind: "unknown" });
    const result = await api.campaigns.reconcilePending!("promo-h4", signal());
    expect(result.status).toBe("not_accredited");
    expect(Object.keys(storage).some(key => key.startsWith("g6:promotions:uncertain:v1:"))).toBe(true);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
    changed = false;
  });

  it("PRO-H4-07: recomendación A se concilia por su propio ID y estado; regla B no puede acreditarla", async () => {
    let selectedId = "rule-b";
    const api = services(async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === "POST" && url.pathname.endsWith("/recomendaciones/reglas/rule-a/desactivar")) throw new TypeError("timeout");
      if (url.pathname.includes("/recomendaciones/reglas/")) return jsonResponse(200, { reglaId: selectedId, nombre: "Regla H4", tipo: "CROSS_SELL", origen: { tipo: "PRODUCTO", id: "product-h4" }, prioridad: 1, estado: "INACTIVO", validFrom: "2026-11-08T05:00:00Z", validUntil: "2026-11-10T05:00:00Z", recomendados: [{ productId: "product-next", orden: 1, criterioSuperioridad: null, justificacionComercial: null }] });
      return jsonResponse(404, { status: 404, code: "NO_ENCONTRADO" });
    });
    await expect(api.recommendations.changeStatus("rule-a", "inactive", signal())).rejects.toMatchObject({ kind: "unknown" });
    expect((await api.recommendations.reconcilePending!("rule-a", signal())).status).toBe("not_accredited");
    selectedId = "rule-a";
    expect((await api.recommendations.reconcilePending!("rule-a", signal())).status).toBe("reconciled");
    expect(Object.keys(storage).filter(key => key.startsWith("g6:promotions:uncertain:v1:"))).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    void recommendationDraft;
  });

  it("PRO-H4-08: alta sin identidad única queda REQUIRES_EXTERNAL_VERIFICATION y bloquea repetición", async () => {
    const api = services(async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === "POST" && url.pathname.endsWith("/promociones")) throw new TypeError("timeout");
      return jsonResponse(200, { items: [{ ...campaignDto(), promotionId: "ambiguous-name-only" }], meta: { pagina: 1, total: 1 } });
    });
    await expect(api.campaigns.save(null, campaignDraft, signal())).rejects.toMatchObject({ kind: "unknown" });
    const marker = Object.keys(storage).find(key => key.startsWith("g6:promotions:uncertain:v1:"));
    expect(marker).toBeDefined();
    expect(JSON.parse(storage.getItem(marker!) ?? "null")).toMatchObject({ state: "REQUIRES_EXTERNAL_VERIFICATION" });
    await expect(api.campaigns.save(null, campaignDraft, signal())).rejects.toMatchObject({ kind: "unknown" });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});
