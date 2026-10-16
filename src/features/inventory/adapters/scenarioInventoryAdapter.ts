import type { InventoryRepository } from "../services/inventoryRepository";
import type {
  DashboardFiltersQuery,
  InventoryAlert,
  InventoryBrandOption,
  InventoryCategoryOption,
  InventoryKpiSummary,
  InventoryLocationOption,
  LocationDistribution,
  ReceiveTransferPayload,
  StockFiltersQuery,
  StockItem,
  ThresholdConfig,
  TransferFiltersQuery,
  TransferItem,
} from "../services/inventoryTypes";
import { getInventoryScenario } from "../dev/inventoryScenario";

// Decorador de desarrollo/pruebas: permite simular estados (loading/empty/error)
// sin contaminar el contrato de negocio. Se compone SOLO en el punto único de
// selección y vive en el bundle de desarrollo; nunca en producción.

const EMPTY_KPIS: InventoryKpiSummary = {
  availableUnits: 0,
  blockedUnits: 0,
  totalPhysicalUnits: 0,
  totalVendibleSkus: 0,
  skusAvailable: 0,
  skusLowStock: 0,
  skusOutOfStock: 0,
  reservedUnits: 0,
  totalPendingTransfers: 0,
  transfersInTransit: 0,
  transfersPartiallyReceived: 0,
  transfersWithDiscrepancy: 0,
};

function pending<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

export class ScenarioInventoryAdapter implements InventoryRepository {
  constructor(private readonly delegate: InventoryRepository) {}

  async getStockItems(filters?: StockFiltersQuery): Promise<StockItem[]> {
    switch (getInventoryScenario()) {
      case "loading":
        return pending();
      case "error":
        return Promise.reject(
          new Error(
            "No se pudo conectar con el servicio de inventario (simulación de error).",
          ),
        );
      case "empty":
        return [];
      default:
        return this.delegate.getStockItems(filters);
    }
  }

  async getStockDetail(
    sku: string,
    locationId: string,
  ): Promise<StockItem | null> {
    switch (getInventoryScenario()) {
      case "loading":
        return pending();
      case "error":
        return Promise.reject(
          new Error("Error al obtener detalle de saldo (simulación de error)."),
        );
      case "empty":
        return null;
      default:
        return this.delegate.getStockDetail(sku, locationId);
    }
  }

  async getThresholds(): Promise<ThresholdConfig> {
    switch (getInventoryScenario()) {
      case "loading":
        return pending();
      case "error":
        return Promise.reject(
          new Error("Error al consultar umbrales (simulación de error)."),
        );
      default:
        return this.delegate.getThresholds();
    }
  }

  updateGlobalThreshold(threshold: number): Promise<ThresholdConfig> {
    return this.delegate.updateGlobalThreshold(threshold);
  }

  updateSkuThreshold(
    sku: string,
    threshold: number,
  ): Promise<ThresholdConfig> {
    return this.delegate.updateSkuThreshold(sku, threshold);
  }

  async getTransfers(filters?: TransferFiltersQuery): Promise<TransferItem[]> {
    switch (getInventoryScenario()) {
      case "loading":
        return pending();
      case "error":
        return Promise.reject(
          new Error("Error al recuperar los traslados (simulación de error)."),
        );
      case "empty":
        return [];
      default:
        return this.delegate.getTransfers(filters);
    }
  }

  receiveTransfer(payload: ReceiveTransferPayload): Promise<TransferItem> {
    return this.delegate.receiveTransfer(payload);
  }

  async getDashboardKpis(
    filters?: DashboardFiltersQuery,
  ): Promise<InventoryKpiSummary> {
    switch (getInventoryScenario()) {
      case "loading":
        return pending();
      case "error":
        return Promise.reject(
          new Error(
            "No se pudo cargar el resumen de métricas (simulación de error).",
          ),
        );
      case "empty":
        return { ...EMPTY_KPIS };
      default:
        return this.delegate.getDashboardKpis(filters);
    }
  }

  async getDashboardAlerts(
    filters?: DashboardFiltersQuery,
  ): Promise<InventoryAlert[]> {
    switch (getInventoryScenario()) {
      case "loading":
        return pending();
      case "error":
        return Promise.reject(
          new Error("Error al consultar las alertas (simulación de error)."),
        );
      case "empty":
        return [];
      default:
        return this.delegate.getDashboardAlerts(filters);
    }
  }

  async getLocationDistribution(
    filters?: DashboardFiltersQuery,
  ): Promise<LocationDistribution[]> {
    switch (getInventoryScenario()) {
      case "loading":
        return pending();
      case "error":
        return Promise.reject(
          new Error(
            "Error al obtener la distribución por ubicación (simulación de error).",
          ),
        );
      case "empty":
        return [];
      default:
        return this.delegate.getLocationDistribution(filters);
    }
  }

  async getCategories(): Promise<InventoryCategoryOption[]> {
    return this.delegate.getCategories();
  }

  async getBrands(): Promise<InventoryBrandOption[]> {
    return this.delegate.getBrands();
  }

  async getLocations(): Promise<InventoryLocationOption[]> {
    return this.delegate.getLocations();
  }
}