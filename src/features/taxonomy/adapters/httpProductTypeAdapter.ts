import type { ProductTypeRepository } from "../services/productTypeRepository";
import type { ProductTypeListItem } from "../types";

/** Frontera para el cliente Gateway compartido; no proporciona credenciales propias. */
export interface TaxonomyGatewayTransport {
  request(path: string, signal: AbortSignal): Promise<Response>;
}

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
): ProductTypeRepository {
  return {
    async list(signal) {
      const abort = signal ?? new AbortController().signal;
      const items: ProductTypeListItem[] = [];
      let page = 1;
      for (;;) {
        const response = await transport.request(
          `/api/v1/tipos-producto?pagina=${page}&tamanio=200`,
          abort,
        );
        if (!response.ok)
          throw new Error(
            `No se pudieron cargar los tipos de producto (HTTP ${response.status}).`,
          );
        const dto = object(await response.json());
        const meta = object(dto.meta);
        if (
          !Array.isArray(dto.items) ||
          !Number.isSafeInteger(meta.totalPaginas) ||
          Number(meta.totalPaginas) < 0 ||
          Number(meta.totalPaginas) > 1000
        )
          throw new Error("Respuesta de Taxonomía inválida.");
        for (const raw of dto.items) {
          const row = object(raw);
          if (
            typeof row.tipoProductoId !== "string" ||
            typeof row.nombre !== "string" ||
            !Number.isSafeInteger(row.schemaVersion) ||
            !["ACTIVO", "INACTIVO", "PENDING_DEACTIVATION"].includes(
              String(row.estado),
            )
          )
            throw new Error("Respuesta de Taxonomía inválida.");
          items.push({
            tipoProductoId: row.tipoProductoId,
            nombre: row.nombre,
            schemaVersion: Number(row.schemaVersion),
            estado:
              row.estado === "ACTIVO"
                ? "Activo"
                : row.estado === "INACTIVO"
                  ? "Inactivo"
                  : "Verificando baja",
            caracteristicasAsignadas: null,
            limiteCaracteristicas: null,
          });
        }
        if (page >= Number(meta.totalPaginas)) break;
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
