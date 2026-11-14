import type {
  PriceSnapshot,
  PriceTarget,
  PricingRepository,
} from "../../pricing/services/pricingRepository";
import { ComboError, type CombosPricingPort, type SkuPrice } from "../types/combos";
import type { AuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";

// Combos reads the SAME Pricing references published by MK-013 (single source of
// economic truth). This adapter never invents a `/skus` endpoint nor matches a
// price by product name: it resolves the exact target by the published SKU
// (`PriceTarget.referenceSku` for a product, `PriceTarget.sku` for a variant).
const DOMAIN_CURRENCY = "PEN";

export interface PricingCombosAdapterOptions {
  pricing: PricingRepository;
  gateway?: AuthenticatedGatewayClient;
}

function targetMatchesSku(target: PriceTarget, sku: string): boolean {
  return target.kind === "product" ? target.referenceSku === sku : target.sku === sku;
}

// "179.00" -> 17900 minor units. Rejects anything that is not a safe amount with
// up to two decimals; never rounds silently.
export function parseMinorAmount(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [units, fraction = ""] = trimmed.split(".");
  const minor = Number(units) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

export class PricingCombosAdapter implements CombosPricingPort {
  private readonly pricing: PricingRepository;
  private readonly gateway?: AuthenticatedGatewayClient;

  constructor(options: PricingCombosAdapterOptions) {
    this.pricing = options.pricing;
    this.gateway = options.gateway;
  }

  // Live read: targets and effective prices are resolved on every call against
  // the shared repository, so a price change in Pricing is reflected immediately
  // and never served from a stale combos snapshot.
  async readCurrent(skus: string[], signal?: AbortSignal): Promise<SkuPrice[]> {
    if (signal?.aborted) throw new DOMException("La consulta fue cancelada.", "AbortError");
    if (this.gateway) return this.readContractPrices(skus, signal);
    const activeSignal = signal ?? new AbortController().signal;
    const targets = await this.pricing.listTargets(activeSignal);
    const result = await Promise.all(skus.map(async sku => {
      const matches = targets.filter((target) => targetMatchesSku(target, sku));
      if (matches.length === 0) return null;
      if (matches.length > 1) {
        throw new ComboError(
          "pricing_unavailable",
          `Hay más de una referencia de Pricing publicada para el SKU ${sku}.`,
        );
      }
      const target = matches[0]!;
      const snapshot = await this.pricing.read({ targetId: target.id, channel: "global" }, activeSignal);
      // A target without an effective price at the demo clock is omitted, never
      // invented as zero: consumers detect the gap by the missing SKU.
      if (!snapshot) return null;
      return this.toSkuPrice(target, sku, snapshot);
    }));
    return result.filter((price): price is SkuPrice => price !== null);
  }

  private async readContractPrices(skus: string[], signal?: AbortSignal): Promise<SkuPrice[]> {
    const unique = [...new Set(skus)];
    const rows: unknown[] = [];
    const commaSkus = unique.filter((sku) => sku.includes(","));
    const batchSkus = unique.filter((sku) => !sku.includes(","));
    for (let offset = 0; offset < batchSkus.length; offset += 100) {
      const params = new URLSearchParams({ skus: batchSkus.slice(offset, offset + 100).join(",") });
      rows.push(...await this.readPriceResponse(`/api/v1/precios?${params}`, signal));
    }
    for (const sku of commaSkus) rows.push(...await this.readPriceResponse(`/api/v1/precios/skus/${encodeURIComponent(sku)}`, signal));
    const bySku = new Map<string, SkuPrice>();
    for (const value of rows) {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new ComboError("pricing_unavailable", "Pricing devolvió una referencia de SKU inválida.");
      const dto = value as Record<string, unknown>;
      if (typeof dto.sku !== "string" || !unique.includes(dto.sku) || bySku.has(dto.sku)) throw new ComboError("pricing_unavailable", "Pricing devolvió una identidad de SKU inesperada o duplicada.");
      bySku.set(dto.sku, this.fromContractPrice(dto));
    }
    return unique.flatMap((sku) => bySku.has(sku) ? [bySku.get(sku)!] : []);
  }

  private async readPriceResponse(path: string, signal?: AbortSignal): Promise<unknown[]> {
    signal?.throwIfAborted();
    const response = await this.gateway!.request(path, { method: "GET", signal });
    if (!response.ok) {
      if (path.includes("/precios/skus/") && response.status === 404) {
        const problem: unknown = await response.clone().json().catch(() => null);
        if (problem && typeof problem === "object" && (problem as Record<string, unknown>).code === "PRECIO_NO_ENCONTRADO") return [];
      }
      throw new ComboError("pricing_unavailable", `Pricing no pudo consultar los precios (HTTP ${response.status}).`);
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new ComboError("pricing_unavailable", `Pricing devolvió una respuesta incompatible (HTTP ${response.status}).`);
    const body: unknown = await response.json();
    if (path.includes("/precios?") ) {
      if (!body || typeof body !== "object" || !Array.isArray((body as { items?: unknown }).items)) throw new ComboError("pricing_unavailable", "Pricing devolvió una lista de precios inválida.");
      return (body as { items: unknown[] }).items;
    }
    return [body];
  }

  private fromContractPrice(dto: Record<string, unknown>): SkuPrice {
    const sku = dto.sku as string;
    const regularMinor = typeof dto.precio_regular === "number" ? parseMinorAmount(String(dto.precio_regular)) : null;
    const offerMinor = dto.precio_oferta === null || dto.precio_oferta === undefined ? null : typeof dto.precio_oferta === "number" ? parseMinorAmount(String(dto.precio_oferta)) : null;
    if (regularMinor === null || regularMinor <= 0 || (dto.precio_oferta !== null && dto.precio_oferta !== undefined && (offerMinor === null || offerMinor <= 0)) ||
      typeof dto.currency !== "string" || dto.currency.trim().length !== 3 ||
      (dto.channel_id !== null && typeof dto.channel_id !== "string") || !Number.isSafeInteger(dto.price_version) || Number(dto.price_version) < 0 ||
      typeof dto.vigencia_id !== "string" || !dto.vigencia_id.trim() || (dto.origen !== "PRODUCTO" && dto.origen !== "SKU_OVERRIDE") ||
      typeof dto.valid_from !== "string" || !Number.isFinite(Date.parse(dto.valid_from)) ||
      (dto.valid_until !== null && dto.valid_until !== undefined && (typeof dto.valid_until !== "string" || !Number.isFinite(Date.parse(dto.valid_until)) || Date.parse(dto.valid_until) <= Date.parse(dto.valid_from)))) {
      throw new ComboError("pricing_unavailable", `Pricing devolvió vigencia incompatible para ${sku}.`);
    }
    return { sku, regularMinor, offerMinor, currency: dto.currency, channelId: dto.channel_id as string | null, priceVersion: Number(dto.price_version), validityId: dto.vigencia_id, validFrom: dto.valid_from, validUntil: (dto.valid_until as string | null | undefined) ?? null };
  }

  private toSkuPrice(target: PriceTarget, sku: string, snapshot: PriceSnapshot): SkuPrice {
    const price = snapshot.price;
    if (price.currency !== DOMAIN_CURRENCY) {
      throw new ComboError(
        "pricing_unavailable",
        `La referencia de Pricing de ${sku} no está publicada en ${DOMAIN_CURRENCY}.`,
      );
    }
    const regularMinor = parseMinorAmount(price.regular);
    if (regularMinor === null || regularMinor <= 0) {
      throw new ComboError("pricing_unavailable", `El precio regular de ${sku} no es un importe válido.`);
    }
    const offerMinor = price.offer === null ? null : parseMinorAmount(price.offer);
    if (price.offer !== null && (offerMinor === null || offerMinor <= 0)) {
      throw new ComboError("pricing_unavailable", `La oferta de Pricing de ${sku} no es un importe válido.`);
    }
    if (!Number.isSafeInteger(price.version) || price.version < 0) {
      throw new ComboError("pricing_unavailable", `La versión de precio de ${sku} no es válida.`);
    }
    if (!price.validFrom || !Number.isFinite(Date.parse(price.validFrom))) {
      throw new ComboError("pricing_unavailable", `La vigencia de ${sku} no es válida.`);
    }
    return {
      sku,
      regularMinor,
      offerMinor,
      currency: price.currency,
      channelId: null,
      priceVersion: price.version,
      validityId: `vigencia-${target.id}-${price.version}`,
      validFrom: price.validFrom,
      validUntil: price.validUntil,
    };
  }
}
