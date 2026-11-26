import type {
  InventoryBrandOption,
  InventoryCatalogRepository,
  InventoryCategoryOption,
  InventoryLocationOption,
} from "../services/inventoryCatalogRepository";
import { InventoryError } from "../services/inventoryErrors";
import type { InventoryHttpTransport } from "./apiInventoryAdapter";

// Adaptador HTTP de opciones de catálogo/ubicaciones de inventario (H5).
// - Ubicaciones: conectadas al endpoint autoritativo `GET /api/v1/inventario/ubicaciones`
//   cuando se inyecta transporte HTTP; sin transporte falla explícitamente sin mock.
// - Categorías/marcas: su integración HTTP para poblar filtros queda pendiente de
//   definición (paginación).

export class ApiInventoryCatalogAdapter implements InventoryCatalogRepository {
  constructor(private readonly transport?: InventoryHttpTransport) {}

  async getCategories(): Promise<InventoryCategoryOption[]> {
    return Promise.reject(this.unimplemented("getCategories"));
  }

  async getBrands(): Promise<InventoryBrandOption[]> {
    return Promise.reject(this.unimplemented("getBrands"));
  }

  async getLocations(): Promise<InventoryLocationOption[]> {
    if (!this.transport) {
      return Promise.reject(
        this.blocked(
          "getLocations",
          "Ubicaciones requiere transporte HTTP autenticado inyectado",
        ),
      );
    }

    const items: InventoryLocationOption[] = [];
    const seen = new Set<string>();
    let total: number | undefined;

    for (let page = 1; total === undefined || items.length < total; page++) {
      const response = await this.transport.request(
        `/api/v1/inventario/ubicaciones?soloActivas=false&tamanio=100&pagina=${page}`,
        { method: "GET" },
      );
      if (response.status === 401) {
        throw new InventoryError(
          "NO_AUTENTICADO",
          "Inventario rechazó la autorización.",
        );
      }
      if (response.status === 403) {
        throw new InventoryError(
          "SIN_PERMISO",
          "Tu rol no permite consultar ubicaciones.",
        );
      }
      if (!response.ok) {
        throw new InventoryError(
          "SERVICIO_NO_DISPONIBLE",
          "Inventario no pudo completar la consulta de ubicaciones.",
        );
      }
      const body = (await response.json()) as {
        items?: Array<{
          id?: unknown;
          name?: unknown;
          active?: unknown;
        }>;
        meta?: { total?: unknown; pagina?: unknown };
      };
      if (!body || !Array.isArray(body.items) || !body.meta) {
        throw new InventoryError(
          "RESPUESTA_INCOMPATIBLE",
          "Inventario devolvió una respuesta incompatible de ubicaciones.",
        );
      }
      const pageTotal = Number(body.meta.total);
      if (!Number.isSafeInteger(pageTotal) || pageTotal < 0) {
        throw new InventoryError(
          "RESPUESTA_INCOMPATIBLE",
          "Inventario devolvió total inválido de ubicaciones.",
        );
      }
      total = pageTotal;

      for (const row of body.items) {
        if (
          typeof row.id !== "string" ||
          !row.id.trim() ||
          typeof row.name !== "string" ||
          !row.name.trim() ||
          typeof row.active !== "boolean"
        ) {
          throw new InventoryError(
            "RESPUESTA_INCOMPATIBLE",
            "Inventario devolvió una ubicación inválida.",
          );
        }
        if (seen.has(row.id)) {
          throw new InventoryError(
            "RESPUESTA_INCOMPATIBLE",
            "Inventario repitió una ubicación entre páginas.",
          );
        }
        seen.add(row.id);
        items.push({ id: row.id, name: row.name, active: row.active });
      }
      if (pageTotal === 0) break;
    }

    return items;
  }

  private unimplemented(operation: string): Error {
    return new Error(
      `ApiInventoryCatalogAdapter.${operation} no implementado: BLOCKED_CONTRACT (contrato HTTP pendiente de integración).`,
    );
  }

  private blocked(operation: string, detail: string): Error {
    return new Error(
      `ApiInventoryCatalogAdapter.${operation} bloqueado: BLOCKED_CONTRACT — ${detail}.`,
    );
  }
}
