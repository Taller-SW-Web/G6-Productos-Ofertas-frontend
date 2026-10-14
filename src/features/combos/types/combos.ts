export type ComboStatus = "ACTIVO" | "INACTIVO";

export type FreshnessStatus =
  | "ACTUALIZADA"
  | "DESACTUALIZADA"
  | "INCOMPLETA"
  | "NO_VERIFICABLE"
  | "ERROR_CONSULTA";

export interface CandidateVariant {
  sku: string;
  label: string;
  status: "ACTIVA" | "INACTIVA" | "BORRADOR";
}

export interface CandidateProduct {
  productId: string;
  name: string;
  skuBase: string;
  hasVariants: boolean;
  status: "ACTIVO" | "INACTIVO" | "BORRADOR";
  variants: CandidateVariant[];
}

export interface ComboComponentItem {
  sku: string;
  quantity: number;
  productName?: string;
  variantLabel?: string;
  regularPrice?: number;
  publicPrice?: number;
  currency?: string;
}

export interface ComboView {
  comboId: string;
  name: string;
  description: string | null;
  status: ComboStatus;
  price: number;
  components: ComboComponentItem[];
  informativeAvailability: number | null;
  calculatedAt: string | null;
  freshness: FreshnessStatus | null;
  version: number;
}

export interface ComboSummaryItem {
  comboId: string;
  name: string;
  price: number;
  componentsCount: number;
  status: ComboStatus;
  informativeAvailability: number | null;
  freshness: FreshnessStatus | null;
  version: number;
}

export interface ComboPageResult {
  items: ComboSummaryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ComboListQuery {
  status?: "all" | ComboStatus;
  page: number;
  pageSize: number;
}

export interface CreateComboPayload {
  nombre: string;
  descripcion?: string | null;
  componentes: {
    sku: string;
    quantity: number;
  }[];
  precioCombo: number;
}

export interface UpdateComboPayload {
  nombre: string;
  descripcion?: string | null;
  componentes: {
    sku: string;
    quantity: number;
  }[];
  precioCombo: number;
  version: number;
}

export interface ComponentPricingSnapshot {
  sku: string;
  regularPrice: number;
  publicPrice: number;
  currency: string;
  available: boolean;
}

export interface EconomicComparisonResult {
  regularSum: number;
  publicSum: number;
  comboPrice: number;
  isValidBenefit: boolean;
  isPricingComplete: boolean;
  currency: string;
  message?: string;
}
