import { secureBase } from "../promotions/adapters/g7Session";
import { isGatewayTokenInvalid } from "../shared/isGatewayTokenInvalid";
import { readOperations, type ReadParameter } from "./readOperations";

export interface ReadSession {
  getAccessToken(signal: AbortSignal): Promise<string | null>;
  refreshAccessToken(rejected: string, signal: AbortSignal): Promise<string | null>;
  invalidateAccessToken(rejected: string): void;
}
export type ReadResult = { kind: "data"; value: unknown } | { kind: "file"; blob: Blob; filename: string };
export class ReadFailure extends Error {}

// These commercial reads allow an omitted channel for a verified human JWT.
// Azure PUBLIC_READ_ONLY has no such principal; the user must choose the channel.
export const requiresPublicReadChannel = (id: string) =>
  ["listarProductos", "obtenerProducto", "consultarPrecios", "obtenerPrecioSku"].includes(id);

const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;

export function isValidDateTime(value: string): boolean {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const tzSign = match[8];
  const tzHour = match[9] !== undefined ? Number(match[9]) : 0;
  const tzMinute = match[10] !== undefined ? Number(match[10]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (tzHour > 23 || tzMinute > 59) return false;
  if (tzSign === "-" && tzHour === 0 && tzMinute === 0) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day &&
    Number.isFinite(Date.parse(value))
  );
}

function validate(parameter: ReadParameter, value: string): void {
  if (parameter.enum && !parameter.enum.some(item => String(item) === value))
    throw new ReadFailure(`Selecciona un valor válido para ${parameter.name}.`);
  if (parameter.type === "integer" || parameter.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number) || (parameter.type === "integer" && !Number.isSafeInteger(number)) ||
        (parameter.minimum !== undefined && number < parameter.minimum) ||
        (parameter.maximum !== undefined && number > parameter.maximum))
      throw new ReadFailure(`Revisa el rango de ${parameter.name}.`);
  }
  if (parameter.format === "date-time" && !isValidDateTime(value))
    throw new ReadFailure(`Ingresa una fecha con hora y zona horaria en ${parameter.name}.`);
}

export function buildReadPath(id: string, values: Readonly<Record<string, string>>): string {
  const operation = readOperations.find(item => item.id === id);
  if (!operation) throw new ReadFailure("La consulta no está disponible.");
  let path = operation.path;
  const query = new URLSearchParams();
  for (const parameter of operation.parameters) {
    const value = values[parameter.name] ?? "";
    if (!value.trim()) {
      if (parameter.required) throw new ReadFailure(`Completa ${parameter.name}.`);
      continue;
    }
    validate(parameter, value);
    if (parameter.location === "path") {
      if ([".", ".."].includes(value) || [...value].some(character => character.charCodeAt(0) < 32))
        throw new ReadFailure("El identificador no es válido.");
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(value));
    } else if (parameter.type === "array") {
      const items = value.split(",").map(item => item.trim());
      if (items.some(item => !item) || (parameter.minItems !== undefined && items.length < parameter.minItems) ||
          (parameter.maxItems !== undefined && items.length > parameter.maxItems))
        throw new ReadFailure(`Revisa los valores separados por comas de ${parameter.name}.`);
      if (parameter.explode) items.forEach(item => query.append(parameter.name, item));
      else query.set(parameter.name, items.join(","));
    } else query.set(parameter.name, value);
  }
  if (/[{}]/.test(path)) throw new ReadFailure("Completa los identificadores de la consulta.");
  return path + (query.size ? `?${query}` : "");
}

async function limitedBody(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new ReadFailure("El servicio no entregó contenido.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20 * 1024 * 1024) throw new ReadFailure("El resultado es demasiado grande; reduce los filtros.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export function createReadOnlyClient(origin: string, session: ReadSession, fetcher: typeof fetch = fetch, options: { publicReadOnly?: boolean } = {}) {
  const base = secureBase(origin, true);
  return {
    async read(id: string, values: Readonly<Record<string, string>>, cancellation: AbortSignal): Promise<ReadResult> {
      if (options.publicReadOnly && requiresPublicReadChannel(id) && !values.canal?.trim())
        throw new ReadFailure("Selecciona el canal para consultar los datos comerciales.");
      const path = buildReadPath(id, values);
      const signal = AbortSignal.any([cancellation, AbortSignal.timeout(65000)]);
      signal.throwIfAborted();
      const token = await session.getAccessToken(signal);
      signal.throwIfAborted();
      if (!token) throw new ReadFailure("Inicia sesión para consultar los datos.");
      const correlation = crypto.randomUUID();
      const send = (bearer: string) => fetcher(base + path, {
        method: "GET", signal, credentials: "omit", redirect: "error", cache: "no-store",
        headers: { Accept: "application/json, text/csv, application/pdf, application/octet-stream, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ...(options.publicReadOnly ? {} : { Authorization: `Bearer ${bearer}` }), "X-Correlation-Id": correlation },
      });
      let response = await send(token);
      if (!options.publicReadOnly && await isGatewayTokenInvalid(response)) {
        const renewed = await session.refreshAccessToken(token, signal);
        if (!renewed) {
          session.invalidateAccessToken(token);
          throw new ReadFailure("Tu sesión terminó. Inicia sesión de nuevo.");
        }
        response = await send(renewed);
        if (await isGatewayTokenInvalid(response)) session.invalidateAccessToken(renewed);
      }
      if (!response.ok) {
        const messages: Record<number, string> = {
          400: "Revisa los filtros e identificadores de la consulta.",
          401: options.publicReadOnly ? "Esta consulta no está habilitada en el modo de lectura actual del backend." : "Tu sesión no permite completar la consulta. Inicia sesión de nuevo.",
          403: "Tu cuenta no tiene permiso para esta consulta.",
          404: "No se encontró el registro o la consulta aún no está habilitada en el backend.",
        };
        throw new ReadFailure(messages[response.status] ?? `No se pudo consultar el backend (HTTP ${response.status}). Reintenta más tarde.`);
      }
      const bytes = await limitedBody(response);
      const mediaType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
      const operation = readOperations.find(item => item.id === id)!;
      if (!operation.mediaTypes.includes(mediaType) || mediaType === "text/html")
        throw new ReadFailure("El backend no entregó el formato esperado para esta consulta.");
      if (mediaType === "application/json") {
        try { return { kind: "data", value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }; }
        catch { throw new ReadFailure("El backend entregó un resultado ilegible."); }
      }
      const filename = /filename="?([^";\r\n]+)/i.exec(response.headers.get("content-disposition") ?? "")?.[1]
        ?.replace(/[\\/:*?"<>|]/g, "_") ?? (mediaType === "application/pdf" ? "reporte.pdf" : mediaType === "text/csv" ? "reporte.csv" : "descarga.xlsx");
      return { kind: "file", blob: new Blob([new Uint8Array(bytes)], { type: mediaType }), filename };
    },
  };
}
