import type { ProductTypeRepository } from "../services/productTypeRepository";
import { TaxonomySessionRequiredError } from "../services/taxonomyGatewayRuntime";
import type { ProductTypeListItem } from "../types";

/** Frontera para el cliente Gateway compartido; no proporciona credenciales propias. */
export interface TaxonomyGatewayTransport {
  request(
    path: string,
    signal: AbortSignal,
    correlationId: string,
  ): Promise<Response>;
}

const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 15_000;

const unavailable = async (): Promise<never> => {
  throw new Error(
    "Esta operación de Taxonomía aún no está disponible en modo API.",
  );
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Respuesta de Taxonomía inválida.");
  return value as Record<string, unknown>;
};

export function createHttpProductTypeAdapter(
  transport: TaxonomyGatewayTransport,
  timeoutMs = REQUEST_TIMEOUT_MS,
): ProductTypeRepository {
  return {
    async list(signal) {
      const requestSignal = signal ?? new AbortController().signal;
      const correlationId = crypto.randomUUID();
      const items: ProductTypeListItem[] = [];
      const ids = new Set<string>();
      let page = 1;
      let total: number | undefined;
      let totalPages: number | undefined;
      for (;;) {
        const boundedSignal = AbortSignal.any([
          requestSignal,
          AbortSignal.timeout(timeoutMs),
        ]);
        let response: Response;
        try {
          response = await transport.request(
            `/api/v1/tipos-producto?pagina=${page}&tamanio=${PAGE_SIZE}`,
            boundedSignal,
            correlationId,
          );
        } catch (error: unknown) {
          if (requestSignal.aborted) throw error;
          if (error instanceof TaxonomySessionRequiredError) throw error;
          if (
            boundedSignal.reason instanceof DOMException &&
            boundedSignal.reason.name === "TimeoutError"
          )
            throw new Error(
              "La consulta de tipos de producto excedió el tiempo de espera.",
              { cause: error },
            );
          throw new Error("No se pudo conectar con el servicio de Taxonomía.", {
            cause: error,
          });
        }
        if (!response.ok)
          throw new Error(
            `No se pudieron cargar los tipos de producto (HTTP ${response.status}).`,
          );
        let dto: Record<string, unknown>;
        try {
          dto = object(await response.json());
        } catch (error: unknown) {
          if (requestSignal.aborted) throw error;
          if (
            boundedSignal.reason instanceof DOMException &&
            boundedSignal.reason.name === "TimeoutError"
          )
            throw new Error(
              "La consulta de tipos de producto excedió el tiempo de espera.",
              { cause: error },
            );
          throw new Error("Respuesta de Taxonomía inválida.", { cause: error });
        }
        let meta: Record<string, unknown>;
        try {
          meta = object(dto.meta);
        } catch (error: unknown) {
          throw new Error("Respuesta de Taxonomía inválida.", { cause: error });
        }
        const currentTotal = meta.total;
        const currentTotalPages = meta.totalPaginas;
        const currentPage = meta.pagina;
        const currentPageSize = meta.tamanio;
        if (
          !Array.isArray(dto.items) ||
          !Number.isSafeInteger(currentTotal) ||
          Number(currentTotal) < 0 ||
          !Number.isSafeInteger(currentTotalPages) ||
          Number(currentTotalPages) < 0 ||
          currentPage !== page ||
          currentPageSize !== PAGE_SIZE ||
          Number(currentTotalPages) !==
            Math.ceil(Number(currentTotal) / PAGE_SIZE) ||
          dto.items.length > PAGE_SIZE ||
          (Number(currentTotal) === 0 && dto.items.length !== 0) ||
          (Number(currentTotal) > 0 && dto.items.length === 0)
        )
          throw new Error("Respuesta de Taxonomía inválida.");
        if (
          (total !== undefined && total !== currentTotal) ||
          (totalPages !== undefined && totalPages !== currentTotalPages) ||
          dto.items.length !==
            Math.min(
              PAGE_SIZE,
              Number(currentTotal) - (page - 1) * PAGE_SIZE,
            )
        )
          throw new Error("Respuesta de Taxonomía inválida.");
        total = Number(currentTotal);
        totalPages = Number(currentTotalPages);
        for (const raw of dto.items) {
          const row = object(raw);
          if (
            typeof row.tipoProductoId !== "string" ||
            typeof row.nombre !== "string" ||
            !Number.isSafeInteger(row.schemaVersion) ||
            !["ACTIVO", "INACTIVO"].includes(String(row.estado)) ||
            Number(row.schemaVersion) < 0
          )
            throw new Error("Respuesta de Taxonomía inválida.");
          if (ids.has(row.tipoProductoId))
            throw new Error("Respuesta de Taxonomía inválida.");
          ids.add(row.tipoProductoId);
          items.push({
            tipoProductoId: row.tipoProductoId,
            nombre: row.nombre,
            schemaVersion: Number(row.schemaVersion),
            estado: row.estado === "ACTIVO" ? "Activo" : "Inactivo",
            caracteristicasAsignadas: null,
            limiteCaracteristicas: null,
          });
        }
        if (page >= totalPages) break;
        page += 1;
      }
      return { items, limite: null };
    },
    crear: unavailable,
    obtener: unavailable,
    listarCaracteristicasDisponibles: unavailable,
    asociarCaracteristica: unavailable,
    actualizarObligatoriedad: unavailable,
    desasociarCaracteristica: unavailable,
    desactivar: unavailable,
    reactivar: unavailable,
    consultarEstadoOperacion: unavailable,
  };
}
