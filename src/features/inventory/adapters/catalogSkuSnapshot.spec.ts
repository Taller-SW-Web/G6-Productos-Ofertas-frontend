import { describe, expect, it, vi } from "vitest";
import type { CatalogRepository, VariantDetailView } from "../../catalog/services/catalogRepository";
import { listVariantsByProduct } from "./catalogSkuSnapshot";

function variant(productId: string, sku: string): VariantDetailView {
  return {
    variantId: sku,
    sku,
    productId,
    status: "ACTIVA",
    identifyingAttributes: [],
    nonIdentifyingAttributes: [],
    images: [],
    imageUrl: "",
    physicalProfile: null,
    catalogVersion: 1,
    inventoryPreparationStatus: "COMPLETED",
    inventoryManualRetryAllowed: false,
    inventoryStatus: "COMPLETED",
  };
}

describe("listVariantsByProduct", () => {
  it("caps concurrent product reads at four and preserves product order", async () => {
    const products = Array.from({ length: 9 }, (_, index) => ({ id: `p${index}` }));
    let active = 0;
    let peak = 0;
    const listVariants = vi.fn(async (productId: string, query?: { page?: number; pageSize?: number }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      const page = query?.page ?? 1;
      const pageSize = query?.pageSize ?? 1;
      return {
        items: page === 1 ? [variant(productId, `${productId}-sku`)] : [],
        total: 1,
        page,
        pageSize,
      };
    });

    const result = await listVariantsByProduct({ listVariants } as unknown as Pick<CatalogRepository, "listVariants">, products, 1);

    expect(peak).toBe(4);
    expect([...result.keys()]).toEqual(products.map((product) => product.id));
    expect([...result.values()].map((items) => items[0]?.sku)).toEqual(products.map((product) => `${product.id}-sku`));
  });

  it("aborts outstanding reads when a product page is inconsistent", async () => {
    const started: string[] = [];
    const listVariants = vi.fn((productId: string, _query?: unknown, _scenario?: string, signal?: AbortSignal) => {
      started.push(productId);
      if (productId === "bad") return Promise.resolve({ items: [], total: 1, page: 1, pageSize: 1 });
      return new Promise<never>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });

    await expect(listVariantsByProduct(
      { listVariants } as unknown as Pick<CatalogRepository, "listVariants">,
      [{ id: "slow-1" }, { id: "bad" }, { id: "slow-2" }, { id: "slow-3" }, { id: "not-started" }],
      1,
    )).rejects.toThrow("paginación o identidad");
    expect(started).not.toContain("not-started");
  });
});
