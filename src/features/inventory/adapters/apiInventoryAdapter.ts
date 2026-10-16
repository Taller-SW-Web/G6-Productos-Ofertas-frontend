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

// Esqueleto del adaptador HTTP.
//
// BLOCKED_CONTRACT: la integración HTTP del módulo de inventario no está
// declarada en este entregable. Los endpoints existen en el OpenAPI del
// provider (p. ej. POST /inventario/traslados/{trasladoId}/recepciones,
// GET /inventario/dashboard), pero su consumo real queda pendiente de la
// integración formal. Este adaptador NO debe activarse en producción hasta
// que dicha integración se declare y valide.

export class ApiInventoryAdapter implements InventoryRepository {
  getStockItems(): Promise<StockItem[]> {
    return Promise.reject(this.unimplemented("getStockItems"));
  }

  getStockDetail(): Promise<StockItem | null> {
    return Promise.reject(this.unimplemented("getStockDetail"));
  }

  getThresholds(): Promise<ThresholdConfig> {
    return Promise.reject(this.unimplemented("getThresholds"));
  }

  updateGlobalThreshold(): Promise<ThresholdConfig> {
    return Promise.reject(this.unimplemented("updateGlobalThreshold"));
  }

  updateSkuThreshold(): Promise<ThresholdConfig> {
    return Promise.reject(this.unimplemented("updateSkuThreshold"));
  }

  getTransfers(): Promise<TransferItem[]> {
    return Promise.reject(this.unimplemented("getTransfers"));
  }

  receiveTransfer(): Promise<TransferItem> {
    return Promise.reject(this.unimplemented("receiveTransfer"));
  }

  getDashboardKpis(): Promise<InventoryKpiSummary> {
    return Promise.reject(this.unimplemented("getDashboardKpis"));
  }

  getDashboardAlerts(): Promise<InventoryAlert[]> {
    return Promise.reject(this.unimplemented("getDashboardAlerts"));
  }

  getLocationDistribution(): Promise<LocationDistribution[]> {
    return Promise.reject(this.unimplemented("getLocationDistribution"));
  }

  async getCategories(): Promise<InventoryCategoryOption[]> {
    return Promise.reject(this.unimplemented("getCategories"));
  }

  async getBrands(): Promise<InventoryBrandOption[]> {
    return Promise.reject(this.unimplemented("getBrands"));
  }

  async getLocations(): Promise<InventoryLocationOption[]> {
    return Promise.reject(this.blocked("getLocations", "Ubicaciones: sin endpoint HTTP publicado"));
  }

  private unimplemented(operation: string): Error {
    return new Error(
      `ApiInventoryAdapter.${operation} no implementado: BLOCKED_CONTRACT (contrato HTTP de inventario pendiente de integración).`,
    );
  }

  private blocked(operation: string, detail: string): Error {
    return new Error(
      `ApiInventoryAdapter.${operation} bloqueado: BLOCKED_CONTRACT — ${detail}.`,
    );
  }
}