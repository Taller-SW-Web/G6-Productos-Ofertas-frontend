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
} from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { initialProducts } from "../mocks/catalogFixtures";
import { initialCategories, initialBrands, initialProductTypes, attributeSchemasByType } from "../mocks/taxonomyFixtures";

export class MockCatalogRepository implements CatalogRepository {
  private products: ProductDetailView[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.products = JSON.parse(JSON.stringify(initialProducts));
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

    // Apply scenario overrides for preparation or status
    const cloned: ProductDetailView = JSON.parse(JSON.stringify(found));

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
      const p = payload.perfilFisico;
      if (
        (p.pesoKg !== undefined && p.pesoKg <= 0) ||
        (p.largoCm !== undefined && p.largoCm <= 0) ||
        (p.anchoCm !== undefined && p.anchoCm <= 0) ||
        (p.altoCm !== undefined && p.altoCm <= 0)
      ) {
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
      physicalProfile: payload.tieneVariantes ? null : payload.perfilFisico || null,
      preparation: {
        productId: newId,
        hasVariants: payload.tieneVariantes,
        pricing: {
          status: "COMPLETED",
          manualRetryAllowed: false,
          code: null,
        },
        inventario: payload.tieneVariantes
          ? null
          : {
              status: "COMPLETED",
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
        const pf = payload.perfilFisico;
        if (!pf || !pf.pesoKg || !pf.largoCm || !pf.anchoCm || !pf.altoCm) {
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
      current.physicalProfile = payload.perfilFisico;
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
      const pf = product.physicalProfile;
      if (!pf || !pf.pesoKg || !pf.largoCm || !pf.anchoCm || !pf.altoCm) {
        throw new CatalogError(
          "validation",
          "El producto simple requiere peso, largo, ancho y alto positivos antes de activar.",
        );
      }
    } else {
      // 3. Variant parent needs at least one active variant and all active variants prepared
      const activeVariants = product.variants.filter((v) => v.status === "ACTIVA");
      if (activeVariants.length === 0) {
        throw new CatalogError(
          "validation",
          "El producto con variantes requiere al menos una variante activa para publicarse.",
        );
      }
      const allActivePrepared = activeVariants.every(
        (v) => v.preparationStatus === "COMPLETED",
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
      if (product.preparation.pricing.status === "COMPLETED") {
        throw new CatalogError(
          "prep_not_retryable",
          "HTTP 409: La inicialización de Pricing ya se encuentra completada.",
        );
      }
      product.preparation.pricing.status = "PENDING";
      product.preparation.pricing.manualRetryAllowed = false;
      // Simulate completion in session
      setTimeout(() => {
        product.preparation.pricing.status = "COMPLETED";
      }, 500);
    } else if (payload.dependencia === "INVENTARIO") {
      if (product.hasVariants) {
        throw new CatalogError(
          "prep_not_retryable",
          "HTTP 409: El producto con variantes no admite reintento de inventario en el padre.",
        );
      }
      if (product.preparation.inventario?.status === "COMPLETED") {
        throw new CatalogError(
          "prep_not_retryable",
          "HTTP 409: El inventario simple ya está completado.",
        );
      }
      if (product.preparation.inventario) {
        product.preparation.inventario.status = "PENDING";
        product.preparation.inventario.manualRetryAllowed = false;
        setTimeout(() => {
          if (product.preparation.inventario) {
            product.preparation.inventario.status = "COMPLETED";
          }
        }, 500);
      }
    }

    return {
      accepted: true,
      message: "HTTP 202: Reintento admitido. Nuevo ciclo de preparación en curso.",
    };
  }
}

export const mockCatalogRepository = new MockCatalogRepository();
