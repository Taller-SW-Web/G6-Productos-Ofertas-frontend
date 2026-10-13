import type { AuditEntry, AuditFilters, AuditQuery } from "./auditRepository";

export const emptyFilters: AuditFilters = {
  sku: "",
  desde: "",
  hasta: "",
  usuarioId: "",
  canal: "",
  batchId: "",
};
export const filterLabels: Record<keyof AuditFilters, string> = {
  sku: "SKU",
  desde: "Desde",
  hasta: "Hasta",
  usuarioId: "Usuario (identificador)",
  canal: "Canal",
  batchId: "Lote",
};
export function readAuditQuery(params: URLSearchParams): AuditQuery {
  const filters = { ...emptyFilters };
  for (const key of Object.keys(filters) as (keyof AuditFilters)[])
    filters[key] = params.get(key)?.trim() ?? "";
  const integer = (key: string, fallback: number, max: number) => {
    const value = Number(params.get(key));
    return Number.isSafeInteger(value) && value >= 1 && value <= max
      ? value
      : fallback;
  };
  return {
    ...filters,
    page: integer("pagina", 1, Number.MAX_SAFE_INTEGER),
    size: integer("tamanio", 20, 200),
  };
}
export function appliedFilters(query: AuditFilters): AuditFilters {
  return {
    sku: query.sku,
    desde: query.desde,
    hasta: query.hasta,
    usuarioId: query.usuarioId,
    canal: query.canal,
    batchId: query.batchId,
  };
}
export function writeAuditQuery(
  query: AuditQuery,
  original = new URLSearchParams(),
) {
  const params = new URLSearchParams(original);
  for (const key of Object.keys(emptyFilters) as (keyof AuditFilters)[]) {
    if (query[key]) params.set(key, query[key]);
    else params.delete(key);
  }
  params.delete("exportId");
  params.set("pagina", String(query.page));
  params.set("tamanio", String(query.size));
  return params;
}
export function validateAuditFilters(filters: AuditFilters) {
  for (const field of ["desde", "hasta"] as const) {
    if (
      filters[field] &&
      (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(filters[field]) ||
        !Number.isFinite(Date.parse(filters[field])))
    )
      return "Indica fechas válidas con zona horaria.";
  }
  if (
    filters.desde &&
    filters.hasta &&
    Date.parse(filters.desde) > Date.parse(filters.hasta)
  )
    return "La fecha desde debe ser anterior o igual a la fecha hasta.";
  return undefined;
}
export function toLocal(instant: string) {
  if (!instant || !Number.isFinite(Date.parse(instant))) return "";
  return new Date(Date.parse(instant) - 5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}
export function fromLocal(local: string) {
  if (!local) return "";
  const instant = new Date(
    `${local.length === 16 ? `${local}:00` : local}-05:00`,
  );
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : "";
}
export function decimal(value: string) {
  const [integer, fraction = ""] = value.split(".");
  return `${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction.padEnd(2, "0")}`;
}
export function previousValue(entry: AuditEntry) {
  return entry.before === null ? "Sin precio anterior" : decimal(entry.before);
}
export function nextValue(entry: AuditEntry) {
  return entry.after === null
    ? entry.operation === "RETIRO_OFERTA"
      ? "Sin oferta"
      : "No informado"
    : decimal(entry.after);
}
export function variation(entry: AuditEntry) {
  return entry.variation === null
    ? "No aplicable"
    : `${entry.variation.startsWith("-") || /^0(?:\.0+)?$/.test(entry.variation) ? "" : "+"}${decimal(entry.variation)} %`;
}
export const operationLabel: Record<AuditEntry["operation"], string> = {
  CREACION: "Creación de precio",
  MODIFICACION: "Modificación de precio",
  RETIRO_OFERTA: "Retiro de oferta",
};
export const typeLabel: Record<AuditEntry["priceType"], string> = {
  REGULAR: "Precio regular",
  OFERTA: "Oferta",
};
export function originLabel(origin: string) {
  return (
    (
      {
        BACKOFFICE: "Gestión interna",
        BULK_IMPORT: "Carga masiva",
        API: "Integración externa",
      } as Record<string, string>
    )[origin] ?? "Origen no identificado"
  );
}
export function dateLabel(instant: string) {
  if (!Number.isFinite(Date.parse(instant))) return "Fecha no válida";
  return `${new Intl.DateTimeFormat("es-PE", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "medium" }).format(new Date(instant))} · UTC−5`;
}
