import { comboFixtures } from "../mocks/comboFixtures";
import { calculateInformativeAvailability } from "../services/availability";
import { currentGlobalPricesForSku, effectivePublicMinor } from "../services/comboRules";
import { validateMockComboPayload } from "../services/validateMockComboPayload";
import {
  ComboError,
  type Combo,
  type ComboAvailability,
  type ComboPayload,
  type ComboQuery,
  type ComboStatus,
  type CombosAvailabilityPort,
  type CombosCatalogPort,
  type CombosPricingPort,
  type CombosRepository,
} from "../types/combos";

const clone = <T,>(value: T): T => structuredClone(value);

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("La consulta fue cancelada.", "AbortError");
}

export interface MockCombosDependencies {
  catalog: CombosCatalogPort;
  pricing: CombosPricingPort;
  availability: CombosAvailabilityPort;
  seed?: Combo[];
  now?: () => number;
  knownComboIds?: ReadonlySet<string>;
}

export class MockCombosRepository implements CombosRepository {
  private combos: Combo[] = clone(comboFixtures);
  private listErrorDelivered = false;
  private readonly versionConflictScenariosTriggered = new Set<string>();
  private readonly deps: MockCombosDependencies;
  private readonly now: () => number;

  constructor(deps: MockCombosDependencies) {
    this.deps = deps;
    this.now = deps.now ?? (() => Date.now());
    if (deps.seed) this.combos = clone(deps.seed);
  }

  async list(query: ComboQuery, signal?: AbortSignal): Promise<{ items: Combo[]; page: number; pageSize: number; total: number }> {
    throwIfAborted(signal);
    if (query.scenario === "list-error" && !this.listErrorDelivered) {
      await Promise.resolve();
      throwIfAborted(signal);
      this.listErrorDelivered = true;
      throw new ComboError("unknown", "No se pudieron consultar los combos.");
    }
    if (!Number.isSafeInteger(query.page) || query.page < 1 || !Number.isSafeInteger(query.pageSize) || query.pageSize < 1) {
      throw new ComboError("unknown", "La página solicitada no es válida.");
    }
    const all = query.scenario === "list-empty" ? [] : this.combos.filter((item) => query.status === "TODOS" || item.status === query.status);
    const start = (query.page - 1) * query.pageSize;
    return { items: clone(all.slice(start, start + query.pageSize)), page: query.page, pageSize: query.pageSize, total: all.length };
  }

  async getById(id: string, signal?: AbortSignal): Promise<Combo | null> {
    throwIfAborted(signal);
    if (signal?.aborted) throw new DOMException("La consulta fue cancelada.", "AbortError");
    return clone(this.combos.find((item) => item.id === id) ?? null);
  }

  async create(payload: ComboPayload, scenario?: string): Promise<Combo> {
    if (scenario === "server-price-rejected") {
      throw new ComboError("price_invalid", "El precio del combo no cumple la regla económica.");
    }
    await validateMockComboPayload(payload, this.validationContext());
    const combo = await this.buildCombo(payload, `combo-${this.combos.length + 1}`, 1, "ACTIVO");
    this.combos.unshift(combo);
    return clone(combo);
  }

  async update(id: string, payload: ComboPayload, scenario?: string): Promise<Combo> {
    let current = this.combos.find((item) => item.id === id);
    if (!current) throw new ComboError("not_found", "No se encontró el combo.");
    if (scenario === "version-conflict" && !this.versionConflictScenariosTriggered.has(id)) {
      const concurrent = { ...clone(current), name: `${current.name} (actualizado en servidor)`, version: current.version + 1 };
      this.combos = this.combos.map((item) => item.id === id ? concurrent : item);
      this.versionConflictScenariosTriggered.add(id);
      current = concurrent;
      throw new ComboError("version_conflict", "Este combo cambió desde que comenzaste a editarlo.", clone(current));
    }
    if (payload.version !== current.version) {
      throw new ComboError("version_conflict", "Este combo cambió desde que comenzaste a editarlo.", clone(current));
    }
    if (scenario === "server-price-rejected") {
      throw new ComboError("price_invalid", "El precio del combo no cumple la regla económica.");
    }
    await validateMockComboPayload(payload, this.validationContext());
    const updated = await this.buildCombo(payload, current.id, current.version + 1, current.status);
    this.combos = this.combos.map((item) => item.id === id ? updated : item);
    return clone(updated);
  }

  async deactivate(id: string): Promise<Combo> {
    const current = this.combos.find((item) => item.id === id);
    if (!current) throw new ComboError("not_found", "No se encontró el combo.");
    const availability = current.availability.state === "COMBO_INACTIVO"
      ? current.availability
      : calculateInformativeAvailability("INACTIVO", [], new Map(), null);
    const updated: Combo = { ...current, status: "INACTIVO", version: current.version + 1, availability };
    this.combos = this.combos.map((item) => item.id === id ? updated : item);
    return clone(updated);
  }

  private validationContext() {
    return {
      catalog: this.deps.catalog,
      pricing: this.deps.pricing,
      existingComboIds: this.deps.knownComboIds ?? new Set(this.combos.map((combo) => combo.id)),
      now: this.now(),
    };
  }

  private async computeAvailability(
    status: ComboStatus,
    components: { sku: string; quantity: number }[],
  ): Promise<ComboAvailability> {
    const skus = components.map((component) => component.sku);
    const resolved = await this.deps.catalog.resolveSkus(skus);
    const sellable = new Map(resolved.map((entry) => [entry.sku, entry.sellable]));
    const readings = await this.deps.availability.readStocks(skus);
    return calculateInformativeAvailability(
      status,
      components.map((component) => ({
        sku: component.sku,
        quantity: component.quantity,
        active: sellable.get(component.sku) ?? false,
      })),
      new Map(readings.map((reading) => [reading.sku, reading])),
      new Date(this.now()).toISOString(),
    );
  }

  private async buildCombo(payload: ComboPayload, id: string, version: number, status: ComboStatus): Promise<Combo> {
    const prices = await this.deps.pricing.readCurrent(payload.components.map((item) => item.sku));
    const resolved = await this.deps.catalog.resolveSkus(payload.components.map((item) => item.sku));
    const nameBySku = new Map(resolved.map((entry) => [entry.sku, entry.productName]));
    const components = payload.components.map((item) => {
      const matches = currentGlobalPricesForSku(item.sku, prices, this.now());
      const price = matches.length === 1 ? matches[0] : undefined;
      return {
        sku: item.sku,
        productName: nameBySku.get(item.sku) ?? item.sku,
        quantity: item.quantity,
        regularUnitMinor: price?.regularMinor ?? null,
        publicUnitMinor: price ? effectivePublicMinor(price) : null,
      };
    });
    const availability = await this.computeAvailability(status, payload.components);
    return {
      id,
      name: payload.name.trim(),
      description: payload.description,
      status,
      priceMinor: payload.priceMinor,
      version,
      components,
      availability,
    };
  }
}
