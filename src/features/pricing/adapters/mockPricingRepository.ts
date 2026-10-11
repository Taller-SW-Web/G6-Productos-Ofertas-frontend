import { priceViews } from "../mocks/prices";
import {
  mockReports,
  partialBatch,
  prevalidationFixtures,
  scheduleFixtures,
} from "../mocks/workflows";
import {
  PricingFailure,
  type EditablePrice,
  type ReviewScenario,
  type ScheduleView,
  type WriteTarget,
} from "../services/pricingModels";
import type {
  PricingRepository,
  PriceView,
} from "../services/pricingRepository";
import {
  displayInstant,
  localInstant,
  mockClock,
  validatePrice,
  validateSchedule,
} from "../services/pricingValidation";

const prices = new Map<string, EditablePrice>();
const schedules = new Map<string, ScheduleView[]>();
let scheduleSequence = 3;
const key = (target: WriteTarget) => `${target.targetId}:${target.channel}`;
async function scenarioCheck(scenario: ReviewScenario, signal: AbortSignal) {
  signal.throwIfAborted();
  if (scenario === "loading")
    await new Promise<never>((_, reject) =>
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      ),
    );
  signal.throwIfAborted();
  if (scenario === "error")
    throw new PricingFailure(
      "error",
      "No se pudo consultar el precio. La selección se conserva; vuelve a consultar.",
    );
  if (scenario === "unauthorized")
    throw new PricingFailure(
      "unauthorized",
      "La sesión no es válida en este escenario. No se aplicó la propuesta.",
    );
  if (scenario === "forbidden")
    throw new PricingFailure(
      "forbidden",
      "No tienes autorización en este escenario. No se aplicó la propuesta.",
    );
  if (scenario === "overlap")
    throw new PricingFailure(
      "overlap",
      "La vigencia se superpone con otra del mismo objetivo y canal. Revisa las fechas; tu propuesta se conserva.",
    );
  if (scenario === "unknown")
    throw new PricingFailure(
      "unknown",
      "No se pudo confirmar el resultado. Consulta antes de decidir una nueva intención; no se reenviará automáticamente.",
    );
}
function editable(target: WriteTarget): EditablePrice | null {
  const existing = prices.get(key(target));
  if (existing) return structuredClone(existing);
  if (target.targetId !== "base") {
    const specific = prices.get(`${target.targetId}:global`);
    if (specific) return structuredClone(specific);
  }
  const fixture = priceViews.find((row) => row.id === target.targetId);
  if (!fixture) return null;
  const base = prices.get("base:global");
  if (fixture.inherited && base)
    return {
      ...structuredClone(base),
      view: {
        ...structuredClone(base.view),
        id: fixture.id,
        name: fixture.name,
        sku: fixture.sku,
        inherited: true,
      },
    };
  return {
    view: { ...fixture },
    regular: fixture.origin === "sku" ? "259.90" : "249.90",
    offer: fixture.offer === null ? null : "219.90",
    currency: "PEN",
  };
}
function viewFrom(price: EditablePrice): PriceView {
  const unit = price.currency === "PEN" ? "S/" : price.currency;
  return {
    ...price.view,
    regular: `${unit} ${price.regular}`,
    offer: price.offer === null ? null : `${unit} ${price.offer}`,
    currency: price.currency,
  };
}
function batchScenario(
  scenario: Parameters<PricingRepository["readBatch"]>[1],
) {
  const batch = structuredClone(partialBatch);
  if (scenario === "queued" || scenario === "processing") {
    batch.status = scenario === "queued" ? "QUEUED" : "PROCESSING";
    batch.completed = 0;
    batch.failed = 0;
    delete batch.rows;
  }
  if (scenario === "completed") {
    batch.status = "COMPLETED";
    batch.completed = 3;
    batch.failed = 0;
    batch.rows = batch.rows?.map((row) => ({
      ...row,
      status: "COMPLETED",
      code: null,
      detail: null,
    }));
  }
  if (scenario === "failed") {
    batch.status = "FAILED";
    batch.completed = 0;
    batch.failed = 3;
    batch.rows = batch.rows?.map((row) => ({
      ...row,
      status: "FAILED",
      code: "PRECIO_INVALIDO",
      detail: "Precio rechazado",
    }));
  }
  if (scenario === "no-rows") delete batch.rows;
  return batch;
}
export const mockPricingRepository: PricingRepository = {
  async read(query, scenario, signal) {
    await scenarioCheck(scenario, signal);
    if (scenario === "empty") return null;
    const price = editable(query);
    if (!price) return null;
    return {
      price: viewFrom(price),
      breakdown: priceViews.map((row) =>
        viewFrom(editable({ targetId: row.id, channel: "global" })!),
      ),
    };
  },
  async readEditable(target, scenario, signal) {
    await scenarioCheck(scenario, signal);
    if (scenario === "empty") return null;
    const price = editable(target);
    return price ? { ...price, view: viewFrom(price) } : null;
  },
  async update(change, scenario, signal) {
    await scenarioCheck(scenario === "conflict" ? "default" : scenario, signal);
    const current = editable(change.target);
    if (!current)
      throw new PricingFailure(
        "error",
        "El objetivo no tiene una lectura disponible.",
      );
    const errors = validatePrice(change.draft, current.offer);
    if (Object.keys(errors).length)
      throw new PricingFailure("error", Object.values(errors).join(" "));
    if (scenario === "conflict") {
      prices.set(key(change.target), {
        ...current,
        regular: "255.00",
        view: {
          ...current.view,
          version: current.view.version + 1,
          origin: change.target.targetId === "base" ? "product" : "sku",
          inherited: false,
          channel: change.target.channel,
        },
      });
      throw new PricingFailure(
        "conflict",
        "El precio cambió desde tu consulta. Relee el mismo objetivo y revisa la propuesta antes de confirmar.",
      );
    }
    if (change.version !== current.view.version)
      throw new PricingFailure(
        "conflict",
        "El precio cambió desde tu consulta. Tu propuesta se conserva.",
      );
    const saved: EditablePrice = {
      regular: change.draft.regular,
      offer:
        change.draft.offerAction === "ELIMINAR"
          ? null
          : change.draft.offerAction === "ESTABLECER"
            ? change.draft.offer
            : current.offer,
      currency: change.draft.currency.trim(),
      view: {
        ...current.view,
        inherited: false,
        origin: change.target.targetId === "base" ? "product" : "sku",
        channel: change.target.channel,
        version: current.view.version + 1,
        validFrom: `${displayInstant(mockClock)} (America/Bogota)`,
        validUntil: null,
      },
    };
    saved.view = viewFrom(saved);
    prices.set(key(change.target), saved);
    return structuredClone(saved);
  },
  async listSchedules(targetId, page, scenario, signal) {
    await scenarioCheck(scenario, signal);
    const rows =
      scenario === "empty" ? [] : (schedules.get(targetId) ?? scheduleFixtures);
    return {
      items: structuredClone(rows.slice((page - 1) * 2, page * 2)),
      page,
      pageSize: 2,
      total: rows.length,
    };
  },
  async schedule(targetId, draft, scenario, signal) {
    await scenarioCheck(scenario, signal);
    const errors = validateSchedule(draft);
    if (Object.keys(errors).length)
      throw new PricingFailure("error", Object.values(errors).join(" "));
    const start = localInstant(draft.start)!;
    const end = draft.end ? localInstant(draft.end) : null;
    const rows = schedules.get(targetId) ?? structuredClone(scheduleFixtures);
    if (
      rows.some(
        (row) =>
          row.channel === draft.channel &&
          row.status !== "CANCELLED" &&
          Date.parse(start) < (row.end ? Date.parse(row.end) : Infinity) &&
          (end ? Date.parse(end) : Infinity) > Date.parse(row.start),
      )
    )
      throw new PricingFailure(
        "overlap",
        "La vigencia se superpone con otra del mismo objetivo y canal. Tu propuesta se conserva.",
      );
    const created: ScheduleView = {
      id: `schedule-${++scheduleSequence}`,
      kind: draft.kind,
      amount: draft.amount,
      currency: draft.currency.trim(),
      channel: draft.channel,
      start,
      end,
      status: "SCHEDULED",
    };
    schedules.set(targetId, [created, ...rows]);
    return structuredClone(created);
  },
  async readHistorical(query, at, scenario, signal) {
    await scenarioCheck(scenario, signal);
    // An explicit archived interval, independent of current mock mutations.
    if (
      scenario === "empty" ||
      Date.parse(at) < Date.parse("2026-09-01T00:00:00Z") ||
      Date.parse(at) >= Date.parse("2026-10-01T00:00:00Z")
    )
      return null;
    const fixture = priceViews.find((row) => row.id === query.targetId);
    if (!fixture) return null;
    return {
      price: {
        ...fixture,
        regular: "S/ 100.00",
        offer: "S/ 90.00",
        version: 3,
        validFrom: "31/08/2026 19:00 (America/Bogota)",
        validUntil: "30/09/2026 19:00 (America/Bogota)",
      },
      validityId: `fixture-vig-013-${query.targetId}-03`,
    };
  },
  async previewFixture(scenario, signal) {
    signal.throwIfAborted();
    if (scenario === "unreadable")
      throw new PricingFailure(
        "error",
        "Archivo no analizable en el escenario ficticio. No hay prevalidación ni lote creado.",
      );
    if (scenario === "error")
      throw new PricingFailure(
        "error",
        "No se pudo obtener la prevalidación de demostración. Se conserva la selección.",
      );
    return structuredClone(prevalidationFixtures[scenario]);
  },
  async readBatch(id, scenario, signal) {
    await scenarioCheck(
      scenario === "error" || scenario === "loading" || scenario === "forbidden"
        ? scenario
        : "default",
      signal,
    );
    return id === partialBatch.id ? batchScenario(scenario) : null;
  },
  async report(id, scenario, signal) {
    await scenarioCheck(
      scenario === "error" || scenario === "forbidden" ? scenario : "default",
      signal,
    );
    if (
      id !== partialBatch.id ||
      scenario === "queued" ||
      scenario === "processing" ||
      scenario === "loading"
    )
      throw new PricingFailure(
        "error",
        "El reporte no está disponible para este lote.",
      );
    return scenario === "completed"
      ? mockReports.completed
      : scenario === "failed"
        ? mockReports.failed
        : mockReports.partial;
  },
};
