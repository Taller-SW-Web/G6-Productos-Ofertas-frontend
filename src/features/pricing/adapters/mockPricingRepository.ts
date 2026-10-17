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

export function createMockPricingRepository(
  clock: Clock,
  onUpdated?: (target: PriceTarget, before: PriceView, after: PriceView, reason: string) => void,
): PricingRepository {
  const records = structuredClone(priceRecords);
  const schedules = structuredClone(scheduleFixtures);
  let sequence = schedules.length;
  function effective(
    id: string,
    channel: PriceChannel,
    at: string,
  ): PriceView | null {
    const target = priceTargets.find((row) => row.id === id);
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
      name: targetNames[id] ?? target.label,
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
      signal.throwIfAborted();
      const current = await readMockPricingTargets(signal);
      // Keep the independent historical Pricing examples, without matching names
      // or fabricating a price for a Catalog identity that has no Pricing record.
      const published = priceTargets.filter(target => !current.some(row => row.id === target.id));
      // Keep an already published Pricing target for the same Catalog product/SKU.
      // Its target ID and existing price remain intact; new Catalog identities get no price.
      const additional = current.filter(row => !published.some(target =>
        target.productId === row.productId && target.kind === row.kind &&
        (target.kind === "product" && row.kind === "product"
          ? target.referenceSku === row.referenceSku
          : target.kind === "variant" && row.kind === "variant" && target.sku === row.sku),
      ));
      return [...structuredClone(published), ...additional];
    },
    async read(query, signal) {
      signal.throwIfAborted();
      const selected = priceTargets.find((row) => row.id === query.targetId);
      const channel = selected?.kind === "product" ? "global" : query.channel;
      const price = effective(query.targetId, channel, clock.now());
      if (!price) return null;
      const breakdown = priceTargets
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
      signal.throwIfAborted();
      return structuredClone(
        effective(target.targetId, target.channel, clock.now()),
      );
    },
    async update(change, signal) {
      signal.throwIfAborted();
      const current = effective(
        change.target.targetId,
        change.target.channel,
        clock.now(),
      );
      const target = priceTargets.find(
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
      signal.throwIfAborted();
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
      return structuredClone(created);
    },
    async readHistorical(query, at, signal) {
      signal.throwIfAborted();
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
        "Q-013-01/02: contenido de archivo y admisión parcial pendientes. No se analiza ni admite el archivo.",
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
