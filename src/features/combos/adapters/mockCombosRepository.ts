import { comboFixtures, priceFixtures, productFixtures } from "../mocks/comboFixtures";
import { ComboError, type Combo, type ComboPayload, type ComboQuery, type CombosCatalogPort, type CombosPricingPort, type CombosRepository } from "../types/combos";

const clone = <T,>(value: T): T => structuredClone(value);

export class MockCombosRepository implements CombosRepository, CombosCatalogPort, CombosPricingPort {
  private combos: Combo[] = clone(comboFixtures);
  private listErrorDelivered = false;

  async list(query: ComboQuery): Promise<{ items: Combo[]; page: number; pageSize: number; total: number }> {
    if (query.scenario === "list-error" && !this.listErrorDelivered) {
      this.listErrorDelivered = true;
      throw new ComboError("unknown", "No se pudieron consultar los combos.");
    }
    const all = query.scenario === "list-empty" ? [] : this.combos.filter((item) => query.status === "TODOS" || item.status === query.status);
    const start = (query.page - 1) * query.pageSize;
    return { items: clone(all.slice(start, start + query.pageSize)), page: query.page, pageSize: query.pageSize, total: all.length };
  }

  async getById(id: string): Promise<Combo | null> {
    return clone(this.combos.find((item) => item.id === id) ?? null);
  }

  async create(payload: ComboPayload, scenario?: string): Promise<Combo> {
    if (scenario === "server-price-rejected") throw new ComboError("price_invalid", "El precio del combo no cumple la regla económica.");
    const combo: Combo = {
      id: `combo-${this.combos.length + 1}`,
      name: payload.name,
      description: payload.description,
      status: "ACTIVO",
      priceMinor: payload.priceMinor,
      version: 1,
      components: payload.components.map((item) => {
        const source = productFixtures.flatMap((product) => [
          ...(!product.hasVariants && product.baseSku ? [{ sku: product.baseSku, name: product.name }] : []),
          ...product.variants.map((variant) => ({ sku: variant.sku, name: product.name })),
        ]).find((candidate) => candidate.sku === item.sku);
        const price = priceFixtures.find((candidate) => candidate.sku === item.sku);
        return { sku: item.sku, productName: source?.name ?? item.sku, quantity: item.quantity, regularUnitMinor: price?.regularMinor ?? null, publicUnitMinor: price?.publicMinor ?? null };
      }),
      availability: { verifiable: false, quantity: null, freshness: "INCOMPLETA", calculatedAt: null },
    };
    this.combos.unshift(combo);
    return clone(combo);
  }

  async update(id: string, payload: ComboPayload, scenario?: string): Promise<Combo> {
    const current = this.combos.find((item) => item.id === id);
    if (!current) throw new ComboError("not_found", "No se encontró el combo.");
    if (scenario === "version-conflict" || payload.version !== current.version) {
      throw new ComboError("version_conflict", "Este combo cambió desde que comenzaste a editarlo.", clone(current));
    }
    if (scenario === "server-price-rejected") throw new ComboError("price_invalid", "El precio del combo no cumple la regla económica.");
    const updated = await this.create({ ...payload, version: undefined });
    this.combos = this.combos.filter((item) => item.id !== updated.id);
    const replacement = { ...updated, id, version: current.version + 1, status: current.status, availability: current.availability };
    this.combos = this.combos.map((item) => item.id === id ? replacement : item);
    return clone(replacement);
  }

  async deactivate(id: string): Promise<Combo> {
    const current = this.combos.find((item) => item.id === id);
    if (!current) throw new ComboError("not_found", "No se encontró el combo.");
    const updated = { ...current, status: "INACTIVO" as const, version: current.version + 1 };
    this.combos = this.combos.map((item) => item.id === id ? updated : item);
    return clone(updated);
  }

  async listProducts() { return clone(productFixtures); }
  async getProduct(productId: string) { return clone(productFixtures.find((item) => item.productId === productId) ?? null); }
  async readCurrent(skus: string[]) { return clone(priceFixtures.filter((item) => skus.includes(item.sku))); }
}
