import type {
  CatalogPageResult,
  CatalogQuery,
  CatalogRepository,
  ProductCreatePayload,
  ProductDetailView,
  ProductPreparationView,
  ProductUpdatePayload,
  RetryPreparationPayload,
  StateMutationPayload,
  VariantCreatePayload,
  VariantDetailView,
  VariantMutationResult,
  VariantPageResult,
  VariantQuery,
  VariantUpdatePayload,
  ProductAttributeValue,
} from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { initialProducts, initialVariants } from "../mocks/catalogFixtures";
import { initialCategories, initialBrands, initialProductTypes, attributeSchemasByType } from "../mocks/taxonomyFixtures";
import {
  normalizePhysicalProfile,
  isPhysicalProfileComplete,
  hasValidPhysicalValues,
} from "../services/catalogPresentation";

export class MockCatalogRepository implements CatalogRepository {
  private products: ProductDetailView[] = [];
  private variants: VariantDetailView[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.products = JSON.parse(JSON.stringify(initialProducts));
    this.variants = JSON.parse(JSON.stringify(initialVariants));
  }

  // Test/demo input representing a confirmed asynchronous result; never an HTTP endpoint.
  receiveVariantInventoryResult(productId: string, variantId: string, status: "COMPLETED" | "REJECTED", manualRetryAllowed = false) {
    const variant = this.variants.find(v => v.productId === productId && v.variantId === variantId);
    if (!variant) throw new CatalogError("not_found", "Variante no encontrada.");
    if (variant.inventoryPreparationStatus === "COMPLETED") return;
    variant.inventoryPreparationStatus = status;
    variant.inventoryStatus = status;
    variant.inventoryManualRetryAllowed = status === "REJECTED" && manualRetryAllowed;
  }

  async list(
    query: CatalogQuery,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<CatalogPageResult> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "list-loading" || scenario === "loading") {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    if (scenario === "list-error" || scenario === "error") {
      throw new CatalogError(
        "unknown",
        "No se pudieron consultar los productos. Los filtros se conservan.",
      );
    }
    if (scenario === "forbidden") {
      throw new CatalogError(
        "forbidden",
        "No cuentas con permisos suficientes para acceder a la gestión de productos.",
      );
    }
    if (scenario === "session") {
      throw new CatalogError(
        "session",
        "Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.",
      );
    }
    if (scenario === "list-empty" || scenario === "empty") {
      return { items: [], total: 0, page: 1, pageSize: query.pageSize || 10 };
    }
    if (scenario === "list-no-results" || scenario === "no-results") {
      return { items: [], total: 0, page: query.page || 1, pageSize: query.pageSize || 10 };
    }

    let filtered = [...this.products];

    if (query.q && query.q.trim()) {
      const term = query.q.trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.skuBase.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term),
      );
    }

    if (query.categoryId && query.categoryId !== "all") {
      filtered = filtered.filter((p) => p.categoryId === query.categoryId);
    }

    if (query.typeId && query.typeId !== "all") {
      filtered = filtered.filter((p) => p.typeId === query.typeId);
    }

    if (query.saleModel && query.saleModel !== "all") {
      filtered = filtered.filter((p) =>
        query.saleModel === "variants" ? p.hasVariants : !p.hasVariants,
      );
    }

    if (query.status && query.status !== "all") {
      filtered = filtered.filter((p) => p.status === query.status);
    }

    const total = filtered.length;
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.max(1, query.pageSize || 10);
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map((p) => ({
      id: p.id,
      name: p.name,
      skuBase: p.skuBase,
      hasVariants: p.hasVariants,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      typeId: p.typeId,
      typeName: p.typeName,
      brandId: p.brandId,
      brandName: p.brandName,
      status: p.status,
      preparationSummary: p.preparationSummary,
      imageUrl: p.imageUrl,
      catalogVersion: p.catalogVersion,
      priceInitial: p.priceInitial,
    }));

    return { items, total, page, pageSize };
  }

  async getById(
    id: string,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView | null> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "loading") {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    if (scenario === "error") {
      throw new CatalogError(
        "unknown",
        "Error al consultar el detalle del producto.",
      );
    }
    if (scenario === "product-not-found" || scenario === "missing") {
      return null;
    }

    const found = this.products.find((p) => p.id === id);
    if (!found) return null;

    const cloned: ProductDetailView = JSON.parse(JSON.stringify(found));

    // Authoritative variant synchronization for parent product
    if (cloned.hasVariants) {
      const vars = this.variants.filter((v) => v.productId === id);
      cloned.variants = vars.map((v) => ({
        variantId: v.variantId,
        sku: v.sku,
        attributesSummary: v.identifyingAttributes
          .map((a) => `${a.nombre}: ${a.valor}`)
          .join(" · "),
        status: v.status,
        preparationStatus: v.inventoryPreparationStatus,
        manualRetryAllowed: v.inventoryManualRetryAllowed,
      }));
      cloned.preparation.variantes = vars.map((v) => ({
        variantId: v.variantId,
        sku: v.sku,
        inventario: {
          status: v.inventoryPreparationStatus,
          manualRetryAllowed: v.inventoryManualRetryAllowed,
          code: v.inventoryPreparationCode,
        },
      }));
    }

    if (scenario === "prep-partial") {
      cloned.preparationSummary = "PARTIAL";
      cloned.preparation.pricing.status = "COMPLETED";
      if (cloned.preparation.inventario) {
        cloned.preparation.inventario.status = "PENDING";
        cloned.preparation.inventario.manualRetryAllowed = false;
      }
    } else if (scenario === "prep-pending") {
      cloned.preparationSummary = "PENDING";
      cloned.preparation.pricing.status = "PENDING";
      cloned.preparation.pricing.manualRetryAllowed = false;
      if (cloned.preparation.inventario) {
        cloned.preparation.inventario.status = "PENDING";
        cloned.preparation.inventario.manualRetryAllowed = false;
      }
    } else if (scenario === "prep-rejected") {
      cloned.preparationSummary = "REJECTED";
      cloned.preparation.pricing.status = "COMPLETED";
      if (cloned.preparation.inventario) {
        cloned.preparation.inventario.status = "REJECTED";
        cloned.preparation.inventario.code = "INV_SKU_INITIALIZATION_FAILED";
        cloned.preparation.inventario.manualRetryAllowed = true;
      }
    } else if (scenario === "parent-no-active-variants" && cloned.hasVariants) {
      cloned.variants.forEach((v) => {
        v.status = "INACTIVA";
      });
    }

    return cloned;
  }

  async create(
    payload: ProductCreatePayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "create-duplicate-sku") {
      throw new CatalogError(
        "duplicate_sku",
        `El SKU base "${payload.skuBase}" ya está registrado en el catálogo.`,
        { skuBase: "SKU ya existe" },
      );
    }
    if (scenario === "create-invalid-master") {
      throw new CatalogError(
        "invalid_master",
        "La categoría o marca seleccionada no es válida en Taxonomía.",
      );
    }
    if (scenario === "create-invalid-physical") {
      throw new CatalogError(
        "invalid_physical",
        "Las medidas y peso físico deben ser mayores que cero.",
      );
    }
    if (scenario === "write-unknown") {
      throw new CatalogError(
        "unknown",
        "No se recibió confirmación del servidor. Consulta el listado antes de reenviar.",
      );
    }

    // Required business validations
    if (!payload.nombre || !payload.nombre.trim()) {
      throw new CatalogError("validation", "El nombre del producto es obligatorio.");
    }
    if (!payload.descripcion || !payload.descripcion.trim()) {
      throw new CatalogError("validation", "La descripción es obligatoria.");
    }
    if (!payload.skuBase || !payload.skuBase.trim()) {
      throw new CatalogError("validation", "El SKU base es obligatorio.");
    }
    if (!payload.precioBaseInicial || payload.precioBaseInicial <= 0) {
      throw new CatalogError("validation", "El precio base inicial debe ser mayor que cero.");
    }

    // Check SKU duplicate in session
    const existsSku = this.products.some(
      (p) => p.skuBase.toUpperCase() === payload.skuBase.trim().toUpperCase(),
    );
    if (existsSku) {
      throw new CatalogError(
        "duplicate_sku",
        `El SKU base "${payload.skuBase}" ya está en uso.`,
        { skuBase: "SKU base duplicado" },
      );
    }

    // Physical profile validation for simple products: if values supplied, must be > 0
    if (!payload.tieneVariantes && payload.perfilFisico) {
      if (!hasValidPhysicalValues(payload.perfilFisico)) {
        throw new CatalogError(
          "invalid_physical",
          "Todos los valores del perfil físico suministrados deben ser mayores que cero.",
        );
      }
    }

    const category = initialCategories.find((c) => c.id === payload.categoriaId);
    const brand = initialBrands.find((b) => b.id === payload.marcaId);
    const pType = initialProductTypes.find((t) => t.id === payload.tipoProductoId);

    const newId = `PROD-${Date.now().toString().slice(-4)}`;
    const newProduct: ProductDetailView = {
      id: newId,
      name: payload.nombre.trim(),
      skuBase: payload.skuBase.trim().toUpperCase(),
      description: payload.descripcion.trim(),
      hasVariants: payload.tieneVariantes,
      categoryId: payload.categoriaId,
      categoryName: category?.nombre || "Categoría",
      typeId: payload.tipoProductoId,
      typeName: pType?.nombre || "Tipo",
      brandId: payload.marcaId,
      brandName: brand?.nombre || "Marca",
      status: "BORRADOR",
      preparationSummary: "PENDING",
      imageUrl: payload.imagenes?.[0]?.url,
      catalogVersion: 1,
      priceInitial: payload.precioBaseInicial,
      publishedCommercially: false,
      images: payload.imagenes || [],
      attributes: payload.atributos || [],
      physicalProfile: payload.tieneVariantes
        ? null
        : normalizePhysicalProfile(payload.perfilFisico),
      preparation: {
        productId: newId,
        hasVariants: payload.tieneVariantes,
        pricing: {
          status: "PENDING",
          manualRetryAllowed: false,
          code: null,
        },
        inventario: payload.tieneVariantes
          ? null
          : {
              status: "PENDING",
              manualRetryAllowed: false,
              code: null,
            },
        variantes: [],
      },
      variants: [],
    };

    this.products.unshift(newProduct);
    return JSON.parse(JSON.stringify(newProduct));
  }

  async update(
    id: string,
    payload: ProductUpdatePayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "edit-version-conflict" || scenario === "conflict") {
      throw new CatalogError(
        "version_conflict",
        "Conflicto de concurrencia: el producto fue modificado por otro gestor. Recarga para sincronizar.",
      );
    }
    if (scenario === "edit-active-rejected") {
      throw new CatalogError(
        "active_rejected",
        "El producto activo no puede perder los requisitos obligatorios de publicación.",
      );
    }
    if (scenario === "write-unknown") {
      throw new CatalogError(
        "unknown",
        "No se recibió respuesta concluyente del servidor al guardar cambios.",
      );
    }

    const idx = this.products.findIndex((p) => p.id === id);
    if (idx === -1) throw new CatalogError("not_found", "Producto no encontrado.");

    const current = this.products[idx];
    if (!current) throw new CatalogError("not_found", "Producto no encontrado.");

    // Version conflict validation
    if (payload.catalogVersion !== undefined && payload.catalogVersion !== current.catalogVersion) {
      throw new CatalogError(
        "version_conflict",
        `Conflicto de versión (esperada: ${current.catalogVersion}, recibida: ${payload.catalogVersion}).`,
      );
    }

    // If product is ACTIVO, validate that it does not lose activation requirements
    if (current.status === "ACTIVO") {
      if (!payload.nombre?.trim() || !payload.descripcion?.trim()) {
        throw new CatalogError(
          "active_rejected",
          "Un producto activo requiere nombre y descripción completos.",
        );
      }
      if (!current.hasVariants) {
        if (!isPhysicalProfileComplete(payload.perfilFisico)) {
          throw new CatalogError(
            "active_rejected",
            "Un producto simple activo requiere las 4 medidas físicas completas (peso, largo, ancho, alto).",
          );
        }
      }
    }

    const category = initialCategories.find((c) => c.id === payload.categoriaId);
    const brand = initialBrands.find((b) => b.id === payload.marcaId);

    current.name = payload.nombre.trim();
    current.description = payload.descripcion.trim();
    current.categoryId = payload.categoriaId;
    current.categoryName = category?.nombre || current.categoryName;
    current.brandId = payload.marcaId;
    current.brandName = brand?.nombre || current.brandName;

    // Type correction (Q-06): only allowed in eligible conditions
    if (
      payload.tipoProductoId &&
      payload.tipoProductoId !== current.typeId &&
      current.status === "BORRADOR" &&
      !current.hasVariants &&
      !current.publishedCommercially
    ) {
      const newType = initialProductTypes.find((t) => t.id === payload.tipoProductoId);
      current.typeId = payload.tipoProductoId;
      current.typeName = newType?.nombre || current.typeName;
    }

    if (payload.atributos) current.attributes = payload.atributos;
    if (payload.imagenes) {
      current.images = payload.imagenes;
      current.imageUrl = payload.imagenes[0]?.url || undefined;
    }
    if (!current.hasVariants && payload.perfilFisico !== undefined) {
      if (!hasValidPhysicalValues(payload.perfilFisico)) {
        throw new CatalogError(
          "invalid_physical",
          "Todos los valores del perfil físico suministrados deben ser mayores que cero.",
        );
      }
      current.physicalProfile = normalizePhysicalProfile(payload.perfilFisico);
    }

    current.catalogVersion += 1;

    return JSON.parse(JSON.stringify(current));
  }

  async activate(
    id: string,
    _payload?: StateMutationPayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "activate-missing-requirements") {
      throw new CatalogError(
        "validation",
        "No se puede activar el producto: faltan requisitos obligatorios de publicación.",
      );
    }
    if (scenario === "write-unknown") {
      throw new CatalogError(
        "unknown",
        "Resultado indeterminado de activación. No se repetirá automáticamente.",
      );
    }

    const product = this.products.find((p) => p.id === id);
    if (!product) throw new CatalogError("not_found", "Producto no encontrado.");

    // Validation rules according to SPEC-003 / HU-003:
    // 1. Pricing must be COMPLETED
    if (product.preparation.pricing.status !== "COMPLETED") {
      throw new CatalogError(
        "validation",
        "La inicialización de Pricing debe estar completada antes de activar.",
      );
    }

    // 2. Simple product needs completed Inventory and all 4 physical values
    if (!product.hasVariants) {
      if (product.preparation.inventario?.status !== "COMPLETED") {
        throw new CatalogError(
          "validation",
          "La inicialización de Inventario del SKU simple debe estar completada.",
        );
      }
      if (!isPhysicalProfileComplete(product.physicalProfile)) {
        throw new CatalogError(
          "validation",
          "El producto simple requiere peso, largo, ancho y alto positivos antes de activar.",
        );
      }
    } else {
      // 3. Variant parent needs at least one active variant and all active variants prepared
      const vars = this.variants.filter((v) => v.productId === id);
      const activeVariants = vars.filter((v) => v.status === "ACTIVA");
      if (activeVariants.length === 0) {
        throw new CatalogError(
          "validation",
          "El producto con variantes requiere al menos una variante activa para publicarse.",
        );
      }
      const allActivePrepared = activeVariants.every(
        (v) => v.inventoryPreparationStatus === "COMPLETED",
      );
      if (!allActivePrepared) {
        throw new CatalogError(
          "validation",
          "Todas las variantes activas deben tener su preparación de inventario completada.",
        );
      }
    }

    // 4. Must have valid image
    if (!product.images || product.images.length === 0) {
      throw new CatalogError("validation", "Se requiere al menos una imagen de publicación.");
    }

    // 5. Must satisfy required attributes of product type
    const schemas = attributeSchemasByType[product.typeId] || [];
    const requiredSchemas = schemas.filter((s) => s.obligatorio);
    for (const req of requiredSchemas) {
      const attr = product.attributes.find((a) => a.caracteristicaId === req.caracteristicaId);
      if (!attr || attr.valor === undefined || attr.valor === "") {
        throw new CatalogError(
          "validation",
          `La característica obligatoria "${req.nombre}" debe estar completada.`,
        );
      }
    }

    product.status = "ACTIVO";
    product.catalogVersion += 1;
    return JSON.parse(JSON.stringify(product));
  }

  async deactivate(
    id: string,
    _payload?: StateMutationPayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "write-unknown") {
      throw new CatalogError(
        "unknown",
        "Resultado indeterminado de desactivación. Consulta el estado antes de reintentar.",
      );
    }

    const product = this.products.find((p) => p.id === id);
    if (!product) throw new CatalogError("not_found", "Producto no encontrado.");

    product.status = "INACTIVO";
    product.catalogVersion += 1;
    // Note: variants keep their individual statuses!
    return JSON.parse(JSON.stringify(product));
  }

  async reactivate(
    id: string,
    payload?: StateMutationPayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductDetailView> {
    // Reactivate requires same conditions as activate
    return this.activate(id, payload, scenario, signal);
  }

  async getPreparation(
    id: string,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<ProductPreparationView> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const product = await this.getById(id, scenario, signal);
    if (!product) throw new CatalogError("not_found", "Producto no encontrado.");
    return product.preparation;
  }

  async retryPreparation(
    id: string,
    payload: RetryPreparationPayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<{ accepted: boolean; message: string }> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "prep-not-retryable") {
      throw new CatalogError(
        "prep_not_retryable",
        "HTTP 409 PREPARACION_NO_REINTENTABLE: la dependencia ya está en curso o no es reintentable.",
      );
    }

    const product = this.products.find((p) => p.id === id);
    if (!product) throw new CatalogError("not_found", "Producto no encontrado.");

    if (payload.dependencia === "PRICING") {
      if (product.preparation.pricing.status === "COMPLETED" || !product.preparation.pricing.manualRetryAllowed) {
        throw new CatalogError(
          "prep_not_retryable",
          "HTTP 409: La inicialización de Pricing ya se encuentra completada.",
        );
      }
      product.preparation.pricing.status = "PENDING";
      product.preparation.pricing.manualRetryAllowed = false;
    } else if (payload.dependencia === "INVENTARIO") {
      if (product.hasVariants) {
        throw new CatalogError(
          "prep_not_retryable",
          "HTTP 409: El producto con variantes no admite reintento de inventario en el padre.",
        );
      }
      if (!product.preparation.inventario || product.preparation.inventario.status === "COMPLETED" || !product.preparation.inventario.manualRetryAllowed) {
        throw new CatalogError(
          "prep_not_retryable",
          "HTTP 409: El inventario simple ya está completado.",
        );
      }
      if (product.preparation.inventario) {
        product.preparation.inventario.status = "PENDING";
        product.preparation.inventario.manualRetryAllowed = false;
      }
    }

    return {
      accepted: true,
      message: "HTTP 202: Reintento admitido. Nuevo ciclo de preparación en curso.",
    };
  }

  // ==========================================
  // MK-004: Variant Operations
  // ==========================================

  async listVariants(
    productId: string,
    query?: VariantQuery,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<VariantPageResult> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "list-loading" || scenario === "loading") {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    if (scenario === "list-error" || scenario === "error") {
      throw new CatalogError(
        "unknown",
        "Error al consultar las variantes del producto. Los filtros se conservan.",
      );
    }

    const parent = this.products.find((p) => p.id === productId);
    if (!parent) {
      throw new CatalogError("not_found", "Producto padre no encontrado.");
    }
    if (!parent.hasVariants || scenario === "parent-simple") {
      throw new CatalogError(
        "product_not_variants",
        "El producto simple no admite variantes.",
      );
    }

    if (scenario === "list-empty" || scenario === "empty") {
      return { items: [], total: 0, page: 1, pageSize: query?.pageSize || 10 };
    }
    if (scenario === "list-no-results") {
      return { items: [], total: 0, page: query?.page || 1, pageSize: query?.pageSize || 10 };
    }

    let items = this.variants.filter((v) => v.productId === productId);

    if (query?.status && query.status !== "all") {
      items = items.filter((v) => v.status === query.status);
    }

    const total = items.length;
    const page = Math.max(1, query?.page || 1);
    const pageSize = Math.max(1, query?.pageSize || 10);
    const start = (page - 1) * pageSize;
    const paginated = items.slice(start, start + pageSize);

    return {
      items: JSON.parse(JSON.stringify(paginated)),
      total,
      page,
      pageSize,
    };
  }

  async getVariantById(
    productId: string,
    variantId: string,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<VariantDetailView | null> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "loading") {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    if (scenario === "error") {
      throw new CatalogError("unknown", "Error al consultar la variante.");
    }
    if (scenario === "variant-not-found" || scenario === "missing") {
      return null;
    }

    const found = this.variants.find(
      (v) => v.variantId === variantId && v.productId === productId,
    );
    if (!found) return null;

    const cloned: VariantDetailView = JSON.parse(JSON.stringify(found));

    // Review scenario overrides
    if (scenario === "prep-pending") {
      cloned.inventoryPreparationStatus = "PENDING";
      cloned.inventoryManualRetryAllowed = false;
    } else if (scenario === "prep-rejected") {
      cloned.inventoryPreparationStatus = "REJECTED";
      cloned.inventoryPreparationCode = "INV_SKU_INITIALIZATION_FAILED";
      cloned.inventoryManualRetryAllowed = true;
    } else if (scenario === "prep-completed") {
      cloned.inventoryPreparationStatus = "COMPLETED";
      cloned.inventoryManualRetryAllowed = false;
    } else if (scenario === "activate-missing-physical") {
      cloned.status = "BORRADOR";
      cloned.physicalProfile = { pesoKg: 0.25, dimensionesCm: null };
    } else if (scenario === "activate-success") {
      cloned.status = "BORRADOR";
      cloned.inventoryPreparationStatus = "COMPLETED";
      cloned.physicalProfile = {
        pesoKg: 0.85,
        dimensionesCm: { largo: 32, ancho: 22, alto: 12 },
      };
    } else if (scenario === "reactivate-valid") {
      cloned.status = "INACTIVA";
      cloned.inventoryPreparationStatus = "COMPLETED";
      cloned.physicalProfile = {
        pesoKg: 0.82,
        dimensionesCm: { largo: 31, ancho: 21, alto: 12 },
      };
    } else if (scenario === "reactivate-invalid") {
      cloned.status = "INACTIVA";
      cloned.physicalProfile = null;
    }

    return cloned;
  }

  async createVariant(
    productId: string,
    payload: VariantCreatePayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<VariantDetailView> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const parent = this.products.find((p) => p.id === productId);
    if (!parent) {
      throw new CatalogError("not_found", "Producto padre no encontrado.");
    }
    if (!parent.hasVariants || scenario === "parent-simple") {
      throw new CatalogError(
        "product_not_variants",
        "Solo productos con variantes permiten crearlas (CA-01).",
      );
    }

    // Scenarios
    if (scenario === "create-duplicate-sku") {
      throw new CatalogError(
        "duplicate_sku",
        `El SKU "${payload.sku}" ya está registrado en el catálogo.`,
        { sku: "SKU duplicado" },
      );
    }
    if (scenario === "create-duplicate-combination") {
      throw new CatalogError(
        "duplicate_combination",
        "La combinación de atributos identificadores ya existe dentro de este producto (CA-03).",
      );
    }
    if (scenario === "create-invalid-attribute") {
      throw new CatalogError(
        "invalid_attribute",
        "Se requiere al menos un atributo identificador válido.",
      );
    }
    if (scenario === "create-invalid-image") {
      throw new CatalogError(
        "invalid_image",
        "La URL de imagen es obligatoria y debe tener formato válido.",
      );
    }
    if (scenario === "create-invalid-physical") {
      throw new CatalogError(
        "invalid_physical",
        "Las medidas y peso físico deben ser mayores que cero.",
      );
    }
    if (scenario === "write-unknown") {
      throw new CatalogError(
        "unknown",
        "No se recibió confirmación del servidor al guardar la variante.",
      );
    }

    // Validations
    const idAttrs = payload.atributosIdentificadores || payload.identifyingAttributes || [];
    if (idAttrs.length === 0) {
      throw new CatalogError(
        "invalid_attribute",
        "Debes seleccionar al menos un atributo identificador (CA-03).",
      );
    }

    const imgUrl = (payload.imagenUrl || payload.imageUrl || "").trim();
    if (imgUrl) {
      try {
        const u = new URL(imgUrl);
        if (!["http:", "https:"].includes(u.protocol)) {
          throw new Error();
        }
      } catch {
        throw new CatalogError("invalid_image", "La URL de la imagen no es válida.");
      }
    }

    // Physical profile validation: in draft, if supplied, values must be > 0
    const pf = payload.perfilFisico || payload.physicalProfile;
    if (pf && !hasValidPhysicalValues(pf)) {
      throw new CatalogError(
        "invalid_physical",
        "Todos los valores del perfil físico suministrados deben ser mayores que cero.",
      );
    }

    // SKU determination (optional on create, generated by catalog if omitted)
    let assignedSku = payload.sku?.trim().toUpperCase();
    if (!assignedSku) {
      const seq = this.variants.filter((v) => v.productId === productId).length + 1;
      assignedSku = `${parent.skuBase}-V${seq}`;
    }

    // SKU global uniqueness check (CA-02)
    const existsSku = this.variants.some((v) => v.sku.toUpperCase() === assignedSku);
    if (existsSku) {
      throw new CatalogError(
        "duplicate_sku",
        `El SKU "${assignedSku}" ya existe en el catálogo (CA-02).`,
      );
    }

    // Identifying combination uniqueness check within product (CA-03)
    const getCombinationKey = (attrs: ProductAttributeValue[]) =>
      attrs
        .map((a) => {
          const schema = attributeSchemasByType[parent.typeId]?.find(s => s.caracteristicaId === a.caracteristicaId);
          const valueId = a.valorId ?? schema?.opciones?.find(o => o.valor === String(a.valor))?.id;
          return `${a.caracteristicaId}:${valueId ?? String(a.valor).trim().toUpperCase()}`;
        })
        .sort()
        .join("|");

    const newCombKey = getCombinationKey(idAttrs);
    const existingVariantsForProduct = this.variants.filter(
      (v) => v.productId === productId,
    );
    const hasDuplicateComb = existingVariantsForProduct.some(
      (v) => getCombinationKey(v.identifyingAttributes) === newCombKey,
    );
    if (hasDuplicateComb) {
      throw new CatalogError(
        "duplicate_combination",
        "Ya existe una variante con la misma combinación identificadora en este producto (CA-03).",
      );
    }

    const newVariantId = `VAR-${Date.now().toString().slice(-4)}`;
    const nonIdAttrs = payload.atributosNoIdentificadores || payload.nonIdentifyingAttributes || [];
    const physProf = normalizePhysicalProfile(payload.perfilFisico || payload.physicalProfile);

    const newVariant: VariantDetailView = {
      variantId: newVariantId,
      sku: assignedSku,
      productId,
      status: "BORRADOR",
      identifyingAttributes: idAttrs,
      nonIdentifyingAttributes: nonIdAttrs,
      images: imgUrl ? [imgUrl] : [],
      imageUrl: imgUrl,
      physicalProfile: physProf,
      catalogVersion: 1,
      inventoryPreparationStatus: "PENDING",
      inventoryPreparationCode: null,
      inventoryManualRetryAllowed: false,
      inventoryStatus: "PENDING",
    };

    this.variants.push(newVariant);

    // Synchronize parent product's variants and preparation summary
    parent.variants.push({
      variantId: newVariantId,
      sku: assignedSku,
      attributesSummary: idAttrs
        .map((a) => `${a.nombre}: ${a.valor}`)
        .join(" · "),
      status: "BORRADOR",
      preparationStatus: "PENDING",
      manualRetryAllowed: false,
    });

    parent.preparation.variantes.push({
      variantId: newVariantId,
      sku: assignedSku,
      inventario: {
        status: "PENDING",
        manualRetryAllowed: false,
        code: null,
      },
    });

    return JSON.parse(JSON.stringify(newVariant));
  }

  async updateVariant(
    productId: string,
    variantId: string,
    payload: VariantUpdatePayload,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<VariantDetailView> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "edit-version-conflict") {
      throw new CatalogError(
        "version_conflict",
        "Conflicto de versión (409): Otro gestor modificó esta variante.",
      );
    }
    if (scenario === "edit-active-rejected") {
      throw new CatalogError(
        "active_rejected",
        "La edición fue rechazada: una variante activa no puede perder sus requisitos de publicación.",
      );
    }
    if (scenario === "write-unknown") {
      throw new CatalogError(
        "unknown",
        "No se recibió confirmación concluyente del servidor al guardar la edición.",
      );
    }

    const idx = this.variants.findIndex(
      (v) => v.variantId === variantId && v.productId === productId,
    );
    if (idx === -1) {
      throw new CatalogError("not_found", "Variante no encontrada.");
    }

    const current = this.variants[idx];
    if (!current) throw new CatalogError("not_found", "Variante no encontrada.");

    // Version conflict validation
    if (
      payload.catalogVersion !== undefined &&
      payload.catalogVersion !== current.catalogVersion
    ) {
      throw new CatalogError(
        "version_conflict",
        `Conflicto de versión (409): versión actual ${current.catalogVersion}, recibida ${payload.catalogVersion}.`,
      );
    }

    // If variant is ACTIVA, validate that edition doesn't break activation prerequisites (CA-11)
    if (current.status === "ACTIVA") {
      const activeImg = payload.imagenUrl || payload.imageUrl || current.imageUrl;
      if (!activeImg?.trim()) {
        throw new CatalogError(
          "active_rejected",
          "Una variante activa no puede quedar sin imagen de publicación (CA-11).",
        );
      }
      const pf = normalizePhysicalProfile(payload.perfilFisico ?? payload.physicalProfile ?? current.physicalProfile);
      if (!isPhysicalProfileComplete(pf)) {
        throw new CatalogError(
          "active_rejected",
          "Una variante activa exige las 4 medidas físicas completas (peso, largo, ancho y alto) mayores a cero (CA-11).",
        );
      }
    }

    // Validate the proposal before mutating any field.
    const proposedProfile = payload.perfilFisico ?? payload.physicalProfile;
    if (proposedProfile !== undefined && !hasValidPhysicalValues(proposedProfile)) {
      throw new CatalogError("invalid_physical", "Todos los valores del perfil físico suministrados deben ser mayores que cero.");
    }
    // Retain immutable identity: variantId, sku, identifyingAttributes are immutable
    current.nonIdentifyingAttributes =
      payload.atributosNoIdentificadores || payload.nonIdentifyingAttributes || [];
    const newImg = (payload.imagenUrl || payload.imageUrl || current.imageUrl).trim();
    current.imageUrl = newImg;
    current.images = newImg ? [newImg] : [];
    if (payload.perfilFisico !== undefined || payload.physicalProfile !== undefined) {
      const rawPf = payload.perfilFisico ?? payload.physicalProfile;
      if (!hasValidPhysicalValues(rawPf)) {
        throw new CatalogError(
          "invalid_physical",
          "Todos los valores del perfil físico suministrados deben ser mayores que cero.",
        );
      }
      current.physicalProfile = normalizePhysicalProfile(rawPf);
    }
    current.catalogVersion += (payload.catalogVersion ? 1 : 1);

    return JSON.parse(JSON.stringify(current));
  }

  async activateVariant(
    productId: string,
    variantId: string,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<VariantMutationResult> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "activate-missing-physical") {
      throw new CatalogError(
        "activation_rejected",
        "La activación exige medidas físicas completas en kg/cm con valores mayores que cero (CA-07, CA-09).",
      );
    }

    const variant = this.variants.find(
      (v) => v.variantId === variantId && v.productId === productId,
    );
    if (!variant) throw new CatalogError("not_found", "Variante no encontrada.");

    const parent = this.products.find((p) => p.id === productId);
    if (!parent) throw new CatalogError("not_found", "Producto padre no encontrado.");

    // Validate activation conditions (CA-07)
    if (!variant.imageUrl?.trim()) {
      throw new CatalogError("activation_rejected", "Se requiere una imagen válida.");
    }
    if (!isPhysicalProfileComplete(variant.physicalProfile)) {
      throw new CatalogError(
        "activation_rejected",
        "Activar exige las cuatro medidas físicas completas mayores a cero (CA-07).",
      );
    }

    if (variant.inventoryPreparationStatus !== "COMPLETED") {
      throw new CatalogError(
        "activation_rejected",
        "Activar exige Inventario confirmado (COMPLETED). La inicialización aún no ha finalizado (CA-07).",
      );
    }

    variant.status = "ACTIVA";

    // Synchronize parent variant summary
    const parentVar = parent.variants.find((v) => v.variantId === variantId);
    if (parentVar) parentVar.status = "ACTIVA";

    return {
      variant: JSON.parse(JSON.stringify(variant)),
      parentStatusChanged: false,
    };
  }

  async deactivateVariant(
    productId: string,
    variantId: string,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<VariantMutationResult> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const variant = this.variants.find(
      (v) => v.variantId === variantId && v.productId === productId,
    );
    if (!variant) throw new CatalogError("not_found", "Variante no encontrada.");

    const parent = this.products.find((p) => p.id === productId);
    if (!parent) throw new CatalogError("not_found", "Producto padre no encontrado.");

    variant.status = "INACTIVA";

    // Synchronize parent variant summary
    const parentVar = parent.variants.find((v) => v.variantId === variantId);
    if (parentVar) parentVar.status = "INACTIVA";

    // CA-12 / FLOW-004 §4.4:
    // "Si era la última variante activa y el padre estaba activo, se inactiva al padre;
    // si estaba en borrador o inactivo, conserva su estado."
    let parentStatusChanged = false;
    let parentNewStatus: typeof parent.status | undefined;

    const remainingActiveVariants = this.variants.filter(
      (v) => v.productId === productId && v.variantId !== variantId && v.status === "ACTIVA",
    );

    if (remainingActiveVariants.length === 0 || scenario === "deactivate-last-active-parent") {
      if (parent.status === "ACTIVO" || scenario === "deactivate-last-active-parent") {
        parent.status = "INACTIVO";
        parentStatusChanged = true;
        parentNewStatus = "INACTIVO";
      }
    }

    return {
      variant: JSON.parse(JSON.stringify(variant)),
      parentStatusChanged,
      parentNewStatus,
    };
  }

  async reactivateVariant(
    productId: string,
    variantId: string,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<VariantMutationResult> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (scenario === "reactivate-invalid") {
      throw new CatalogError(
        "activation_rejected",
        "Faltan requisitos: la reactivación exige medidas físicas completas e inventario COMPLETED (CA-13).",
      );
    }

    const variant = this.variants.find(
      (v) => v.variantId === variantId && v.productId === productId,
    );
    if (!variant) throw new CatalogError("not_found", "Variante no encontrada.");

    const parent = this.products.find((p) => p.id === productId);
    if (!parent) throw new CatalogError("not_found", "Producto padre no encontrado.");

    // Revalidate conditions (CA-13)
    if (!variant.imageUrl?.trim()) {
      throw new CatalogError("activation_rejected", "Se requiere una imagen válida (CA-13).");
    }
    if (!isPhysicalProfileComplete(variant.physicalProfile)) {
      throw new CatalogError(
        "activation_rejected",
        "Reactivar exige las cuatro medidas físicas completas (peso, largo, ancho, alto) mayores que cero (CA-13).",
      );
    }

    if (variant.inventoryPreparationStatus !== "COMPLETED") {
      throw new CatalogError(
        "activation_rejected",
        "Reactivar exige Inventario confirmado como COMPLETED (CA-13).",
      );
    }

    variant.status = "ACTIVA";

    // Synchronize parent variant summary
    const parentVar = parent.variants.find((v) => v.variantId === variantId);
    if (parentVar) parentVar.status = "ACTIVA";

    // CA-14: Reactivar la variante NO reactiva automáticamente al padre.
    return {
      variant: JSON.parse(JSON.stringify(variant)),
      parentStatusChanged: false,
    };
  }

  async retryVariantPreparation(
    productId: string,
    variantId: string,
    scenario?: string,
    signal?: AbortSignal,
  ): Promise<{ accepted: boolean; message: string; operationId?: string }> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const variant = this.variants.find(
      (v) => v.variantId === variantId && v.productId === productId,
    );
    if (!variant) throw new CatalogError("not_found", "Variante no encontrada.");

    if (variant.inventoryPreparationStatus === "COMPLETED") {
      throw new CatalogError(
        "prep_not_retryable",
        "HTTP 409: La inicialización de inventario ya se encuentra COMPLETED y es terminal (CA-21).",
      );
    }

    if (scenario === "prep-not-retryable" || !variant.inventoryManualRetryAllowed) {
      throw new CatalogError(
        "prep_not_retryable",
        "HTTP 409 PREPARACION_NO_REINTENTABLE: la acción no es admisible en el estado actual.",
      );
    }

    // HTTP 202 Accepted indicates admission, remains PENDING without manual retry allowed
    variant.inventoryPreparationStatus = "PENDING";
    variant.inventoryStatus = "PENDING";
    variant.inventoryManualRetryAllowed = false;

    return {
      accepted: true,
      message: "HTTP 202 Accepted: Reintento de inventario admitido en Catálogo (CA-19).",
      operationId: `OP-INV-${variant.variantId}`,
    };
  }
}

export const mockCatalogRepository = new MockCatalogRepository();
