// Domain types and ports for Catalog feature (MK-003)
// Decoupled from HTTP DTOs and mock implementations.

export type ProductStatus = "BORRADOR" | "ACTIVO" | "INACTIVO";
export type VariantStatus = "BORRADOR" | "ACTIVA" | "INACTIVA";
export type PreparationStatus = "PENDING" | "COMPLETED" | "REJECTED";
export type SaleModel = "simple" | "variants";

export interface PhysicalProfile {
  pesoKg: number;
  largoCm: number;
  anchoCm: number;
  altoCm: number;
}

export interface ProductAttributeValue {
  caracteristicaId: string;
  nombre: string;
  tipo: "TEXTO" | "NUMERO" | "LISTA";
  valor: string | number;
  unidad?: string;
}

export interface ProductImageRef {
  url: string;
  principal?: boolean;
}

export interface VariantPreparation {
  variantId: string;
  sku: string;
  inventario: {
    status: PreparationStatus;
    manualRetryAllowed: boolean;
    code?: string | null;
  };
}

export interface ProductPreparationView {
  productId: string;
  hasVariants: boolean;
  pricing: {
    status: PreparationStatus;
    manualRetryAllowed: boolean;
    code?: string | null;
  };
  inventario: {
    status: PreparationStatus;
    manualRetryAllowed: boolean;
    code?: string | null;
  } | null; // null for variant parent
  variantes: VariantPreparation[];
}

export interface VariantSummaryView {
  variantId: string;
  sku: string;
  attributesSummary: string;
  status: VariantStatus;
  preparationStatus: PreparationStatus;
  manualRetryAllowed: boolean;
}

export interface ProductView {
  id: string;
  name: string;
  skuBase: string;
  hasVariants: boolean;
  categoryId: string;
  categoryName: string;
  typeId: string;
  typeName: string;
  brandId: string;
  brandName: string;
  status: ProductStatus;
  preparationSummary: "COMPLETED" | "PENDING" | "REJECTED" | "PARTIAL";
  imageUrl?: string;
  catalogVersion: number;
  priceInitial?: number;
}

export interface ProductDetailView extends ProductView {
  description: string;
  images: ProductImageRef[];
  attributes: ProductAttributeValue[];
  physicalProfile: Partial<PhysicalProfile> | null;
  preparation: ProductPreparationView;
  variants: VariantSummaryView[];
  publishedCommercially?: boolean;
}

export interface CatalogQuery {
  q?: string;
  categoryId?: string;
  typeId?: string;
  saleModel?: "all" | "simple" | "variants";
  status?: "all" | ProductStatus;
  page: number;
  pageSize: number;
}

export interface CatalogPageResult {
  items: ProductView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductCreatePayload {
  nombre: string;
  descripcion: string;
  categoriaId: string;
  tipoProductoId: string;
  marcaId: string;
  skuBase: string;
  tieneVariantes: boolean;
  precioBaseInicial: number;
  atributos?: ProductAttributeValue[];
  imagenes?: ProductImageRef[];
  perfilFisico?: Partial<PhysicalProfile> | null;
}

export interface ProductUpdatePayload {
  nombre: string;
  descripcion: string;
  categoriaId: string;
  marcaId: string;
  tipoProductoId?: string; // only if eligible under Q-06
  atributos?: ProductAttributeValue[];
  imagenes?: ProductImageRef[];
  perfilFisico?: Partial<PhysicalProfile> | null;
  catalogVersion: number;
}

export interface StateMutationPayload {
  motivo?: string | null;
  catalogVersion?: number | null;
}

export interface RetryPreparationPayload {
  dependencia: "PRICING" | "INVENTARIO";
  motivo?: string;
}

export class CatalogError extends Error {
  constructor(
    public readonly kind:
      | "validation"
      | "duplicate_sku"
      | "invalid_master"
      | "invalid_physical"
      | "version_conflict"
      | "not_found"
      | "active_rejected"
      | "prep_not_retryable"
      | "unknown"
      | "forbidden"
      | "session",
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

export interface CatalogRepository {
  list(
    query: CatalogQuery,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<CatalogPageResult>;
  getById(
    id: string,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView | null>;
  create(
    payload: ProductCreatePayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView>;
  update(
    id: string,
    payload: ProductUpdatePayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView>;
  activate(
    id: string,
    payload?: StateMutationPayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView>;
  deactivate(
    id: string,
    payload?: StateMutationPayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView>;
  reactivate(
    id: string,
    payload?: StateMutationPayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView>;
  getPreparation(
    id: string,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductPreparationView>;
  retryPreparation(
    id: string,
    payload: RetryPreparationPayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<{ accepted: boolean; message: string }>;
}
