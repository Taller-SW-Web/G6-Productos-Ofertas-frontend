import { priceRecords, priceTargets, targetNames } from "../mocks/prices";
import { readMockPricingTargets } from "../../catalog/adapters/mockCatalogConsumers";
import {
  mockReports,
  partialBatch,
  scheduleFixtures,
} from "../mocks/workflows";
import { PricingFailure, type ScheduleView } from "../services/pricingModels";
import type {
  PricingRepository,
  PriceView,
  PriceChannel,
  PriceTarget,
} from "../services/pricingRepository";
import type { Clock } from "../services/pricingRuntime";
import {
  localInstant,
  validatePrice,
  validateSchedule,
} from "../services/pricingValidation";
import {
  isMockPersistenceAvailable,
  isRecord,
  publishMockChange,
  readMockState,
  saveMockState,
  subscribeExternalMockChanges,
} from "../../shared/mockState";

interface MockPricingState {
  records: PriceView[];
  schedules: ScheduleView[];
  sequence: number;
}

function isPriceRecord(value: unknown): value is PriceView {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.regular === "string" &&
    /^\d+(\.\d+)?$/.test(value.regular) &&
    Number(value.regular) >= 0 &&
    (value.offer === null ||
      value.offer === undefined ||
      (typeof value.offer === "string" &&
        /^\d+(\.\d+)?$/.test(value.offer) &&
        Number(value.offer) >= 0)) &&
    typeof value.currency === "string" &&
    value.currency.trim().length > 0 &&
    typeof value.version === "number" &&
    Number.isFinite(value.version) &&
    value.version >= 0 &&
    typeof value.validFrom === "string"
  );
}

function isScheduleRecord(value: unknown): value is ScheduleView {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.targetId === "string" &&
    value.targetId.trim().length > 0 &&
    typeof value.start === "string" &&
    typeof value.amount === "string" &&
    /^\d+(\.\d+)?$/.test(value.amount) &&
    Number(value.amount) >= 0
  );
}

function isMockPricingState(value: unknown): value is MockPricingState {
  return (
    isRecord(value) &&
    Array.isArray(value.records) &&
    value.records.every(isPriceRecord) &&
    Array.isArray(value.schedules) &&
    value.schedules.every(isScheduleRecord) &&
    typeof value.sequence === "number" &&
    Number.isFinite(value.sequence) &&
    value.sequence >= 0
  );
}

export function createMockPricingRepository(
  clock: Clock,
  onUpdated?: (target: PriceTarget, before: PriceView, after: PriceView, reason: string) => void,
  options: { persist?: boolean } = {},
): PricingRepository {
  const persistEnabled = options.persist === true && isMockPersistenceAvailable();
  const restored = persistEnabled
    ? readMockState<MockPricingState>("pricing", isMockPricingState)
    : null;
  const records = restored ? restored.records : structuredClone(priceRecords);
  let targets = structuredClone(priceTargets);
  const names = { ...targetNames };
  // A non-persistent instance (persist: false) must never touch `localStorage`;
  // it still notifies in-session listeners so local tests keep working.
  const persist = () => {
    if (persistEnabled) {
      saveMockState("pricing", { records, schedules, sequence } satisfies MockPricingState);
    }
    publishMockChange("pricing");
  };
  async function refreshTargets(signal?: AbortSignal) {
    signal?.throwIfAborted();
    const current = await readMockPricingTargets(signal ?? new AbortController().signal);
    for (const catalogTarget of current) {
      const existing = targets.find((t) =>
        t.kind === catalogTarget.kind &&
        (catalogTarget.kind === "product"
          ? t.productId === catalogTarget.productId
          : t.kind === "variant" && t.sku === catalogTarget.sku),
      );
      if (!existing) continue;

      if (catalogTarget.kind === "product" && existing.kind === "product") {
        const catalogName = catalogTarget.label.slice(0, catalogTarget.label.lastIndexOf(" · "));
        if (catalogName && catalogName !== targetNames[existing.id]) {
          existing.label = `${catalogName} · ${existing.referenceSku}`;
          names[existing.id] = catalogName;
        }
      }
    }
  }
  const schedules = restored ? restored.schedules : structuredClone(scheduleFixtures);
  let sequence = restored ? restored.sequence : schedules.length;
  if (persistEnabled) {
    subscribeExternalMockChanges("pricing", () => {
      const next = readMockState<MockPricingState>("pricing", isMockPricingState);
      if (!next) return;
      records.length = 0;
      records.push(...next.records);
      schedules.length = 0;
      schedules.push(...next.schedules);
      sequence = next.sequence;
      publishMockChange("pricing");
    });
  }
  function effective(
    id: string,
    channel: PriceChannel,
    at: string,
  ): PriceView | null {
    const target = targets.find((row) => row.id === id);
    if (!target) return null;
    const applicable = (targetId: string, selected: PriceChannel) =>
      records
        .filter(
          (row) =>
            row.id === targetId &&
            row.channel === selected &&
            Date.parse(row.validFrom) <= Date.parse(at) &&
            (!row.validUntil || Date.parse(at) < Date.parse(row.validUntil)),
        )
        .sort((a, b) => Date.parse(b.validFrom) - Date.parse(a.validFrom))[0];
    const own =
      applicable(id, channel) ??
      (channel === "retail" ? applicable(id, "global") : undefined);
    const base =
      own ??
      (target.kind === "variant"
        ? (applicable(target.productTargetId, channel) ??
          applicable(target.productTargetId, "global"))
        : undefined);
    if (!base) return null;
    const inherited = !own && target.kind === "variant";
    const result = {
      ...base,
      id,
      name: names[id] ?? target.label,
      sku: target.kind === "variant" ? target.sku : undefined,
      inherited,
    };
    // As-of resolution is owned by the adapter, including known future schedules.
    const activeIn = (targetId: string, selected: PriceChannel) =>
      schedules.find(
        (row) =>
          row.targetId === targetId &&
          row.channel === selected &&
          row.status !== "CANCELLED" &&
          Date.parse(row.start) <= Date.parse(at) &&
          (!row.end || Date.parse(at) < Date.parse(row.end)),
      );
    const ownProgram =
      activeIn(id, channel) ??
      (channel === "retail" ? activeIn(id, "global") : undefined);
    const parentProgram =
      inherited && target.kind === "variant"
        ? (activeIn(target.productTargetId, channel) ??
          activeIn(target.productTargetId, "global"))
        : undefined;
    const applyProgram = (active: ScheduleView) => {
      if (active.kind === "REGULAR") result.regular = active.amount;
      else result.offer = active.amount;
      if (Date.parse(active.start) > Date.parse(result.validFrom))
        result.validFrom = active.start;
      if (
        active.end &&
        (!result.validUntil ||
          Date.parse(active.end) < Date.parse(result.validUntil))
      )
        result.validUntil = active.end;
      result.channel = active.channel;
    };
    if (parentProgram) applyProgram(parentProgram);
    if (ownProgram) {
      applyProgram(ownProgram);
      if (target.kind === "variant") {
        result.origin = "sku";
        result.inherited = false;
      }
    }
    return result;
  }
  return {
    async listTargets(signal) {
      await refreshTargets(signal);
      return structuredClone(targets);
    },
    async read(query, signal) {
      await refreshTargets(signal);
      const selected = targets.find((row) => row.id === query.targetId);
      const channel = selected?.kind === "product" ? "global" : query.channel;
      const price = effective(query.targetId, channel, clock.now());
      if (!price) return null;
      const breakdown = targets
        .filter((row) => row.productId === selected?.productId)
        .flatMap((row) => {
          const resolved = effective(
            row.id,
            row.kind === "product" ? "global" : query.channel,
            clock.now(),
          );
          return resolved ? [resolved] : [];
        });
      return structuredClone({ price, breakdown });
    },
    async readEditable(target, signal) {
      await refreshTargets(signal);
      return structuredClone(
        effective(target.targetId, target.channel, clock.now()),
      );
    },
    async update(change, signal) {
      await refreshTargets(signal);
      const current = effective(
        change.target.targetId,
        change.target.channel,
        clock.now(),
      );
      const target = targets.find(
        (row) => row.id === change.target.targetId,
      );
      if (!current || !target)
        throw new PricingFailure(
          "error",
          "El objetivo no tiene una lectura disponible.",
        );
      if (change.version !== current.version)
        throw new PricingFailure(
          "conflict",
          "El precio cambió desde tu consulta. Tu propuesta se conserva.",
        );
      const errors = validatePrice(change.draft, current);
      if (Object.keys(errors).length)
        throw new PricingFailure("error", Object.values(errors).join(" "));
      const saved: PriceView = {
        ...current,
        regular: change.draft.regular,
        offer:
          change.draft.offerAction === "ELIMINAR"
            ? null
            : change.draft.offerAction === "ESTABLECER"
              ? change.draft.offer
              : current.offer,
        currency: change.draft.currency,
        inherited: false,
        origin: target.kind === "product" ? "product" : "sku",
        channel: change.target.channel,
        version: current.version + 1,
        validFrom: clock.now(),
      };
      for (const row of records)
        if (
          row.id === target.id &&
          row.channel === change.target.channel &&
          Date.parse(row.validFrom) <= Date.parse(clock.now()) &&
          (!row.validUntil ||
            Date.parse(row.validUntil) > Date.parse(clock.now()))
        )
          row.validUntil = clock.now();
      records.push(saved);
      persist();
      try {
        onUpdated?.(target, current, saved, change.draft.reason);
      } catch (error) {
        console.warn(
          "Fallo en la notificación onUpdated tras guardar el precio:",
          error,
        );
      }
      return structuredClone(saved);
    },
    async listSchedules(targetId, page, signal) {
      signal.throwIfAborted();
      const rows = schedules.filter((row) => row.targetId === targetId);
      return {
        items: structuredClone(rows.slice((page - 1) * 2, page * 2)),
        page,
        pageSize: 2,
        total: rows.length,
      };
    },
    async schedule(targetId, draft, signal) {
      await refreshTargets(signal);
      const start = localInstant(draft.start);
      const end = draft.end ? localInstant(draft.end) : null;
      const reference = start
        ? effective(targetId, draft.channel, start)
        : null;
      const errors = validateSchedule(draft, clock.now(), reference);
      if (!reference)
        throw new PricingFailure(
          "error",
          "No se dispone de un precio de referencia para esa vigencia.",
        );
      if (Object.keys(errors).length)
        throw new PricingFailure("error", Object.values(errors).join(" "));
      if (
        schedules.some(
          (row) =>
            row.targetId === targetId &&
            row.channel === draft.channel &&
            row.status !== "CANCELLED" &&
            Date.parse(start!) < (row.end ? Date.parse(row.end) : Infinity) &&
            (end ? Date.parse(end) : Infinity) > Date.parse(row.start),
        )
      )
        throw new PricingFailure(
          "overlap",
          "La vigencia se superpone con otra del mismo objetivo y canal. Tu propuesta se conserva.",
        );
      const created: ScheduleView = {
        id: `schedule-${++sequence}`,
        targetId,
        kind: draft.kind,
        amount: draft.amount,
        currency: draft.currency,
        channel: draft.channel,
        start: start!,
        end,
        status: "SCHEDULED",
      };
      schedules.unshift(created);
      persist();
      return structuredClone(created);
    },
    async readHistorical(query, at, signal) {
      signal?.throwIfAborted();
      const price = effective(query.targetId, query.channel, at);
      return price
        ? {
            price: structuredClone(price),
            validityId: `vigencia-${price.id}-${price.version}`,
          }
        : null;
    },
    async prevalidate(input, signal) {
      signal.throwIfAborted();
      if (!input.file || typeof input.allowPartial !== "boolean")
        throw new PricingFailure("error", "Selecciona archivo y política.");
      throw new PricingFailure(
        "blocked_contract",
        "No se pudo validar el archivo. La importación no fue iniciada.",
      );
    },
    async readBatch(id, signal) {
      signal.throwIfAborted();
      return id === partialBatch.id ? structuredClone(partialBatch) : null;
    },
    async report(id, signal) {
      signal.throwIfAborted();
      if (id !== partialBatch.id)
        throw new PricingFailure(
          "error",
          "El reporte no está disponible para este lote.",
        );
      return {
        data: new Blob([mockReports.partial], {
          type: "text/csv;charset=utf-8",
        }),
        filename: `reporte-ficticio-${id}.csv`,
      };
    },
  };
}
