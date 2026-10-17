import { ComboError, type CombosAvailabilityPort, type StockReading } from "../types/combos";

export type StockSnapshot = Readonly<Record<string, StockReading>>;

export interface MockCombosAvailabilityOptions {
  snapshot?: StockSnapshot;
  fail?: boolean;
}

// Explicit, injectable informational stock snapshot for Combos. A SKU absent
// from the snapshot is returned as an unknown reading (stock null), never a
// confident zero, so the availability calculation reports incomplete or
// unverifiable information.
export class MockCombosAvailabilityAdapter implements CombosAvailabilityPort {
  private snapshot: StockSnapshot;
  private failing: boolean;

  constructor(options: MockCombosAvailabilityOptions = {}) {
    this.snapshot = options.snapshot ?? {};
    this.failing = options.fail ?? false;
  }

  setSnapshot(snapshot: StockSnapshot): void {
    this.snapshot = snapshot;
  }

  setFailing(failing: boolean): void {
    this.failing = failing;
  }

  async readStocks(skus: string[], signal?: AbortSignal): Promise<StockReading[]> {
    if (signal?.aborted) throw new DOMException("La consulta fue cancelada.", "AbortError");
    if (this.failing) {
      throw new ComboError("unavailable", "El snapshot de disponibilidad no está disponible.");
    }
    return skus.map((sku) => {
      const reading = this.snapshot[sku];
      return reading
        ? { ...reading, sku }
        : { sku, stock: null, stale: false, locationsCompatible: true };
    });
  }
}
