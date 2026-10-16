export type ComboStatus = "ACTIVO" | "INACTIVO";
export type AvailabilityFreshness = "ACTUALIZADA" | "DESACTUALIZADA" | "INCOMPLETA";

export interface ComboAvailability {
  verifiable: boolean;
  quantity: number | null;
  freshness: AvailabilityFreshness;
  calculatedAt: string | null;
}

export interface ComboComponent {
  sku: string;
  productName: string;
  quantity: number;
  regularUnitMinor: number | null;
  publicUnitMinor: number | null;
}

export interface Combo {
  id: string;
  name: string;
  description: string | null;
  status: ComboStatus;
  priceMinor: number;
  version: number;
  components: ComboComponent[];
  availability: ComboAvailability;
}

export interface ComboPage {
  items: Combo[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ComboQuery {
  status: ComboStatus | "TODOS";
  page: number;
  pageSize: number;
  scenario?: string;
}

export interface ProductSummary {
  productId: string;
  name: string;
  hasVariants: boolean;
  active: boolean;
  baseSku: string | null;
}

export interface ProductDetail extends ProductSummary {
  variants: { sku: string; label: string; active: boolean }[];
}

export interface ComponentDraft {
  sku: string;
  productName: string;
  quantity: number;
}

export interface ComboDraft {
  name: string;
  description: string;
  components: ComponentDraft[];
  price: string;
}

export interface SkuPrice {
  sku: string;
  regularMinor: number | null;
  offerMinor: number | null;
  currency: string;
  channelId: string | null;
  priceVersion: number;
  validityId: string;
  validFrom: string;
  validUntil: string | null;
}

export interface ComboPayload {
  name: string;
  description: string | null;
  components: { sku: string; quantity: number }[];
  priceMinor: number;
  version?: number;
}

export interface CombosRepository {
  list(query: ComboQuery, signal?: AbortSignal): Promise<ComboPage>;
  getById(id: string, signal?: AbortSignal): Promise<Combo | null>;
  create(payload: ComboPayload, scenario?: string): Promise<Combo>;
  update(id: string, payload: ComboPayload, scenario?: string): Promise<Combo>;
  deactivate(id: string): Promise<Combo>;
}

export interface CombosCatalogPort {
  listProducts(query: string, signal?: AbortSignal): Promise<ProductSummary[]>;
  getProduct(productId: string, signal?: AbortSignal): Promise<ProductDetail | null>;
}

export interface CombosPricingPort {
  readCurrent(skus: string[], signal?: AbortSignal): Promise<SkuPrice[]>;
}

export class ComboError extends Error {
  public readonly code: string;

  constructor(
    public readonly kind:
      | "unavailable"
      | "not_found"
      | "price_invalid"
      | "version_conflict"
      | "duplicate_sku"
      | "nested_combo"
      | "invalid_components"
      | "invalid_quantity"
      | "sku_invalid"
      | "sku_not_found"
      | "pricing_unavailable"
      | "unknown",
    message: string,
    public readonly currentVersion?: Combo,
  ) {
    super(message);
    this.name = "ComboError";
    this.code = {
      unavailable: "SERVICIO_NO_DISPONIBLE",
      not_found: "COMBO_NO_ENCONTRADO",
      price_invalid: "COMBO_PRECIO_INVALIDO",
      version_conflict: "VERSION_CONFLICT",
      duplicate_sku: "COMBO_COMPONENTE_DUPLICADO",
      nested_combo: "COMBO_ANIDADO_NO_PERMITIDO",
      invalid_components: "COMBO_COMPONENTES_INSUFICIENTES",
      invalid_quantity: "CANTIDAD_INVALIDA",
      sku_invalid: "SKU_INACTIVO",
      sku_not_found: "SKU_NO_ENCONTRADO",
      pricing_unavailable: "SERVICIO_NO_DISPONIBLE",
      unknown: "ERROR_INTERNO",
    }[kind];
  }
}
