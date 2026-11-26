import type { G7Session } from "../../promotions/adapters/g7Session";
import { isGatewayTokenInvalid } from "../../shared/isGatewayTokenInvalid";
import { hasBulkCapabilityEvidence, isVerifiedBulkHomologationManifest, type VerifiedBulkHomologationManifest } from "./bulkHomologationManifest";
import type { BulkRepository, DownloadResource } from "../services/bulkRepository";
import { BulkRepositoryError } from "../services/bulkErrors";
import type {
  BulkAdmissionReconciliation,
  BulkDomainStep,
  BulkExportFormat,
  BulkExportJob,
  BulkImportBatch,
  BulkImportRow,
  BulkResumeAccepted,
  BulkResumeBlockReason,
  BulkResumeStep,
} from "../types/bulk";

const root = "/api/v1/carga-masiva/productos";
const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
type HttpInit = { method: "GET" | "POST"; signal: AbortSignal; headers: Record<string, string>; body?: BodyInit };
export interface BulkHttpTransport { request(path: string, init: HttpInit): Promise<Response> }
type AuthSession = Pick<G7Session, "getAccessToken" | "refreshAccessToken" | "invalidateAccessToken"> & Partial<Pick<G7Session, "snapshot">>;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("La respuesta del servicio no tiene la estructura esperada.");
  return value as Record<string, unknown>;
}
function invalid(message = "La respuesta del servicio está incompleta."): never {
  throw new BulkRepositoryError(message, "unknown");
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
function oneOf<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) return invalid("El servicio devolvió un estado no compatible con el contrato.");
  return value as T;
}
const batchStatuses = ["QUEUED", "PROCESSING", "COMPLETED", "FAILED_GENERAL"] as const;
const rowStatuses = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
const domains = ["CATALOGO", "PRICING", "INVENTARIO"] as const;
const exportStatuses = batchStatuses;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resumeBlockReasons = ["LOTE_NO_TERMINAL", "SIN_PASOS_REINTENTABLES", "RESULTADO_INCIERTO", "PROTOCOLO_DOMINIO_NO_HABILITADO"] as const;

export interface BulkHttpRepositoryOptions {
  publicReads?: boolean;
  reconciliationEnabled?: boolean;
  replayEnabled?: boolean;
  resumeEnabled?: boolean;
  homologationManifest?: VerifiedBulkHomologationManifest;
}

function mapStep(value: unknown): BulkDomainStep {
  const item = record(value);
  return {
    domain: oneOf(item.dominio, domains),
    status: oneOf(item.status, rowStatuses),
    code: typeof item.code === "string" ? item.code as BulkDomainStep["code"] : null,
    detail: typeof item.detail === "string" ? item.detail : null,
  };
}
function mapRow(value: unknown): BulkImportRow {
  const item = record(value);
  if (!Array.isArray(item.applied_domains) || !Array.isArray(item.steps) || typeof item.needs_reconciliation !== "boolean") return invalid();
  const row: BulkImportRow = {
    row_id: text(item.row_id),
    status: oneOf(item.status, rowStatuses),
    applied_domains: item.applied_domains.map((domain) => oneOf(domain, domains)),
    needs_reconciliation: item.needs_reconciliation,
    steps: item.steps.map(mapStep),
  };
  if (typeof item.sku === "string") row.sku = item.sku;
  if (typeof item.nombre === "string") row.nombre = item.nombre;
  if (typeof item.failed_domain === "string") row.failed_domain = oneOf(item.failed_domain, domains);
  else row.failed_domain = null;
  if (typeof item.code === "string") row.code = item.code as BulkImportRow["code"];
  if (typeof item.detail === "string") row.detail = item.detail;
  return row;
}
function mapResumeEligibility(value: unknown, batch: BulkImportBatch) {
  if (value === undefined || value === null) return undefined;
  try {
    const item = record(value);
    if (item.protocolo !== "BULK_RETRY_V1" || typeof item.elegible !== "boolean" || !Array.isArray(item.pasos)) return undefined;
    const steps: BulkResumeStep[] = item.pasos.map((entry) => {
      const step = record(entry);
      const rowId = text(step.row_id);
      if (!uuidPattern.test(rowId) || (step.dominio !== "CATALOGO" && step.dominio !== "INVENTARIO")) return invalid("La elegibilidad contiene un paso inválido.");
      return { row_id: rowId, domain: step.dominio };
    });
    const uniqueSteps = new Set(steps.map((step) => `${step.row_id}:${step.domain}`));
    if (uniqueSteps.size !== steps.length) return undefined;
    const blockedReason = item.motivo_bloqueo;
    if (item.elegible) {
      if (steps.length === 0 || blockedReason !== null || batch.status !== "COMPLETED" ||
          typeof batch.total_rows !== "number" || !batch.rows || batch.rows.length !== batch.total_rows) return undefined;
      if (steps.some((candidate) => candidate.domain !== "CATALOGO")) return undefined;
      const candidatesAreVerifiable = steps.every((candidate) => {
        const matchingRows = batch.rows!.filter((row) => String(row.row_id) === candidate.row_id);
        if (matchingRows.length !== 1) return false;
        const row = matchingRows[0]!;
        if (row.status === "COMPLETED" || row.applied_domains.includes(candidate.domain)) return false;
        const matchingSteps = row.steps.filter((step) => step.domain === candidate.domain);
        return matchingSteps.length === 1 && matchingSteps[0]?.status !== "COMPLETED";
      });
      if (!candidatesAreVerifiable) return undefined;
      return { protocol: "BULK_RETRY_V1" as const, eligible: true, steps, blockedReason: null };
    }
    if (steps.length !== 0 || typeof blockedReason !== "string" || !(resumeBlockReasons as readonly string[]).includes(blockedReason)) return undefined;
    return { protocol: "BULK_RETRY_V1" as const, eligible: false, steps, blockedReason: blockedReason as BulkResumeBlockReason };
  } catch {
    return undefined;
  }
}
function mapBatch(value: unknown): BulkImportBatch {
  const item = record(value);
  const batch: BulkImportBatch = {
    batch_id: text(item.batch_id),
    status: oneOf(item.status, batchStatuses),
    total_rows: item.total_rows === undefined ? null : count(item.total_rows),
    completed_rows: count(item.completed_rows),
    failed_rows: count(item.failed_rows),
    needs_reconciliation: typeof item.needs_reconciliation === "boolean" ? item.needs_reconciliation : invalid(),
    // The status contract has no timestamps; use a blank value until a status response supplies them.
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
  };
  if (item.correlation_id !== undefined) {
    const correlationId = text(item.correlation_id);
    if (!uuidPattern.test(correlationId)) return invalid("La correlación del lote consultado no es válida.");
    batch.correlation_id = correlationId;
  }
  if (Array.isArray(item.rows)) batch.rows = item.rows.map(mapRow);
  const eligibility = mapResumeEligibility(item.reanudacion, batch);
  if (eligibility) batch.reanudacion = eligibility;
  return batch;
}
function mapAccepted(value: unknown, expectedCorrelationId: string): BulkImportBatch {
  const accepted = record(value);
  if (oneOf(accepted.status, ["QUEUED"] as const) !== "QUEUED" || count(accepted.template_version) !== 2) return invalid();
  const batchId = text(accepted.batch_id);
  const correlationId = text(accepted.correlation_id);
  if (!uuidPattern.test(batchId) || !uuidPattern.test(correlationId) || correlationId !== expectedCorrelationId) {
    return invalid("La respuesta de admisión contiene una identidad incompleta, inválida o contradictoria; el resultado queda incierto.");
  }
  return {
    batch_id: batchId, status: "QUEUED", total_rows: null,
    completed_rows: 0, failed_rows: 0, needs_reconciliation: false,
    created_at: "", updated_at: "",
  };
}
export function mapResumeAccepted(value: unknown, expectedBatchId: string, expectedOriginalCorrelationId?: string): BulkResumeAccepted {
  const accepted = record(value);
  const status = oneOf(accepted.status, ["QUEUED"] as const);
  const batchId = text(accepted.batch_id);
  const originalCorrelationId = text(accepted.correlation_id);
  if (status !== "QUEUED" || count(accepted.template_version) !== 2 ||
      !uuidPattern.test(batchId) || batchId !== expectedBatchId || !uuidPattern.test(originalCorrelationId) ||
      (expectedOriginalCorrelationId !== undefined && originalCorrelationId !== expectedOriginalCorrelationId)) {
    return invalid("La aceptación de reanudación tiene una identidad incompleta o no corresponde al lote original.");
  }
  return { batch_id: batchId, correlation_id: originalCorrelationId, status: "QUEUED", template_version: 2 };
}
export function mapReconciliation(value: unknown, expectedCorrelationId: string): BulkAdmissionReconciliation {
  const item = record(value);
  const batchId = text(item.batch_id);
  const correlationId = text(item.correlation_id);
  const status = oneOf(item.status, batchStatuses);
  if (!uuidPattern.test(batchId) || !uuidPattern.test(correlationId) || correlationId !== expectedCorrelationId || count(item.template_version) !== 2) {
    return invalid("La conciliación devolvió una identidad incompleta, inválida o contradictoria.");
  }
  return { batch_id: batchId, correlation_id: correlationId, status, template_version: 2 };
}
function mapExport(value: unknown): BulkExportJob {
  const item = record(value);
  return {
    export_id: text(item.export_id),
    status: oneOf(item.status, exportStatuses),
    format: oneOf(item.formato, ["CSV", "XLSX"] as const),
    created_at: text(item.created_at),
    updated_at: typeof item.completed_at === "string" ? item.completed_at : text(item.created_at),
    ...(typeof item.download_url === "string" ? { download_url: item.download_url } : {}),
  };
}
function safeFileName(value: string | null, fallback: string, expectedExtension: string): string {
  const candidate = value?.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  let decoded = candidate?.[2];
  if (candidate?.[1]) {
    try { decoded = decodeURIComponent(candidate[1]); }
    catch { decoded = undefined; }
  }
  const leaf = decoded?.split(/[\\/]/).pop();
  const safe = leaf ? [...leaf].map((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 || '<>:"|?*'.includes(char) ? "_" : char;
  }).join("").replace(/^\.+/, "").replace(/[. ]+$/, "").trim().slice(0, 180) : undefined;
  return safe && safe.toLowerCase().endsWith(expectedExtension) ? safe : fallback;
}

export function createBulkFetchTransport(origin: string, fetcher: typeof fetch = fetch): BulkHttpTransport {
  const url = new URL(origin);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new BulkRepositoryError("VITE_GATEWAY_ORIGIN debe ser un origen HTTPS o loopback HTTP, sin credenciales ni ruta.", "configuration");
  }
  return { request: (path, init) => fetcher(url.origin + path, { ...init, credentials: "omit", redirect: "error", cache: "no-store" }) };
}

export function createHttpBulkRepository(transport: BulkHttpTransport, session: AuthSession, options: BulkHttpRepositoryOptions = {}): BulkRepository {
  const manifest = isVerifiedBulkHomologationManifest(options.homologationManifest) ? options.homologationManifest : undefined;
  const reconciliationEnabled = options.reconciliationEnabled === true && hasBulkCapabilityEvidence(manifest, "reconciliation");
  const replaySupported = options.replayEnabled === true && reconciliationEnabled && hasBulkCapabilityEvidence(manifest, "replay");
  const resumeSupported = options.resumeEnabled === true && hasBulkCapabilityEvidence(manifest, "catalogRetry");
  const exportIntentKey = async (format: BulkExportFormat, userId: string) => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}\u0000${format}`)));
    return `g6:bulk:export-uncertain:${[...digest].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
  };
  async function send(path: string, method: HttpInit["method"], signal?: AbortSignal, body?: BodyInit, json = false, correlationId: string = crypto.randomUUID(), expectedOwner?: string): Promise<Response> {
    const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
    bounded.throwIfAborted();
    let token: string | null;
    try { token = await session.getAccessToken(bounded); }
    catch (error) { if (bounded.aborted) throw error; throw new BulkRepositoryError("No se pudo renovar la sesión. Inicia sesión de nuevo.", "configuration"); }
    bounded.throwIfAborted();
    if (!token || /[\r\n]/.test(token)) throw new BulkRepositoryError("Inicia sesión para usar la carga masiva en modo API.", "configuration");
    if (expectedOwner && session.snapshot?.().user?.id !== expectedOwner) throw new BulkRepositoryError("La sesión cambió antes del despacho; no se envió la importación.", "configuration");
    const request = (accessToken: string) => transport.request(path, {
      method, signal: bounded,
      headers: { Accept: "application/json, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Authorization: `Bearer ${accessToken}`, "X-Correlation-Id": correlationId, ...(json ? { "Content-Type": "application/json" } : {}) },
      ...(body === undefined ? {} : { body }),
    });
    let response: Response;
    try { response = await request(token); }
    catch (error) {
      if (method === "POST") throw new BulkRepositoryError("No se confirmó el resultado de Carga masiva. Consulta el estado antes de repetir la operación.", "unknown");
      if (bounded.aborted) throw error;
      throw new BulkRepositoryError("No se pudo conectar con Gateway. Revisa la conexión e inténtalo de nuevo.", "communication");
    }
    if (await isGatewayTokenInvalid(response)) {
      if (method === "POST") session.invalidateAccessToken(token);
      else {
        const renewed = await session.refreshAccessToken(token, bounded).catch(() => null);
        if (renewed && !/[\r\n]/.test(renewed)) {
          response = await request(renewed).catch(() => { throw new BulkRepositoryError("No se pudo conectar con Gateway.", "communication"); });
          if (await isGatewayTokenInvalid(response)) session.invalidateAccessToken(renewed);
        } else session.invalidateAccessToken(token);
      }
    }
    if (expectedOwner && session.snapshot?.().user?.id !== expectedOwner) throw new BulkRepositoryError("La sesión cambió mientras se procesaba la admisión. Se conserva la intención original sin atribuir la respuesta a otra identidad.", "unknown");
    if (!response.ok) {
      const problem = await response.clone().json().catch(() => null) as { code?: unknown } | null;
      const code = typeof problem?.code === "string" ? problem.code : "ERROR_HTTP";
      const statusMessage: Record<number, string> = {
        401: "La sesión expiró o no es válida. Inicia sesión de nuevo.",
        403: "Tu sesión no tiene permiso para esta operación (SCOPE_INSUFICIENTE).",
        404: "El recurso solicitado no existe o la operación aún no está disponible en el backend.",
        409: "El lote cambió o tiene un conflicto; actualiza su estado antes de volver a intentarlo.",
        503: "El servicio de carga masiva no está disponible temporalmente.",
      };
      throw new BulkRepositoryError(`HTTP ${response.status}. ${statusMessage[response.status] ?? "La solicitud falló."} Código: ${code}.`, response.status === 401 || response.status === 403 ? "configuration" : (response.status >= 500 || response.status === 408) && method === "POST" ? "unknown" : response.status >= 500 ? "communication" : "rejected", response.status, code);
    }
    return response;
  }
  async function json(response: Response, expected: number, signal?: AbortSignal): Promise<unknown> {
    if (response.status !== expected || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) invalid("La respuesta HTTP no coincide con el contrato publicado.");
    try { signal?.throwIfAborted(); return await response.json(); }
    catch (error) { if (error instanceof BulkRepositoryError || signal?.aborted) throw error; return invalid("El servicio devolvió JSON ilegible."); }
  }
  async function download(path: string, fallback: string, signal?: AbortSignal, expectedMime?: string): Promise<DownloadResource> {
    const response = await send(path, "GET", signal);
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (response.status !== 200 || (type !== "text/csv" && type !== xlsxMime)) invalid("El servicio no entregó un archivo CSV o XLSX válido.");
    if (expectedMime && type !== expectedMime) invalid("El tipo MIME del archivo no coincide con el formato solicitado.");
    const blob = await response.blob();
    if (blob.size === 0) invalid("El servicio entregó un archivo vacío.");
    const extension = expectedMime === xlsxMime ? ".xlsx" : ".csv";
    return { blob, fileName: safeFileName(response.headers.get("content-disposition"), fallback, extension) };
  }
  async function submitImport(file: File, summary: { owner?: string; contentHash?: string; correlationId?: string; detectedRows?: number } | undefined, signal: AbortSignal | undefined, replay: boolean): Promise<BulkImportBatch> {
    const userId = session.snapshot?.().user?.id;
    const correlationId = summary?.correlationId;
    if (!userId) throw new BulkRepositoryError("Inicia sesión antes de importar.", "configuration");
    if (!correlationId || !uuidPattern.test(correlationId)) throw new BulkRepositoryError("La correlación de la intención no es un UUID válido.", "configuration");
    if (summary?.owner !== userId || !summary.contentHash || !/^[0-9a-f]{64}$/i.test(summary.contentHash)) throw new BulkRepositoryError("La identidad G7 y el hash no pertenecen a una intención API validada.", "configuration");
    const actualHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(value => value.toString(16).padStart(2, "0")).join("");
    if (actualHash !== summary.contentHash) throw new BulkRepositoryError("El archivo seleccionado no coincide con el hash de la intención persistida.", "configuration");
    if (session.snapshot?.().user?.id !== userId) throw new BulkRepositoryError("La sesión cambió mientras se verificaba el archivo; se conserva la intención original.", "unknown");
    const intentKey = `g6:bulk:import-pending:${encodeURIComponent(userId)}:${encodeURIComponent(correlationId)}`;
    try {
      const raw = sessionStorage.getItem(intentKey);
      if (replay) {
        if (!replaySupported) throw new BulkRepositoryError("El backend aún no acredita replay idempotente concurrente; no se reenvió el POST.", "configuration");
        if (!raw) throw new BulkRepositoryError("No existe la intención incierta original para reproducir.", "configuration");
        const marker = JSON.parse(raw) as Record<string, unknown>;
        if (marker.userId !== userId || marker.correlationId !== correlationId || marker.contentHash !== actualHash || marker.state !== "PENDING_RECONCILIATION") {
          throw new BulkRepositoryError("El archivo no coincide con la intención incierta original; no se reenvió el POST.", "configuration");
        }
      } else {
        if (raw) throw new BulkRepositoryError("Esta correlación ya pertenece a una intención pendiente. Se conserva y no se reenvió.", "unknown");
        sessionStorage.setItem(intentKey, JSON.stringify({ userId, correlationId, contentHash: actualHash, state: "IN_FLIGHT", at: Date.now() }));
      }
    } catch (error) {
      if (error instanceof BulkRepositoryError) throw error;
      throw new BulkRepositoryError("No se pudo persistir o validar el marcador de admisión; no se envió la importación.", "unknown");
    }
    const form = new FormData(); form.append("archivo", file); form.append("template_version", "2");
    try {
      const accepted = mapAccepted(await json(await send(`${root}/importaciones`, "POST", signal, form, false, correlationId, userId), 202, signal), correlationId);
      if (session.snapshot?.().user?.id !== userId) throw new BulkRepositoryError("La sesión cambió antes de confirmar la admisión. Se conserva la intención original.", "unknown");
      try { sessionStorage.removeItem(intentKey); } catch { /* page-level intent remains fail-closed */ }
      return accepted;
    } catch (error) {
      if (replay) {
        try { const marker = JSON.parse(sessionStorage.getItem(intentKey) ?? "{}"); sessionStorage.setItem(intentKey, JSON.stringify({ ...marker, state: "PENDING_RECONCILIATION" })); } catch { /* preserve original intent */ }
      } else if (error instanceof BulkRepositoryError && (error.category === "rejected" || error.category === "configuration")) {
        try { sessionStorage.removeItem(intentKey); } catch { /* preserve fail-closed intent */ }
      } else {
        try { const marker = JSON.parse(sessionStorage.getItem(intentKey) ?? "{}"); sessionStorage.setItem(intentKey, JSON.stringify({ ...marker, state: "PENDING_RECONCILIATION" })); } catch { /* preserve fail-closed intent */ }
      }
      throw error;
    }
  }
  return {
    resumeSupported,
    reconciliationEnabled,
    replaySupported,
    async getTemplate(format, signal) { return download(`${root}/plantilla?formato=${format}`, `plantilla-productos.${format.toLowerCase()}`, signal, format === "XLSX" ? xlsxMime : "text/csv"); },
    async createImport(file, summary, signal) { return submitImport(file, summary, signal, false); },
    async replayImport(file, intent, confirmedByUser, signal) {
      if (!replaySupported) throw new BulkRepositoryError("El backend aún no acredita replay idempotente concurrente; no se reenvió el POST.", "configuration");
      if (!confirmedByUser) throw new BulkRepositoryError("Confirma explícitamente la repetición de la misma intención.", "configuration");
      return submitImport(file, intent, signal, true);
    },
    async reconcileImport(correlationId, expectedOwner, signal) {
      if (!reconciliationEnabled) throw new BulkRepositoryError("La conciliación permanece deshabilitada hasta acreditar el endpoint y su compatibilidad.", "configuration");
      if (!uuidPattern.test(correlationId)) throw new BulkRepositoryError("La correlación de conciliación no es un UUID válido.", "configuration");
      if (!expectedOwner || session.snapshot?.().user?.id !== expectedOwner) throw new BulkRepositoryError("La sesión no corresponde al propietario original de la intención.", "configuration");
      try {
        const response = await send(`${root}/importaciones/por-correlacion/${encodeURIComponent(correlationId)}`, "GET", signal, undefined, false, correlationId, expectedOwner);
        const result = mapReconciliation(await json(response, 200, signal), correlationId);
        signal?.throwIfAborted();
        if (session.snapshot?.().user?.id !== expectedOwner) throw new BulkRepositoryError("La sesión cambió durante la conciliación; la intención se conserva sin cambios.", "unknown");
        return result;
      } catch (error) {
        if (error instanceof BulkRepositoryError && error.status === 404 && error.code === "LOTE_NO_ENCONTRADO") return null;
        throw error;
      }
    },
    async getImport(batchId, signal, expectedOwner) {
      if (expectedOwner && session.snapshot?.().user?.id !== expectedOwner) throw new BulkRepositoryError("La sesión no corresponde al propietario original del lote.", "configuration");
      try {
        const batch = mapBatch(await json(await send(`${root}/importaciones/${encodeURIComponent(batchId)}`, "GET", signal, undefined, false, crypto.randomUUID(), expectedOwner), 200, signal));
        if (batch.batch_id !== batchId) invalid("El lote consultado no coincide con el identificador solicitado.");
        return batch;
      }
      catch (error) { if (error instanceof BulkRepositoryError && error.status === 404 && error.code === "LOTE_NO_ENCONTRADO") return null; throw error; }
    },
    async getImportReport(batchId, signal) { return download(`${root}/importaciones/${encodeURIComponent(batchId)}/reporte`, `reporte-${batchId}.csv`, signal, "text/csv"); },
    async resumeImport(batchId, signal, request) {
      if (!resumeSupported) throw new BulkRepositoryError("Backend y consumidor aún no acreditan BULK_RETRY_V1; la reanudación sigue bloqueada.", "rejected", 409, "RETRY_PROTOCOL_NOT_APPROVED");
      if (!request || !uuidPattern.test(request.correlationId) || request.motivo !== null) throw new BulkRepositoryError("La reanudación requiere una correlación estable y el motivo contractual.", "configuration");
      const key = `g6:bulk:resume-blocked:${encodeURIComponent(session.snapshot?.().user?.id ?? "anonymous")}:${encodeURIComponent(batchId)}`;
      if (sessionStorage.getItem(key) === "1") throw new BulkRepositoryError("Backend no habilitó el protocolo de reanudación para este lote.", "rejected", 409, "RETRY_PROTOCOL_NOT_APPROVED");
      const owner = session.snapshot?.().user?.id;
      try {
        const accepted = await json(await send(`${root}/importaciones/${encodeURIComponent(batchId)}/reanudar`, "POST", signal, JSON.stringify({ motivo: request.motivo }), true, request.correlationId, owner), 202, signal);
        return mapResumeAccepted(accepted, batchId, request.originalCorrelationId);
      }
      catch (error) {
        if (error instanceof BulkRepositoryError && error.code === "RETRY_PROTOCOL_NOT_APPROVED") { try { sessionStorage.setItem(key, "1"); } catch { /* backend rejection remains visible */ } }
        throw error;
      }
    },
    async createExport(format: BulkExportFormat, signal) {
      const owner = session.snapshot?.().user?.id;
      if (!owner) throw new BulkRepositoryError("Inicia sesión para solicitar una exportación.", "configuration");
      const key = await exportIntentKey(format, owner);
      try {
        if (sessionStorage.getItem(key) === "1") throw new BulkRepositoryError("La solicitud anterior de exportación sigue sin resolverse para esta identidad. No se reenvió.", "unknown");
        sessionStorage.setItem(key, "1");
      } catch (error) {
        if (error instanceof BulkRepositoryError) throw error;
        throw new BulkRepositoryError("No se pudo persistir el bloqueo de exportación; no se envió la solicitud.", "unknown");
      }
      try {
        const result = mapExport(await json(await send(`${root}/exportaciones`, "POST", signal, JSON.stringify({ formato: format }), true, undefined, owner), 202, signal));
        if (session.snapshot?.().user?.id !== owner) throw new BulkRepositoryError("La sesión cambió antes de confirmar la exportación.", "unknown");
        sessionStorage.removeItem(key);
        return result;
      } catch (error) {
        if (error instanceof BulkRepositoryError && error.category !== "communication" && error.category !== "unknown") sessionStorage.removeItem(key);
        throw error;
      }
    },
    async getExport(exportId, signal) {
      try {
        const job = mapExport(await json(await send(`${root}/exportaciones/${encodeURIComponent(exportId)}`, "GET", signal), 200, signal));
        if (job.export_id !== exportId) invalid("La exportación consultada no coincide con el identificador solicitado.");
        return job;
      }
      catch (error) { if (error instanceof BulkRepositoryError && error.status === 404 && error.code === "LOTE_NO_ENCONTRADO") return null; throw error; }
    },
    async getExportFile(exportId, signal) {
      const job = await this.getExport(exportId, signal);
      if (!job || job.status !== "COMPLETED") return null;
      const expectedMime = job.format === "XLSX" ? xlsxMime : "text/csv";
      const extension = job.format.toLowerCase();
      const resource = await download(`${root}/exportaciones/${encodeURIComponent(exportId)}/archivo`, `exportacion-${exportId}.${extension}`, signal, expectedMime);
      return resource;
    },
  };
}
