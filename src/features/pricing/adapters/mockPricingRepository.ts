import { priceViews } from "../mocks/prices";
import type { PricingRepository } from "../services/pricingRepository";

export const mockPricingRepository: PricingRepository = {
  async read(query, scenario, signal) {
    signal.throwIfAborted();
    if (scenario === "loading")
      await new Promise<never>((_, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        ),
      );
    if (scenario === "error")
      throw new Error(
        "No se pudo consultar el precio. La selección se conserva; vuelve a consultar.",
      );
    if (scenario === "empty") return null;
    const price = priceViews.find((item) => item.id === query.targetId);
    if (!price) return null;
    // All supplied fixtures resolve globally. A requested RETAIL channel is explicitly a fallback.
    return {
      price: { ...price },
      breakdown: priceViews.map((row) => ({ ...row })),
    };
  },
};
