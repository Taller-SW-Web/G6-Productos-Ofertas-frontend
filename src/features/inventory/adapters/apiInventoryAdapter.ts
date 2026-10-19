import { InventoryError } from "../services/inventoryErrors";
import type { InventoryRepository } from "../services/inventoryRepository";
import type {
  StockItem,
  ThresholdConfig,
  TransferFiltersQuery,
  TransferItem,
} from "../services/inventoryTypes";
import {
  toRecepcionTrasladoRequestDto,
  toThresholdConfig,
  toTransferItem,
  validateRecepcionResponse,
  validateTransferPresentation,
  validateTrasladoListDto,
  type TransferPresentationResolver,
  type TrasladoInventarioDto,
} from "../services/inventoryMappers";

// Adaptador HTTP del feature de inventario (OpenAPI 0.6.0-rc.1, `api-productos`).
//
// Implementa las operaciones cuyo modelo de presentación se puede completar
// SOLO con el contrato más dependencias autoritativas inyectadas:
//   - umbrales   (umbralGlobal/overrides -> ThresholdConfig) mapeo total.
//   - traslados  (listar/obtener/recepción) con un resolvedor de presentación
//     inyectado para los campos que el contrato no transporta (código legible,
//     nombre de producto y nombres de ubicación).
//
// Las operaciones cuyo modelo exige campos que NINGUNA operación de Inventario
// devuelve (productName/categoryName/brandName, locationName, stockVersion,
// updatedAt, blockedUnits, KPIs de traslados…) se rechazan con
// `CONTRATO_BLOQUEADO`: no se completan con datos simulados.
//
// El transporte es un punto de inyección estrecho; lo aporta el cliente HTTP
// compartido del composition root (#45/#109). Este módulo NO crea un segundo
// transporte productivo ni conecta el singleton de selección por sí mismo.

export interface InventoryHttpRequest {
  method: "GET" | "PUT" | "POST";
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
  body?: string;
}

// El cliente compartido adapta su API a esta frontera estrecha.
export interface InventoryHttpTransport {
  request(path: string, request: InventoryHttpRequest): Promise<Response>;
}

export interface HttpInventoryRepositoryDependencies {
  transport: InventoryHttpTransport;
  // Aporta código legible, nombre de producto y nombres de ubicación desde su
  // owner autoritativo (Catálogo/ubicaciones). Si falta, los métodos de
  // traslados fallan con CONTRATO_BLOQUEADO en lugar de simular datos.
  resolveTransferPresentation?: TransferPresentationResolver;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;

const BLOCKED_DETAILS = {
  getStockItems:
    "productName/categoryName/brandName (Catálogo/Taxonomía), locationName (sin endpoint) y stockVersion/updatedAt no los devuelve consultarDisponibilidad",
  getStockDetail:
    "mismos campos sin fuente que getStockItems (consultarDisponibilidad)",
  getDashboardKpis:
    "blockedUnits ausente, totalVendibleSkus ambiguo y los cuatro KPIs de traslados quedan fuera de obtenerDashboardInventario",
  getDashboardAlerts:
    "no existe operación de alertas en el contrato de Inventario",
  getLocationDistribution:
    "blockedTotal y locationName no están en obtenerDashboardInventario.porUbicacion",
  getCategories:
    "operación de Catálogo (no de Inventario); destino de la integración de filtros pendiente de definición (paginación)",
  getBrands:
    "operación de Catálogo (no de Inventario); destino de la integración de filtros pendiente de definición (paginación)",
  getLocations:
    "sin endpoint HTTP publicado (fuente física inventory.locations)",
} as const;

function blocked(operation: string, detail: string): InventoryError {
  return new InventoryError(
    "CONTRATO_BLOQUEADO",
    `Inventario no puede completar ${operation}: ${detail}.`,
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function problemCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.clone().json();
    if (
      body !== null &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof (body as Record<string, unknown>).code === "string"
    )
      return (body as Record<string, string>).code;
  } catch {
    // El status HTTP clasifica el fallo cuando el cuerpo no es un Problem.
  }
  return undefined;
}

export function createHttpInventoryRepository(
  dependencies: HttpInventoryRepositoryDependencies,
): InventoryRepository {
  const { transport, resolveTransferPresentation } = dependencies;
  const pendingWrites = new Set<string>();
  const uncertainWrites = new Set<string>();

  async function send(
    path: string,
    request: InventoryHttpRequest,
    write: boolean,
  ): Promise<Response> {
    request.signal?.throwIfAborted();
    let response: Response;
    try {
      response = await transport.request(path, request);
    } catch (error) {
      if (request.signal?.aborted || isAbort(error)) throw error;
      if (error instanceof InventoryError) throw error;
      if (write)
        throw new InventoryError(
          "RESULTADO_INCIERTO",
          "No se confirmó el resultado de la recepción. Consulta el traslado antes de reintentar.",
        );
      throw new InventoryError(
        "SERVICIO_NO_DISPONIBLE",
        "Inventario no respondió a la consulta.",
      );
    }

    if (response.ok) {
      if (response.status !== 200)
        throw new InventoryError(
          write ? "RESULTADO_INCIERTO" : "RESPUESTA_INCOMPATIBLE",
          "Inventario no devolvió la confirmación HTTP prevista por el contrato.",
        );
      return response;
    }

    const status = response.status;
    const code = await problemCode(response);
    if (status === 401)
      throw new InventoryError(
        "NO_AUTENTICADO",
        "Inventario rechazó la autorización.",
      );
    if (status === 403)
      throw new InventoryError(
        "SIN_PERMISO",
        "Tu rol no permite esta operación de inventario.",
      );
    if (status === 404 && code === "TRASLADO_NO_ENCONTRADO")
      throw new InventoryError(
        "TRASLADO_NO_ENCONTRADO",
        "El traslado ya no está disponible.",
      );
    if (status === 409) {
      if (code === "TRASLADO_NO_RECIBIBLE")
        throw new InventoryError(
          "TRASLADO_NO_RECIBIBLE",
          "El traslado ya está cerrado o no admite nuevas recepciones.",
        );
      throw new InventoryError(
        "IDEMPOTENCY_CONFLICT",
        "La identidad de esta recepción ya se usó con otra intención.",
      );
    }
    if (status === 422) {
      if (code === "CANTIDAD_RECIBIDA_EXCEDE_TRASLADO")
        throw new InventoryError(
          "CANTIDAD_RECIBIDA_EXCEDE_TRASLADO",
          "La recepción supera la cantidad pendiente del traslado.",
        );
      if (code === "DISPOSICION_RECEPCION_INVALIDA")
        throw new InventoryError(
          "DISPOSICION_RECEPCION_INVALIDA",
          "La disposición de recepción no es válida para la operación.",
        );
      throw new InventoryError(
        "VALIDACION",
        "Inventario rechazó los datos enviados. Revisa el formulario.",
      );
    }
    if (status === 400)
      throw new InventoryError(
        "VALIDACION",
        "Inventario rechazó los datos enviados. Revisa el formulario.",
      );
    if (write && status >= 500)
      throw new InventoryError(
        "RESULTADO_INCIERTO",
        "Inventario no confirmó el resultado. Consulta el traslado antes de reintentar.",
      );
    throw new InventoryError(
      "SERVICIO_NO_DISPONIBLE",
      "Inventario no pudo completar la operación.",
    );
  }

  async function json(
    path: string,
    request: InventoryHttpRequest,
    write: boolean,
  ): Promise<unknown> {
    const response = await send(path, request, write);
    try {
      const body: unknown = await response.json();
      if (body === null) throw new Error("Respuesta sin DTO");
      return body;
    } catch {
      throw new InventoryError(
        write ? "RESULTADO_INCIERTO" : "RESPUESTA_INCOMPATIBLE",
        write
          ? "Inventario pudo aplicar la recepción, pero la respuesta no se pudo validar. Consulta el traslado antes de reintentar."
          : "Inventario devolvió una respuesta ilegible.",
      );
    }
  }

  async function present(dto: TrasladoInventarioDto): Promise<TransferItem> {
    if (!resolveTransferPresentation)
      throw blocked(
        "traslados",
        "falta el resolvedor autoritativo de presentación (Catálogo/ubicaciones)",
      );
    const presentation = validateTransferPresentation(
      await resolveTransferPresentation(dto),
    );
    return toTransferItem(dto, presentation);
  }

  function transferQuery(
    filters: TransferFiltersQuery | undefined,
    pagina: number,
  ): string {
    const params = new URLSearchParams();
    if (filters?.status) params.set("estado", filters.status);
    if (filters?.targetLocationId)
      params.set("target_location_id", filters.targetLocationId);
    params.set("pagina", String(pagina));
    params.set("tamanio", String(PAGE_SIZE));
    return params.toString();
  }

  async function readTransfers(
    filters: TransferFiltersQuery | undefined,
  ): Promise<TransferItem[]> {
    const collected: TrasladoInventarioDto[] = [];
    let pagina = 1;
    for (;;) {
      const body = await json(
        `/api/v1/inventario/traslados?${transferQuery(filters, pagina)}`,
        { method: "GET" },
        false,
      );
      const page = validateTrasladoListDto(body);
      collected.push(...page.items);
      if (collected.length > page.total)
        throw new InventoryError(
          "RESPUESTA_INCOMPATIBLE",
          "Inventario devolvió más traslados que el total declarado.",
        );
      if (collected.length === page.total) break;
      if (page.items.length === 0 || pagina >= MAX_PAGES)
        throw new InventoryError(
          "RESPUESTA_INCOMPATIBLE",
          "Inventario devolvió una paginación de traslados incoherente.",
        );
      pagina += 1;
    }
    return Promise.all(collected.map((dto) => present(dto)));
  }

  return {
    getThresholds(): Promise<ThresholdConfig> {
      return json("/api/v1/inventario/umbrales", { method: "GET" }, false).then(
        toThresholdConfig,
      );
    },

    updateGlobalThreshold(threshold: number): Promise<ThresholdConfig> {
      return json(
        "/api/v1/inventario/umbrales/global",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ umbral: threshold }),
        },
        true,
      ).then(toThresholdConfig);
    },

    updateSkuThreshold(
      sku: string,
      threshold: number,
    ): Promise<ThresholdConfig> {
      return json(
        `/api/v1/inventario/umbrales/skus/${encodeURIComponent(sku)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ umbral: threshold }),
        },
        true,
      ).then(toThresholdConfig);
    },

    getTransfers(filters?: TransferFiltersQuery): Promise<TransferItem[]> {
      return readTransfers(filters);
    },

    async receiveTransfer(payload): Promise<TransferItem> {
      const key = payload.transferId;
      if (pendingWrites.has(key))
        throw new InventoryError(
          "RESULTADO_INCIERTO",
          "Hay una recepción pendiente de confirmación para este traslado.",
        );
      if (uncertainWrites.has(key))
        throw new InventoryError(
          "RESULTADO_INCIERTO",
          "El resultado anterior sigue sin verificarse. Consulta el traslado antes de recibir otra vez.",
        );
      pendingWrites.add(key);
      try {
        const body = await json(
          `/api/v1/inventario/traslados/${encodeURIComponent(key)}/recepciones`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "Idempotency-Key": payload.operationId,
            },
            body: JSON.stringify(toRecepcionTrasladoRequestDto(payload)),
          },
          true,
        );
        const { traslado } = validateRecepcionResponse(body);
        const item = await present(traslado);
        uncertainWrites.delete(key);
        return item;
      } catch (error) {
        if (
          error instanceof InventoryError &&
          error.code === "RESULTADO_INCIERTO"
        )
          uncertainWrites.add(key);
        throw error;
      } finally {
        pendingWrites.delete(key);
      }
    },

    getStockItems(): Promise<StockItem[]> {
      return Promise.reject(
        blocked("getStockItems", BLOCKED_DETAILS.getStockItems),
      );
    },

    getStockDetail(): Promise<StockItem | null> {
      return Promise.reject(
        blocked("getStockDetail", BLOCKED_DETAILS.getStockDetail),
      );
    },

    getDashboardKpis() {
      return Promise.reject(
        blocked("getDashboardKpis", BLOCKED_DETAILS.getDashboardKpis),
      );
    },

    getDashboardAlerts() {
      return Promise.reject(
        blocked("getDashboardAlerts", BLOCKED_DETAILS.getDashboardAlerts),
      );
    },

    getLocationDistribution() {
      return Promise.reject(
        blocked("getLocationDistribution", BLOCKED_DETAILS.getLocationDistribution),
      );
    },

    getCategories() {
      return Promise.reject(
        blocked("getCategories", BLOCKED_DETAILS.getCategories),
      );
    },

    getBrands() {
      return Promise.reject(blocked("getBrands", BLOCKED_DETAILS.getBrands));
    },

    getLocations() {
      return Promise.reject(blocked("getLocations", BLOCKED_DETAILS.getLocations));
    },
  };
}
