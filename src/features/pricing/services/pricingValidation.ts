import type { PriceDraft, ScheduleDraft } from "./pricingModels";

// Compare decimal input exactly, without computing a commercial price or imposing precision.
export function positiveDecimal(value: string) {
  return /^\d+(?:\.\d+)?$/.test(value) && /[1-9]/.test(value);
}
export function decimalLess(a: string, b: string) {
  const [ai, af = ""] = a.split(".");
  const [bi, bf = ""] = b.split(".");
  const precision = Math.max(af.length, bf.length);
  return (
    BigInt(ai + af.padEnd(precision, "0")) <
    BigInt(bi + bf.padEnd(precision, "0"))
  );
}
export function validatePrice(draft: PriceDraft, currentOffer: string | null) {
  const errors: Partial<Record<keyof PriceDraft, string>> = {};
  if (!positiveDecimal(draft.regular))
    errors.regular = "El precio regular debe ser mayor que cero.";
  const offer =
    draft.offerAction === "ESTABLECER"
      ? draft.offer
      : draft.offerAction === "CONSERVAR"
        ? currentOffer
        : null;
  if (
    offer !== null &&
    (!positiveDecimal(offer) ||
      (positiveDecimal(draft.regular) && !decimalLess(offer, draft.regular)))
  )
    errors.offer =
      "La oferta debe ser positiva y menor que el precio regular. Revisa la acción de oferta.";
  if (draft.currency.trim().length !== 3)
    errors.currency = "Indica una moneda de tres caracteres.";
  if (!draft.reason.trim()) errors.reason = "Indica el motivo del cambio.";
  return errors;
}
export const mockClock = "2026-10-02T12:00:00Z";
export const priceTimeZone = "America/Bogota (UTC−5)";
// Local date input has an explicit zone, independent of the browser/OS timezone.
export function localInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value))
    return null;
  const timestamp = Date.parse(`${value}-05:00`);
  const localTimestamp = Date.parse(`${value}Z`);
  if (!Number.isFinite(timestamp) || !Number.isFinite(localTimestamp))
    return null;
  // Date.parse normalizes impossible calendar dates; a normalized date is not valid input.
  const normalized = new Date(localTimestamp).toISOString();
  if (normalized.slice(0, 16) !== value.slice(0, 16)) return null;
  return new Date(timestamp).toISOString();
}
export function displayInstant(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
export function validateSchedule(draft: ScheduleDraft) {
  const errors: Partial<Record<keyof ScheduleDraft, string>> = {};
  if (!positiveDecimal(draft.amount))
    errors.amount = "El importe debe ser mayor que cero.";
  if (draft.currency.trim().length !== 3)
    errors.currency = "Indica una moneda de tres caracteres.";
  const start = localInstant(draft.start);
  const end = draft.end ? localInstant(draft.end) : null;
  if (!start || Date.parse(start) <= Date.parse(mockClock))
    errors.start =
      "El inicio debe ser futuro respecto al reloj de demostración.";
  if (draft.end && (!end || (start && Date.parse(end) <= Date.parse(start))))
    errors.end = "El fin debe ser posterior al inicio.";
  if (!draft.reason.trim())
    errors.reason = "Indica el motivo de la programación.";
  return errors;
}
