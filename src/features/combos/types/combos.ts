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

export interface ProductCandidate {
  productId: string;
  name: string;
  hasVariants: boolean;
  active: boolean;
  baseSku: string | null;
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
  publicMinor: number | null;
  currency: "PEN";
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
  listProducts(signal?: AbortSignal): Promise<ProductCandidate[]>;
  getProduct(productId: string, signal?: AbortSignal): Promise<ProductCandidate | null>;
}

export interface CombosPricingPort {
  readCurrent(skus: string[], signal?: AbortSignal): Promise<SkuPrice[]>;
}

export class ComboError extends Error {
  constructor(
    public readonly kind:
      | "unavailable"
      | "not_found"
      | "price_invalid"
      | "version_conflict"
      | "duplicate_sku"
      | "invalid_components"
      | "pricing_unavailable"
      | "unknown",
    message: string,
    public readonly currentVersion?: Combo,
  ) {
    super(message);
    this.name = "ComboError";
  }
}
