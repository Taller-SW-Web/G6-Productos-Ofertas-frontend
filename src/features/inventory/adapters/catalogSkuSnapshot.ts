import type { CatalogRepository, VariantDetailView } from "../../catalog/services/catalogRepository";

export const INVENTORY_VARIANT_READ_CONCURRENCY = 4;

export async function listVariantsByProduct(
  catalog: Pick<CatalogRepository, "listVariants">,
  products: readonly { id: string }[],
  pageSize: number,
  signal?: AbortSignal,
): Promise<Map<string, VariantDetailView[]>> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new RangeError("El tamaño de página de variantes debe estar entre 1 y 100.");
  }
  if (new Set(products.map((product) => product.id)).size !== products.length) {
    throw new Error("Catálogo devolvió productos duplicados al resolver variantes de Inventario.");
  }
  signal?.throwIfAborted();

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  const variantsByIndex: VariantDetailView[][] = Array.from({ length: products.length }, () => []);
  let nextIndex = 0;

  const loadProduct = async (productId: string): Promise<VariantDetailView[]> => {
    const items: VariantDetailView[] = [];
    let page = 1;
    let total: number | undefined;

    for (;;) {
      controller.signal.throwIfAborted();
      const result = await catalog.listVariants(
        productId,
        { page, pageSize, status: "all" },
        undefined,
        controller.signal,
      );
      const expectedLength = Math.min(pageSize, Math.max(0, result.total - (page - 1) * pageSize));
      if (result.page !== page || result.pageSize !== pageSize ||
        (total !== undefined && total !== result.total) || result.items.length !== expectedLength ||
        result.items.some((variant) => variant.productId !== productId)) {
        throw new Error("Catálogo devolvió una paginación o identidad de variantes incompleta para Inventario.");
      }
      total = result.total;
      items.push(...result.items);
      if (page >= Math.ceil(total / pageSize)) return items;
      if (page >= 10_000) throw new Error("Catálogo excedió el límite defensivo de páginas de variantes para Inventario.");
      page += 1;
    }
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      controller.signal.throwIfAborted();
      const index = nextIndex++;
      if (index >= products.length) return;
      variantsByIndex[index] = await loadProduct(products[index]!.id);
    }
  };

  try {
    await Promise.all(Array.from(
      { length: Math.min(INVENTORY_VARIANT_READ_CONCURRENCY, products.length) },
      () => worker(),
    ));
    return new Map(products.map((product, index) => [product.id, variantsByIndex[index]!]));
  } catch (error) {
    controller.abort(error);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
