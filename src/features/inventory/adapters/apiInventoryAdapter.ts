import type { InventoryRepository } from "../services/inventoryRepository";
import type {
  InventoryAlert,
  InventoryBrandOption,
  InventoryCategoryOption,
  InventoryKpiSummary,
  InventoryLocationOption,
  LocationDistribution,
  StockItem,
  ThresholdConfig,
  TransferItem,
} from "../services/inventoryTypes";

// Adaptador HTTP del feature de inventario.
//
// BLOQUEADO_CONTRATO (BLOCKED_CONTRACT). El OpenAPI vigente del provider
// (`api-productos`, 0.6.0-rc.1) SÍ publica las operaciones del módulo de
// Inventario, pero el modelo de presentación de este feature exige campos que
// ninguna operación de Inventario devuelve. Esos campos pertenecen a Catálogo /
// Taxonomía (producto, categoría, marca), a una fuente de nombres de ubicación
// sin endpoint publicado, o no existen en el contrato. Completar el mapeo
// exigiría inventar datos (regla §9 de `AGENTS.md`), por lo que NO se implementa
// todavía y `inventoryProvider` mantiene el modo API como pendiente visible.
//
// Segunda causa, independiente del mapeo: la composición HTTP del frontend
// (cliente compartido, base URL, bearer, correlación e `Idempotency-Key`)
// depende del cliente compartido aún no integrado, y su cableado —el
// `composition root`— no es responsabilidad de esta área. Este archivo NO debe
// activarse en producción ni conectarse desde `inventoryProvider` hasta que
// ambas causas se resuelvan.
//
// Registro por método: operación del contrato y campos de presentación sin
// origen contractual.
//
// | Método del repositorio            | operationId (OpenAPI)                 | Campos sin fuente contractual                                                        |
// |-----------------------------------|---------------------------------------|--------------------------------------------------------------------------------------|
// | getStockItems / getStockDetail    | consultarDisponibilidad               | productName, categoryName, brandName (Catálogo/Taxonomía); locationName (sin endpoint); stockVersion, updatedAt (no expuestos por la lectura) |
// | getThresholds                     | obtenerUmbralesInventario             | ninguno: mapeo total `umbralGlobal→globalThreshold`, `overrides→skuOverrides`        |
// | updateGlobalThreshold             | actualizarUmbralGlobal                | ninguno (respuesta `UmbralInventario`)                                               |
// | updateSkuThreshold                | establecerUmbralSku                   | ninguno (respuesta `UmbralInventario`)                                               |
// | getTransfers / receiveTransfer    | listarTrasladosInventario / registrarRecepcionTrasladoInventario | transferCode, productName, sourceLocationName, targetLocationName (sin campo); quantityPending (missing_quantity no equivale a pendiente); shippedAt (created_at no es shippedAt) |
// | getDashboardKpis                  | obtenerDashboardInventario            | blockedUnits (ausente); totalVendibleSkus (ambigüedad); los cuatro KPIs de traslados (fuera del dashboard) |
// | getDashboardAlerts                | (sin operación)                       | todo el modelo de alertas                                                            |
// | getLocationDistribution           | obtenerDashboardInventario.porUbicacion | blockedTotal y locationName                                                         |
// | getCategories / getBrands         | (Catálogo)                            | destino de la integración de filtros pendiente (paginación)                          |
// | getLocations                      | (sin operación)                       | todo el modelo de ubicaciones                                                        |
//
// Los métodos con mapeo total (umbrales) quedan pendientes solo por el cliente
// compartido y el cableado, no por mapeo.

export class ApiInventoryAdapter implements InventoryRepository {
  getStockItems(): Promise<StockItem[]> {
    return Promise.reject(
      this.blocked(
        "getStockItems",
        "productName/categoryName/brandName (Catálogo/Taxonomía), locationName (sin endpoint) y stockVersion/updatedAt no los devuelve consultarDisponibilidad",
      ),
    );
  }

  getStockDetail(): Promise<StockItem | null> {
    return Promise.reject(
      this.blocked(
        "getStockDetail",
        "mismos campos sin fuente que getStockItems (consultarDisponibilidad)",
      ),
    );
  }

  getThresholds(): Promise<ThresholdConfig> {
    return Promise.reject(this.pendingComposition("getThresholds", "obtenerUmbralesInventario"));
  }

  updateGlobalThreshold(): Promise<ThresholdConfig> {
    return Promise.reject(
      this.pendingComposition("updateGlobalThreshold", "actualizarUmbralGlobal"),
    );
  }

  updateSkuThreshold(): Promise<ThresholdConfig> {
    return Promise.reject(this.pendingComposition("updateSkuThreshold", "establecerUmbralSku"));
  }

  getTransfers(): Promise<TransferItem[]> {
    return Promise.reject(
      this.blocked(
        "getTransfers",
        "transferCode, productName y nombres de ubicación sin campo; quantityPending ambigua frente a missing_quantity; shippedAt no expuesto (solo created_at)",
      ),
    );
  }

  receiveTransfer(): Promise<TransferItem> {
    return Promise.reject(
      this.blocked(
        "receiveTransfer",
        "su request mapea, pero la respuesta devuelve TrasladoInventario con los mismos campos de presentación sin fuente que getTransfers",
      ),
    );
  }

  getDashboardKpis(): Promise<InventoryKpiSummary> {
    return Promise.reject(
      this.blocked(
        "getDashboardKpis",
        "blockedUnits ausente, totalVendibleSkus ambiguo y los cuatro KPIs de traslados quedan fuera de obtenerDashboardInventario",
      ),
    );
  }

  getDashboardAlerts(): Promise<InventoryAlert[]> {
    return Promise.reject(
      this.blocked("getDashboardAlerts", "no existe operación de alertas en el contrato de Inventario"),
    );
  }

  getLocationDistribution(): Promise<LocationDistribution[]> {
    return Promise.reject(
      this.blocked(
        "getLocationDistribution",
        "blockedTotal y locationName no están en obtenerDashboardInventario.porUbicacion",
      ),
    );
  }

  async getCategories(): Promise<InventoryCategoryOption[]> {
    return Promise.reject(
      this.blocked(
        "getCategories",
        "operación de Catálogo (no de Inventario); destino de la integración de filtros pendiente de definición (paginación)",
      ),
    );
  }

  async getBrands(): Promise<InventoryBrandOption[]> {
    return Promise.reject(
      this.blocked(
        "getBrands",
        "operación de Catálogo (no de Inventario); destino de la integración de filtros pendiente de definición (paginación)",
      ),
    );
  }

  async getLocations(): Promise<InventoryLocationOption[]> {
    return Promise.reject(
      this.blocked("getLocations", "sin endpoint HTTP publicado (fuente física inventory.locations)"),
    );
  }

  private blocked(operation: string, detail: string): Error {
    return new Error(
      `ApiInventoryAdapter.${operation} bloqueado: BLOCKED_CONTRACT — ${detail}.`,
    );
  }

  private pendingComposition(operation: string, operationId: string): Error {
    return new Error(
      `ApiInventoryAdapter.${operation} pendiente: mapeo disponible con ${operationId}, ` +
        "pero falta el cliente HTTP compartido y su cableado (BLOCKED_CONTRACT).",
    );
  }
}
