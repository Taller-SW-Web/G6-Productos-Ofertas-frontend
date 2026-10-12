import {
  CouponReadError,
  type CouponMutationScenario,
  type CouponStatus,
} from "./couponRepository";
export type AdministrationScenario =
  | CouponMutationScenario
  | "loading"
  | "empty"
  | "error"
  | "missing"
  | "selection-empty"
  | "selection-error"
  | "unknown-capability";
export interface AdministrationQuery {
  status: CouponStatus | "all";
  kind: string;
  page: number;
  pageSize: number;
}
export interface AdministrationRecord {
  id: string;
  name: string;
  status: CouponStatus;
}
export interface AdministrationPage<T> {
  items: T[];
  total: number;
  page: number;
}
export interface AdministrationRepository<T extends AdministrationRecord, D> {
  list(
    query: AdministrationQuery,
    scenario: AdministrationScenario,
    signal: AbortSignal,
  ): Promise<AdministrationPage<T>>;
  read(
    id: string,
    scenario: AdministrationScenario,
    signal: AbortSignal,
  ): Promise<T | null>;
  save(
    id: string | null,
    draft: D,
    scenario: AdministrationScenario,
    signal: AbortSignal,
  ): Promise<T>;
  changeStatus(
    id: string,
    status: CouponStatus,
    scenario: AdministrationScenario,
    signal: AbortSignal,
  ): Promise<T>;
}
export class AdministrationError extends Error {
  constructor(
    public readonly kind:
      | "validation"
      | "rejected"
      | "unknown"
      | "conflict"
      | "access",
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "AdministrationError";
  }
}
export function administrationScenario(
  params: URLSearchParams,
): AdministrationScenario {
  if (!import.meta.env.DEV || params.get("modoRevision") !== "1")
    return "default";
  const value = params.get("escenario");
  switch (value) {
    case "loading":
    case "empty":
    case "error":
    case "missing":
    case "selection-empty":
    case "selection-error":
    case "unknown-capability":
    case "saving":
    case "save-error":
    case "rejected":
    case "conflict":
    case "unknown-result":
    case "session":
    case "forbidden":
      return value;
    default:
      return "default";
  }
}
export async function checkAdministrationRead(
  scenario: AdministrationScenario,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (scenario === "loading")
    await new Promise<never>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      }),
    );
  if (scenario === "error" || scenario === "selection-error")
    throw new CouponReadError(
      "unavailable",
      "No se pudo consultar la información. Conservamos el contexto y la selección anterior.",
    );
  if (scenario === "session" || scenario === "forbidden")
    throw new CouponReadError(
      scenario,
      scenario === "session"
        ? "Verifica tu sesión antes de continuar."
        : "No tienes permiso para administrar esta información.",
    );
}
export async function checkAdministrationWrite(
  scenario: AdministrationScenario,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (scenario === "saving")
    await new Promise<never>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      }),
    );
  if (scenario === "session" || scenario === "forbidden")
    throw new AdministrationError(
      "access",
      "No tienes permiso para guardar. La configuración anterior se conserva.",
    );
  if (scenario === "save-error" || scenario === "rejected")
    throw new AdministrationError(
      "rejected",
      "El cambio fue rechazado. El borrador y la configuración anterior se conservan.",
    );
  if (scenario === "conflict")
    throw new AdministrationError(
      "conflict",
      "La configuración cambió antes de guardar. Consulta el registro actual y revisa tu propuesta.",
    );
}
export function administrationResponse<T>(
  record: T,
  scenario: AdministrationScenario,
) {
  if (scenario === "unknown-result")
    throw new AdministrationError(
      "unknown",
      "No se pudo confirmar el resultado. Consulta el registro antes de volver a enviar el cambio.",
    );
  return structuredClone(record);
}
export function localDateValid(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(`${value}:00-05:00`);
  return (
    Number.isFinite(date.getTime()) &&
    new Date(date.getTime() - 5 * 3600000).toISOString().slice(0, 16) === value
  );
}
export function validPeriod(from: string, until: string) {
  return localDateValid(from) && localDateValid(until) && from < until;
}
export function positiveInteger(value: string) {
  return (
    /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
  );
}
// Decimal configuration only: no monetary arithmetic or rounding.
export function positiveDecimal(value: string) {
  return /^\d+(\.\d+)?$/.test(value) && /[1-9]/.test(value);
}
export function percentageValid(value: string) {
  if (!positiveDecimal(value)) return false;
  const [whole = "", fraction = ""] = value.split(".");
  const normalized = whole.replace(/^0+/, "") || "0";
  return (
    normalized.length < 3 || (normalized === "100" && !/[1-9]/.test(fraction))
  );
}
export function pageOf<T>(
  rows: readonly T[],
  page: number,
  size: number,
): AdministrationPage<T> {
  const actual = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  return {
    items: structuredClone(rows.slice((actual - 1) * size, actual * size)),
    total: rows.length,
    page: actual,
  };
}
