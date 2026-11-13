import {
  AdministrationError,
  localDateValid,
} from "../services/administration";
import type { AdministrationQuery } from "../services/administration";
import type {
  CampaignDraft,
  CampaignView,
} from "../services/campaignRepository";
import {
  CouponReadError,
  CouponWriteError,
} from "../services/couponRepository";
import type {
  CouponInput,
  CouponView,
  CouponQuery,
} from "../services/couponRepository";
import type {
  RecommendationDraft,
  RecommendationView,
  SuperiorityCriterion,
} from "../services/recommendationRepository";
import type { PromotionCatalogRepository } from "../services/catalogRepository";
import type { PromotionServices } from "../services/promotionServices";

import { createHttpPromotionCatalog, PromotionCatalogAccessError } from "./httpPromotionCatalog";
import { isGatewayTokenInvalid } from "../../shared/isGatewayTokenInvalid";

export interface PromotionHttpOptions {
  gatewayOrigin: string;
  publicReads?: boolean;
  getAccessToken(signal: AbortSignal): Promise<string | null>;
  refreshAccessToken?(
    rejectedToken: string,
    signal: AbortSignal,
  ): Promise<string | null>;
  invalidateAccessToken?(rejectedToken: string): void;
  scopeId?: () => string | null;
  catalog?: PromotionCatalogRepository;
  sessionEvents?: { version(): number; subscribe(notify: () => void): () => void };
}
class HttpFailure extends Error {
  constructor(readonly status: number) {
    super("PROMOTIONS_HTTP_FAILED");
  }
}
class PromotionSessionChanged extends Error { constructor(readonly dispatched: boolean) { super("PROMOTION_SESSION_CHANGED"); } }
class PromotionConfirmedForPreviousSession extends Error { constructor() { super("PROMOTION_CONFIRMED_FOR_PREVIOUS_SESSION"); } }
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("INVALID_RESPONSE");
  return v as Record<string, unknown>;
};
const text = (v: unknown): string => {
  if (typeof v !== "string") throw new Error("INVALID_RESPONSE");
  return v;
};
const number = (v: unknown): number => {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Error("INVALID_RESPONSE");
  return v;
};
const integer = (v: unknown): number => {
  const n = number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("INVALID_RESPONSE");
  return n;
};
const boolean = (v: unknown): boolean => {
  if (typeof v !== "boolean") throw new Error("INVALID_RESPONSE");
  return v;
};
const array = (v: unknown): unknown[] => {
  if (!Array.isArray(v)) throw new Error("INVALID_RESPONSE");
  return v;
};
function choice<T extends string>(v: unknown, choices: Record<string, T>): T {
  const key = text(v);
  if (!Object.hasOwn(choices, key)) throw new Error("INVALID_ENUM");
  return choices[key]!;
}
const states = { ACTIVO: "active", INACTIVO: "inactive" } as const;
const toState = (v: unknown) =>
  choice(v, { active: "ACTIVO", inactive: "INACTIVO" });
const channels = {
  MARKETPLACE: "marketplace",
  CHATBOT: "chatbot",
  RETAIL: "retail",
  VENTAS: "sales",
} as const;
const channelDto = {
  marketplace: "MARKETPLACE",
  chatbot: "CHATBOT",
  retail: "RETAIL",
  sales: "VENTAS",
} as const;
function localDate(v: unknown): string {
  const instant = new Date(text(v));
  if (!Number.isFinite(instant.getTime())) throw new Error("INVALID_RESPONSE");
  return new Date(instant.getTime() - 5 * 3600000).toISOString().slice(0, 16);
}
function instant(v: string): string {
  if (!localDateValid(v)) throw new Error("INVALID_DATE");
  return new Date(v + ":00-05:00").toISOString();
}
function numeric(v: string): number {
  if (!/^\d+(\.\d+)?$/.test(v)) throw new Error("INVALID_NUMBER");
  return number(Number(v));
}
function campaign(v: unknown): CampaignView {
  const r = record(v),
    scope = record(r.alcance),
    policy = record(r.politicaCombinacion);
  return {
    id: text(r.promotionId),
    name: text(r.nombre),
    status: choice(r.estado, states),
    canChangeMode: boolean(r.puedeCambiarModalidad),
    configuration: {
      name: text(r.nombre),
      status: choice(r.estado, states),
      mode: choice(r.modalidad, { AUTOMATICA: "automatic", CUPON: "coupon" }),
      discountType: choice(r.tipoDescuento, {
        PORCENTAJE: "percentage",
        MONTO_FIJO: "amount",
      }),
      benefit: String(number(r.valor)),
      priority: String(integer(r.prioridad)),
      validFrom: localDate(r.validFrom),
      validUntil: localDate(r.validUntil),
      productIds: array(scope.productIds).map(text),
      skus: array(scope.skus).map(text),
      channels: array(r.canalesHabilitados).map((c) => choice(c, channels)),
      combination: {
        pricing: boolean(policy.ofertaPricing),
        automatic: boolean(policy.promocionAutomatica),
        coupon: boolean(policy.cupon),
      },
    },
  };
}
function campaignDto(d: CampaignDraft): Record<string, unknown> {
  return {
    nombre: d.name,
    modalidad: choice(d.mode, { automatic: "AUTOMATICA", coupon: "CUPON" }),
    estado: toState(d.status),
    tipoDescuento: choice(d.discountType, {
      percentage: "PORCENTAJE",
      amount: "MONTO_FIJO",
    }),
    valor: numeric(d.benefit),
    prioridad: numeric(d.priority),
    validFrom: instant(d.validFrom),
    validUntil: instant(d.validUntil),
    alcance: { productIds: d.productIds, skus: d.skus },
    canalesHabilitados: d.channels.map((c) => choice(c, channelDto)),
    politicaCombinacion: {
      ofertaPricing: d.combination.pricing,
      promocionAutomatica: d.combination.automatic,
      cupon: d.combination.coupon,
    },
  };
}
function recommendation(v: unknown): RecommendationView {
  const r = record(v),
    origin = record(r.origen);
  return {
    id: text(r.reglaId),
    name: text(r.nombre),
    status: choice(r.estado, states),
    configuration: {
      name: text(r.nombre),
      kind: choice(r.tipo, { CROSS_SELL: "cross-sell", UPSELL: "upsell" }),
      originType: choice(origin.tipo, {
        PRODUCTO: "product",
        CATEGORIA: "category",
      }),
      originId: text(origin.id),
      priority: String(integer(r.prioridad)),
      status: choice(r.estado, states),
      validFrom: localDate(r.validFrom),
      validUntil: localDate(r.validUntil),
      candidates: array(r.recomendados).map((v) => {
        const i = record(v);
        return {
          productId: text(i.productId),
          order: String(integer(i.orden)),
          criterion:
            i.criterioSuperioridad === null ||
            i.criterioSuperioridad === undefined
              ? ""
              : choice<SuperiorityCriterion>(i.criterioSuperioridad, {
                  MAYOR_RENDIMIENTO: "MAYOR_RENDIMIENTO",
                  MEJOR_MATERIAL: "MEJOR_MATERIAL",
                  MAYOR_CAPACIDAD: "MAYOR_CAPACIDAD",
                  FUNCIONALIDAD_ADICIONAL: "FUNCIONALIDAD_ADICIONAL",
                }),
          justification:
            i.justificacionComercial === null ||
            i.justificacionComercial === undefined
              ? ""
              : text(i.justificacionComercial),
        };
      }),
    },
  };
}
function recommendationDto(d: RecommendationDraft): Record<string, unknown> {
  return {
    nombre: d.name,
    tipo: choice(d.kind, { "cross-sell": "CROSS_SELL", upsell: "UPSELL" }),
    origen: {
      tipo: choice(d.originType, {
        product: "PRODUCTO",
        category: "CATEGORIA",
      }),
      id: d.originId,
    },
    prioridad: numeric(d.priority),
    estado: toState(d.status),
    validFrom: instant(d.validFrom),
    validUntil: instant(d.validUntil),
    recomendados: d.candidates.map((c) => ({
      productId: c.productId,
      orden: numeric(c.order),
      criterioSuperioridad: c.criterion || null,
      justificacionComercial: c.justification || null,
    })),
  };
}
function couponDto(d: Omit<CouponInput, "status"> & { status?: string }) {
  return {
    codigo: d.code.trim().toUpperCase(),
    promocionId: d.promotionId,
    ...(d.status ? { estado: toState(d.status) } : {}),
    maxUsosGlobal: d.globalLimit,
    maxUsosPorCliente: d.customerLimit,
    montoMinimo: d.minimumAmount === null ? null : numeric(d.minimumAmount),
    politicaCancelacion: choice(d.cancellationPolicy, {
      restore: "RESTAURAR_EN_CANCELACION",
      keep: "NO_RESTAURAR",
    }),
  };
}
function changes(
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(previous[key]),
    ),
  );
}
function query(
  q: CouponQuery | AdministrationQuery,
  kindField?: "modalidad" | "tipo",
) {
  const p = new URLSearchParams({
    pagina: String(q.page),
    tamanio: String(q.pageSize),
  });
  if (q.status !== "all") p.set("estado", toState(q.status));
  if (kindField && "kind" in q && q.kind !== "all")
    p.set(
      kindField,
      choice(
        q.kind,
        kindField === "modalidad"
          ? { coupon: "CUPON", automatic: "AUTOMATICA" }
          : { "cross-sell": "CROSS_SELL", upsell: "UPSELL" },
      ),
    );
  return p.toString();
}
function page<T>(v: unknown, map: (v: unknown) => T) {
  const r = record(v),
    meta = record(r.meta);
  const current = integer(meta.pagina),
    total = integer(meta.total);
  if (current < 1) throw new Error("INVALID_PAGE");
  return { items: array(r.items).map(map), total, page: current };
}

export function createHttpPromotionServices(
  options: PromotionHttpOptions,
): PromotionServices & { dispose(): void } {
  const url = new URL(options.gatewayOrigin);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("Configura un origen Gateway HTTPS válido.");
  const origin = url.origin;
  async function request(
    path: string,
    signal: AbortSignal,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    signal.throwIfAborted();
    const owner = options.scopeId?.() ?? null;
    const version = options.sessionEvents?.version();
    const assertSession = (dispatched: boolean) => {
      if ((options.scopeId?.() ?? null) !== owner || options.sessionEvents?.version() !== version)
        throw new PromotionSessionChanged(dispatched);
    };
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(7500)]);
    async function sessionToken(work: () => Promise<string | null>) {
      let abort = () => {};
      try {
        return await Promise.race([
          Promise.resolve().then(work),
          new Promise<never>((_resolve, reject) => {
            abort = () =>
              reject(new DOMException("Consulta cancelada", "AbortError"));
            bounded.addEventListener("abort", abort, { once: true });
            if (bounded.aborted) abort();
          }),
        ]);
      } finally {
        bounded.removeEventListener("abort", abort);
      }
    }
    const token = await sessionToken(() => options.getAccessToken(bounded));
    assertSession(false);
    bounded.throwIfAborted();
    if (!token || /[\r\n]/.test(token)) throw new HttpFailure(401);
    const send = (accessToken: string) =>
      fetch(origin + "/api/v1" + path, {
        method,
        signal: bounded,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        headers: {
          ...(options.publicReads && method === "GET" ? {} : { Authorization: "Bearer " + accessToken }),
          "X-Correlation-Id": crypto.randomUUID(),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    let response = await send(token);
    assertSession(true);
    if (!(options.publicReads && method === "GET") && await isGatewayTokenInvalid(response)) {
      assertSession(true);
      const refresh = options.refreshAccessToken;
      if (method === "GET" && refresh) {
        const renewed = await sessionToken(() => refresh(token, bounded));
        assertSession(true);
        bounded.throwIfAborted();
        if (renewed && !/[\r\n]/.test(renewed)) {
          response = await send(renewed);
          assertSession(true);
          if (await isGatewayTokenInvalid(response)) options.invalidateAccessToken?.(renewed);
        } else options.invalidateAccessToken?.(token);
      } else {
        options.invalidateAccessToken?.(token);
      }
    }
    if (!response.ok) throw new HttpFailure(response.status);
    const payload: unknown = await response.json();
    assertSession(true);
    return payload;
  }
  async function read<T>(
    work: () => Promise<T>,
    missing = false,
  ): Promise<T | null> {
    try {
      return await work();
    } catch (e) {
      if (e instanceof PromotionSessionChanged) throw new CouponReadError("session", "La sesión cambió durante la consulta; vuelve a consultar con la identidad actual.");
      if (e instanceof CouponReadError) throw e;
      if (e instanceof HttpFailure && missing && e.status === 404) return null;
      const status = e instanceof HttpFailure || e instanceof PromotionCatalogAccessError ? e.status : undefined;
      throw new CouponReadError(
        status === 401 ? "session" : status === 403 ? "forbidden" : "unavailable",
        status === 401
          ? "Tu sesión no está disponible. Vuelve a identificarte."
          : status === 403
            ? "No tienes permiso para consultar estos datos."
            : "No se pudo consultar la información. Conservamos el contexto; vuelve a consultar.",
      );
    }
  }
  type WriteEvidence = { entity: "coupon" | "campaign" | "recommendation"; operation: "create" | "update" | "status"; resourceId?: string; naturalCode?: string; payload?: unknown; changedFields?: string[]; baseline?: unknown; expectedState?: unknown; correlationId: string };
  const decimalAmount = (value: unknown): string | null => {
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return null;
    const raw = String(value).trim().replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(raw)) return null;
    const [whole, fraction = ""] = raw.split(".");
    return `${whole!.replace(/^0+(?=\d)/, "")}.${fraction.replace(/0+$/, "") || "0"}`;
  };
  async function write<T>(intent: string, work: () => Promise<T>, coupon = false, evidence?: Omit<WriteEvidence, "correlationId">, reconcile?: (evidence: WriteEvidence) => Promise<T | null>): Promise<T> {
    const owner = options.scopeId?.();
    if (!owner) throw coupon ? new CouponWriteError("access", "Inicia sesión para modificar cupones.") : new AdministrationError("access", "Inicia sesión para modificar promociones.");
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${owner}\u0000${intent}`)))].map(value => value.toString(16).padStart(2, "0")).join("");
    const key = `g6:promotions:uncertain:v1:${digest}`;
    let previous: string | null;
    try {
      previous = sessionStorage.getItem(key);
    } catch {
      throw coupon ? new CouponWriteError("unknown", "El marcador persistente es inaccesible; se bloquea el reenvío.") : new AdministrationError("unknown", "El marcador persistente es inaccesible; se bloquea el reenvío.");
    }
    if (previous !== null) {
      let marker: { owner?: string; intent?: string; state?: string; evidence?: WriteEvidence };
      try { marker = JSON.parse(previous) as typeof marker; }
      catch { throw coupon ? new CouponWriteError("unknown", "El marcador está corrupto; se bloquea el reenvío.") : new AdministrationError("unknown", "El marcador está corrupto; se bloquea el reenvío."); }
      if (marker.owner !== owner || marker.intent !== intent) throw coupon ? new CouponWriteError("unknown", "La identidad del marcador no coincide; se bloquea el reenvío.") : new AdministrationError("unknown", "La identidad del marcador no coincide; se bloquea el reenvío.");
      if (reconcile && marker.evidence) {
        let recovered: T | null;
        try { recovered = await reconcile(marker.evidence); }
        catch (error) {
          if (error instanceof HttpFailure && (error.status === 401 || error.status === 403)) throw coupon ? new CouponWriteError("access", "Tu sesión o permiso no permite consultar el resultado pendiente.") : new AdministrationError("access", "Tu sesión o permiso no permite consultar el resultado pendiente.");
          throw coupon ? new CouponWriteError("unknown", "No se pudo consultar la intención anterior; permanece bloqueada.") : new AdministrationError("unknown", "No se pudo consultar la intención anterior; permanece bloqueada.");
        }
        if (recovered !== null) {
          try { sessionStorage.removeItem(key); } catch { /* authoritative final state was observed */ }
          const sameIntent = evidence && marker.evidence.entity === evidence.entity && marker.evidence.operation === evidence.operation && marker.evidence.resourceId === evidence.resourceId && marker.evidence.naturalCode === evidence.naturalCode && JSON.stringify(marker.evidence.payload) === JSON.stringify(evidence.payload) && JSON.stringify(marker.evidence.expectedState) === JSON.stringify(evidence.expectedState);
          if (!sameIntent) throw coupon ? new CouponWriteError("conflict", "La intención anterior fue conciliada; esta propuesta distinta no se envió. Consulta el estado actual antes de confirmarla explícitamente.") : new AdministrationError("conflict", "La intención anterior fue conciliada; esta propuesta distinta no se envió. Consulta el estado actual antes de confirmarla explícitamente.");
          if (typeof recovered === "object" && recovered !== null) Object.assign(recovered, { writeOutcome: "RECONCILED" });
          return recovered;
        }
        try { sessionStorage.setItem(key, JSON.stringify({ ...marker, state: "REQUIRES_EXTERNAL_VERIFICATION" })); } catch { /* keep the existing uncertainty marker */ }
      }
      throw coupon ? new CouponWriteError("unknown", "La intención previa sigue sin reconciliación; no se reenvió.") : new AdministrationError("unknown", "La intención previa sigue sin reconciliación; no se reenvió.");
    }
    try {
      const evidenceRecord: WriteEvidence | undefined = evidence ? { ...evidence, correlationId: crypto.randomUUID() } : undefined;
      sessionStorage.setItem(key, JSON.stringify({ owner, intent, state: "IN_FLIGHT", evidence: evidenceRecord }));
    } catch (error) {
      throw coupon ? new CouponWriteError("unknown", error instanceof Error ? error.message : "No se pudo proteger la escritura.") : new AdministrationError("unknown", error instanceof Error ? error.message : "No se pudo proteger la escritura.");
    }
    try {
      const result = await work();
      if (options.scopeId?.() !== owner) {
        try { const marker = JSON.parse(sessionStorage.getItem(key) ?? "{}"); sessionStorage.setItem(key, JSON.stringify({ ...marker, state: "CONFIRMED" })); } catch { /* keep the pre-dispatch marker */ }
        throw new PromotionConfirmedForPreviousSession();
      }
      try { sessionStorage.removeItem(key); } catch { /* response mapped; marker remains fail-closed */ }
      return result;
    } catch (e) {
      const status = e instanceof HttpFailure ? e.status : 0;
      const kind =
        e instanceof PromotionConfirmedForPreviousSession || (e instanceof PromotionSessionChanged && !e.dispatched) || (e instanceof CouponReadError && (e.kind === "session" || e.kind === "forbidden")) || status === 401 || status === 403
          ? "access"
          : status === 409
            ? "conflict"
            : status === 400 || status === 422
              ? "validation"
              : status === 404
                ? "rejected"
                : "unknown";
      const message =
        kind === "access"
          ? "Tu sesión o permiso no permite guardar."
          : kind === "conflict"
            ? "El registro ya existe o cambió. Consulta su estado actual."
            : kind === "validation"
              ? "Revisa los datos de la propuesta; no se guardaron."
              : kind === "rejected"
                ? "El registro ya no está disponible."
                : "No pudimos confirmar el resultado. Consulta el registro antes de volver a guardar.";
      if (e instanceof PromotionConfirmedForPreviousSession) { /* confirmed marker remains in the original identity scope */ }
      else if (kind === "unknown") { try { const marker = JSON.parse(sessionStorage.getItem(key) ?? "{}"); const external = marker.evidence?.operation === "create" && ["campaign", "recommendation"].includes(marker.evidence?.entity); sessionStorage.setItem(key, JSON.stringify({ ...marker, state: external ? "REQUIRES_EXTERNAL_VERIFICATION" : "PENDING_RECONCILIATION" })); } catch { /* preserve the initial marker */ } }
      else { try { const marker = JSON.parse(sessionStorage.getItem(key) ?? "{}"); sessionStorage.setItem(key, JSON.stringify({ ...marker, state: "REJECTED" })); sessionStorage.removeItem(key); } catch { /* retain fail-closed */ } }
      throw coupon ? new CouponWriteError(kind, message) : new AdministrationError(kind, message);
    }
  }
  async function reconcileStored<T>(intent: string, resolver: (evidence: WriteEvidence) => Promise<T | null>): Promise<import("../services/administration").PromotionReconciliation<T>> {
    const owner = options.scopeId?.();
    if (!owner) return { status: "access_denied" };
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${owner}\u0000${intent}`)))].map(value => value.toString(16).padStart(2, "0")).join("");
    const key = `g6:promotions:uncertain:v1:${digest}`;
    let marker: { owner?: string; intent?: string; evidence?: WriteEvidence } | null;
    try { marker = JSON.parse(sessionStorage.getItem(key) ?? "null") as typeof marker; }
    catch { return { status: "unavailable" }; }
    if (!marker || marker.owner !== owner || marker.intent !== intent || !marker.evidence) return { status: "not_accredited" };
    try {
      const value = await resolver(marker.evidence);
      if (!value || options.scopeId?.() !== owner) return { status: "not_accredited" };
      sessionStorage.removeItem(key);
      return { status: "reconciled", value: Object.assign(value, { writeOutcome: "RECONCILED" }) };
    } catch (error) {
      if (error instanceof HttpFailure && (error.status === 401 || error.status === 403)) return { status: "access_denied" };
      return { status: "unavailable" };
    }
  }
  const campaignSnapshots = new Map<string, CampaignDraft>(),
    ruleSnapshots = new Map<string, RecommendationDraft>();
  let version = options.sessionEvents?.version();
  const unsubscribe = options.sessionEvents?.subscribe(() => {
    const current = options.sessionEvents?.version();
    if (current !== version) {
      version = current;
      campaignSnapshots.clear();
      ruleSnapshots.clear();
    }
  });
  function requireIdentity<T extends { id: string }>(value: T, expectedId?: string): T {
    if (expectedId !== undefined && value.id !== expectedId) throw new Error("INVALID_RESPONSE_ID");
    return value;
  }
  function mapCampaign(v: unknown, expectedId?: string) {
    const r = requireIdentity(campaign(v), expectedId);
    campaignSnapshots.set(r.id, structuredClone(r.configuration));
    return r;
  }
  function mapRule(v: unknown, expectedId?: string) {
    const r = requireIdentity(recommendation(v), expectedId);
    ruleSnapshots.set(r.id, structuredClone(r.configuration));
    return r;
  }
  const campaigns: PromotionServices["campaigns"] = {
    reconcilePending: (id, s) => reconcileStored(`campaign:${id}`, async evidence => {
      if (evidence.entity !== "campaign" || evidence.resourceId !== id) return null;
      const observed = mapCampaign(await request("/promociones/" + encodeURIComponent(id), s));
      if (observed.id !== id) return null;
      return evidence.operation === "status" ? (observed.status === evidence.expectedState ? observed : null) : JSON.stringify(observed.configuration) === JSON.stringify(evidence.expectedState) ? observed : null;
    }),
    list: (q, s) =>
      read(() =>
        request("/promociones/administracion?" + query(q, "modalidad"), s).then(
          (r) => page(r, value => mapCampaign(value)),
        ),
      ).then((r) => r!),
    read: (id, s) =>
      read(
        () =>
          request("/promociones/" + encodeURIComponent(id), s).then(
            value => mapCampaign(value, id),
          ),
        true,
      ),
    save: async (id, d, s) => {
      const body = campaignDto(d);
      const digest = id ? "" : [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body))))].map(value => value.toString(16).padStart(2, "0")).join("");
      const baseline = id ? campaignSnapshots.get(id) : undefined;
      return write(id ? `campaign:${id}` : `campaign:create:${digest}`, async () => {
        if (id) {
          const previous = campaignSnapshots.get(id);
          if (!previous) throw new HttpFailure(409);
          return mapCampaign(
            await request(
              "/promociones/" + encodeURIComponent(id),
              s,
              "PATCH",
              changes(body, campaignDto(previous)),
            ),
            id,
          );
        }
        return mapCampaign(await request("/promociones", s, "POST", body));
      }, false, { entity: "campaign", operation: id ? "update" : "create", ...(id ? { resourceId: id } : {}), payload: body, changedFields: id && baseline ? Object.keys(changes(body, campaignDto(baseline))) : Object.keys(body), baseline, expectedState: d }, id ? async saved => {
        const observed = mapCampaign(await request("/promociones/" + encodeURIComponent(id), s));
        return observed.id === saved.resourceId && JSON.stringify(observed.configuration) === JSON.stringify(saved.expectedState) ? observed : null;
      } : undefined);
    },
    changeStatus: (id, status, s) =>
      write(`campaign:${id}` , () =>
        request(
          "/promociones/" +
            encodeURIComponent(id) +
            (status === "active" ? "/activar" : "/desactivar"),
          s,
          "POST",
        ).then(value => mapCampaign(value, id)), false,
        { entity: "campaign", operation: "status", resourceId: id, expectedState: status },
        async saved => { const observed = mapCampaign(await request("/promociones/" + encodeURIComponent(id), s)); return observed.id === saved.resourceId && observed.status === saved.expectedState ? observed : null; },
      ),
  };
  const recommendations: PromotionServices["recommendations"] = {
    reconcilePending: (id, s) => reconcileStored(`recommendation:${id}`, async evidence => {
      if (evidence.entity !== "recommendation" || evidence.resourceId !== id) return null;
      const observed = mapRule(await request("/recomendaciones/reglas/" + encodeURIComponent(id), s));
      if (observed.id !== id) return null;
      return evidence.operation === "status" ? (observed.status === evidence.expectedState ? observed : null) : JSON.stringify(observed.configuration) === JSON.stringify(evidence.expectedState) ? observed : null;
    }),
    list: (q, s) =>
      read(() =>
        request("/recomendaciones/reglas?" + query(q, "tipo"), s).then((r) =>
          page(r, value => mapRule(value)),
        ),
      ).then((r) => r!),
    read: (id, s) =>
      read(
        () =>
          request("/recomendaciones/reglas/" + encodeURIComponent(id), s).then(
            value => mapRule(value, id),
          ),
        true,
      ),
    save: async (id, d, s) => {
      const body = recommendationDto(d);
      const digest = id ? "" : [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body))))].map(value => value.toString(16).padStart(2, "0")).join("");
      const baseline = id ? ruleSnapshots.get(id) : undefined;
      return write(id ? `recommendation:${id}` : `recommendation:create:${digest}`, async () => {
        if (id) {
          const previous = ruleSnapshots.get(id);
          if (!previous) throw new HttpFailure(409);
          return mapRule(
            await request(
              "/recomendaciones/reglas/" + encodeURIComponent(id),
              s,
              "PATCH",
              changes(body, recommendationDto(previous)),
            ),
            id,
          );
        }
        return mapRule(
          await request("/recomendaciones/reglas", s, "POST", body),
        );
      }, false, { entity: "recommendation", operation: id ? "update" : "create", ...(id ? { resourceId: id } : {}), payload: body, changedFields: id && baseline ? Object.keys(changes(recommendationDto(d), recommendationDto(baseline))) : Object.keys(body), baseline, expectedState: d }, id ? async saved => {
        const observed = mapRule(await request("/recomendaciones/reglas/" + encodeURIComponent(id), s));
        return observed.id === saved.resourceId && JSON.stringify(observed.configuration) === JSON.stringify(saved.expectedState) ? observed : null;
      } : undefined);
    },
    changeStatus: (id, status, s) =>
      write(`recommendation:${id}`, () =>
        request(
          "/recomendaciones/reglas/" +
            encodeURIComponent(id) +
            (status === "active" ? "/activar" : "/desactivar"),
          s,
          "POST",
        ).then(value => mapRule(value, id)), false,
        { entity: "recommendation", operation: "status", resourceId: id, expectedState: status },
        async saved => { const observed = mapRule(await request("/recomendaciones/reglas/" + encodeURIComponent(id), s)); return observed.id === saved.resourceId && observed.status === saved.expectedState ? observed : null; },
      ),
  };
  function coupon(v: unknown): CouponView {
    const r = record(v);
    // Validate the administrative response before confirming any write. Parent
    // data is a separate read and cannot revoke this confirmation.
    localDate(r.createdAt);
    localDate(r.updatedAt);
    const limit = (v: unknown, minimum: number) => {
      if (v === undefined || v === null) return v;
      const n = integer(v);
      if (n < minimum) throw new Error("INVALID_RESPONSE");
      return n;
    };
    const minimumAmount = r.montoMinimo;
    if (
      minimumAmount !== undefined &&
      minimumAmount !== null &&
      number(minimumAmount) <= 0
    )
      throw new Error("INVALID_RESPONSE");
    return {
      id: text(r.cuponId),
      promotionId: text(r.promocionId),
      code: text(r.codigo),
      status: choice(r.estado, states),
      promotion: null,
      globalLimit: limit(r.maxUsosGlobal, 1),
      customerLimit: limit(r.maxUsosPorCliente, 1),
      consumedUses: integer(r.usosGlobalesConsumidos),
      remainingUses: limit(r.usosDisponibles, 0),
      minimumAmount:
        r.montoMinimo === undefined
          ? undefined
          : r.montoMinimo === null
            ? null
            : String(number(r.montoMinimo)),
      cancellationPolicy: choice(r.politicaCancelacion, {
        RESTAURAR_EN_CANCELACION: "restore",
        NO_RESTAURAR: "keep",
      }),
    };
  }
  async function readCouponPromotion(id: string, signal: AbortSignal) {
    return (await read(async () => {
      const source = record(
        await request("/promociones/" + encodeURIComponent(id), signal),
      );
      const parent = campaign(source);
      if (parent.id !== id) throw new Error("INVALID_RESPONSE");
      return {
        name: parent.name,
        validFrom: text(source.validFrom),
        validUntil: text(source.validUntil),
      };
    }))!;
  }
  async function enrichCoupon(
    result: CouponView,
    signal: AbortSignal,
  ): Promise<CouponView> {
    return {
      ...result,
      promotion: await readCouponPromotion(result.promotionId, signal),
    };
  }
  async function writeCoupon(
    path: string,
    signal: AbortSignal,
    method: string,
    body?: unknown,
  ): Promise<CouponView> {
    const sent = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const segments = path.split("/").filter(Boolean);
    const isCreate = method === "POST" && segments.length === 1;
    const resourceId = !isCreate && segments.length >= 2 ? decodeURIComponent(segments[1]!) : undefined;
    const statusSuffix = segments[2];
    const expectedStatus = typeof sent.estado === "string" ? choice(sent.estado, { ACTIVO: "active", INACTIVO: "inactive" }) : statusSuffix === "activar" ? "active" : statusSuffix === "desactivar" ? "inactive" : undefined;
    const expectedCode = typeof sent.codigo === "string" ? sent.codigo.trim().toUpperCase() : undefined;
    const matches = (found: CouponView, saved: Record<string, unknown>, code: string | undefined, savedStatus: unknown): boolean => {
      const decimal = (value: string | null | undefined) => { if (value == null || value.trim() === "") return null; const [whole, fraction = ""] = value.trim().replace(",", ".").split("."); return `${whole!.replace(/^0+(?=\d)/, "")}.${fraction.replace(/0+$/, "") || "0"}`; };
      return (!code || found.code.toUpperCase() === code) &&
        (savedStatus === undefined || found.status === savedStatus) &&
        (saved.promocionId === undefined || found.promotionId === saved.promocionId) &&
        (saved.maxUsosGlobal === undefined || found.globalLimit === saved.maxUsosGlobal) &&
        (saved.maxUsosPorCliente === undefined || found.customerLimit === saved.maxUsosPorCliente) &&
        (saved.montoMinimo === undefined || decimal(found.minimumAmount) === decimal(saved.montoMinimo === null ? null : String(saved.montoMinimo))) &&
        (saved.politicaCancelacion === undefined || found.cancellationPolicy === (saved.politicaCancelacion === "RESTAURAR_EN_CANCELACION" ? "restore" : "keep"));
    };
    const reconcile = async (savedEvidence: WriteEvidence): Promise<CouponView | null> => {
      const saved = savedEvidence.payload && typeof savedEvidence.payload === "object" ? savedEvidence.payload as Record<string, unknown> : {};
      const savedCode = savedEvidence.naturalCode;
      const savedStatus = savedEvidence.expectedState && typeof savedEvidence.expectedState === "object" ? (savedEvidence.expectedState as Record<string, unknown>).status : undefined;
      if (savedEvidence.operation === "create" && savedCode) {
        for (let pageNumber = 1; pageNumber <= 1000; pageNumber++) {
          const pageResult = page(await request("/cupones?" + query({ status: "all", page: pageNumber, pageSize: 100 }), signal), coupon);
          if (pageResult.page !== pageNumber) throw new Error("INVALID_PAGE");
          const found = pageResult.items.find(item => item.code.toUpperCase() === savedCode);
          if (found) return matches(found, saved, savedCode, savedStatus) ? found : null;
          if (!pageResult.items.length || pageNumber * 100 >= pageResult.total) return null;
        }
        throw new Error("COUPON_PAGE_LIMIT");
      }
      if (!savedEvidence.resourceId) return null;
      try { const found = coupon(await request("/cupones/" + encodeURIComponent(savedEvidence.resourceId), signal)); return found.id === savedEvidence.resourceId && matches(found, saved, savedCode, savedStatus) ? found : null; }
      catch (error) { if (error instanceof HttpFailure && error.status === 404) return null; throw error; }
    };
    const confirmed = await write(
      isCreate ? `coupon:create:${expectedCode ?? "missing-code"}` : `coupon:resource:${resourceId ?? path}`,
      async () => requireIdentity(coupon(await request(path, signal, method, body)), resourceId),
      true,
      { entity: "coupon", operation: isCreate ? "create" : expectedStatus ? "status" : "update", ...(resourceId ? { resourceId } : {}), ...(expectedCode ? { naturalCode: expectedCode } : {}), payload: body, changedFields: Object.keys(sent), expectedState: { status: expectedStatus, code: expectedCode } },
      reconcile,
    );
    try {
      return await enrichCoupon(confirmed, signal);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof CouponReadError && error.kind !== "unavailable")
        return { ...confirmed, relatedDataAccess: error.kind };
      return { ...confirmed, relatedDataUnavailable: true };
    }
  }
  const coupons: PromotionServices["coupons"] = {
    reconcilePending: async (id, code, s) => {
      const intent = id ? `coupon:resource:${id}` : `coupon:create:${code?.trim().toUpperCase() ?? "missing-code"}`;
      return reconcileStored(intent, async evidence => {
        if (evidence.entity !== "coupon") return null;
        const payload = evidence.payload && typeof evidence.payload === "object" ? evidence.payload as Record<string, unknown> : {};
        const status = evidence.expectedState && typeof evidence.expectedState === "object" ? (evidence.expectedState as Record<string, unknown>).status : undefined;
        const matches = (found: CouponView) => (!evidence.naturalCode || found.code.toUpperCase() === evidence.naturalCode) &&
          (status === undefined || found.status === status) && (payload.promocionId === undefined || found.promotionId === payload.promocionId) &&
          (payload.maxUsosGlobal === undefined || found.globalLimit === payload.maxUsosGlobal) && (payload.maxUsosPorCliente === undefined || found.customerLimit === payload.maxUsosPorCliente) &&
          (payload.montoMinimo === undefined || decimalAmount(found.minimumAmount) === decimalAmount(payload.montoMinimo === null ? null : String(payload.montoMinimo))) &&
          (payload.politicaCancelacion === undefined || found.cancellationPolicy === (payload.politicaCancelacion === "RESTAURAR_EN_CANCELACION" ? "restore" : "keep"));
        if (evidence.operation === "create") {
          for (let current = 1; current <= 1000; current++) {
            const result = page(await request("/cupones?" + query({ status: "all", page: current, pageSize: 100 }), s), coupon);
            if (result.page !== current) throw new Error("INVALID_PAGE");
            const found = result.items.find(item => item.code.toUpperCase() === evidence.naturalCode);
            if (found) return matches(found) ? found : null;
            if (!result.items.length || current * 100 >= result.total) return null;
          }
          throw new Error("COUPON_PAGE_LIMIT");
        }
        if (!evidence.resourceId) return null;
        try {
          const found = coupon(await request("/cupones/" + encodeURIComponent(evidence.resourceId), s));
          return found.id === evidence.resourceId && matches(found) ? found : null;
        } catch (error) { if (error instanceof HttpFailure && error.status === 404) return null; throw error; }
      });
    },
    list: (q, s) =>
      read(async () => {
        const r = record(await request("/cupones?" + query(q), s)),
          meta = record(r.meta);
        const rows = array(r.items).map(coupon);
        const total = integer(meta.total), current = integer(meta.pagina);
        if (current < 1) throw new Error("INVALID_PAGE");
        // This cache and queue belong only to this list operation. Duplicate
        // IDs share the same promise, including its failure; nothing survives
        // a later read or another user's session.
        const parents = new Map<string, ReturnType<typeof readCouponPromotion>>();
        const waiting: (() => void)[] = [];
        let active = 0;
        const parentFor = (id: string) => {
          let pending = parents.get(id);
          if (!pending) {
            pending = (async () => {
              if (active >= 4)
                await new Promise<void>((done) => waiting.push(done));
              else active++;
              try {
                s.throwIfAborted();
                return await readCouponPromotion(id, s);
              } finally {
                const next = waiting.shift();
                if (next) next();
                else active--;
              }
            })();
            parents.set(id, pending);
          }
          return pending;
        };
        return {
          items: await Promise.all(
            rows.map(async (row): Promise<CouponView> => {
              try {
                return { ...row, promotion: await parentFor(row.promotionId) };
              } catch (error) {
                s.throwIfAborted();
                if (error instanceof CouponReadError && error.kind === "unavailable")
                  return { ...row, relatedDataUnavailable: true };
                throw error;
              }
            }),
          ),
          total,
          page: current,
        };
      }).then((r) => r!),
    read: (id, s) =>
      read(async () => {
        const confirmed = requireIdentity(coupon(await request("/cupones/" + encodeURIComponent(id), s)), id);
        try { return await enrichCoupon(confirmed, s); }
        catch (error) {
          s.throwIfAborted();
          if (error instanceof CouponReadError && error.kind !== "unavailable") throw error;
          return { ...confirmed, relatedDataUnavailable: true };
        }
      }, true),
    create: (d, s) => writeCoupon("/cupones", s, "POST", couponDto(d)),
    update: (id, d, s) =>
      writeCoupon(
        "/cupones/" + encodeURIComponent(id),
        s,
        "PATCH",
        couponDto(d),
      ),
    changeStatus: (id, status, s) =>
      writeCoupon(
        "/cupones/" +
          encodeURIComponent(id) +
          (status === "active" ? "/activar" : "/desactivar"),
        s,
        "POST",
      ),
    promotions: (s) =>
      read(async () => {
        const result = [];
        for (let current = 1; ; current++) {
          const p = await campaigns.list(
            { status: "all", kind: "coupon", page: current, pageSize: 100 },
            s,
          );
          result.push(
            ...p.items.map((r) => ({
              id: r.id,
              name: r.name,
              mode: r.configuration.mode as "coupon" | "automatic",
              validFrom: r.configuration.validFrom + ":00-05:00",
              validUntil: r.configuration.validUntil + ":00-05:00",
            })),
          );
          if (p.page * 100 >= p.total || !p.items.length) return result;
          if (current >= 1000) throw new Error("PAGE_LIMIT_EXCEEDED");
        }
      }).then((r) => r!),
  };
  const httpCatalog = createHttpPromotionCatalog(request);
  return {
    dispose: () => { unsubscribe?.(); campaignSnapshots.clear(); ruleSnapshots.clear(); },
    campaigns,
    coupons,
    recommendations,
    catalog: options.catalog ?? {
      products: (signal, retain) =>
        read(() => httpCatalog.products(signal, retain)).then((r) => r!),
      categories: (signal) =>
        read(() => httpCatalog.categories(signal)).then((r) => r!),
    },
  };
}
