import { ScenarioInventoryAdapter } from "../adapters/scenarioInventoryAdapter";
import { MockInventoryAdapter } from "../adapters/mockInventoryAdapter";
import type { InventoryRepository } from "./inventoryRepository";

// Único punto de selección de fuente de datos del feature de inventario.
// Resolución de fuente (en orden):
//   1. VITE_DATA_MODE (global del proyecto) como única fuente de verdad.
//   2. "mock" en desarrollo / "error" en producción si no está configurada.
// En producción NO existe fallback silencioso al mock: si la API no está
// configurada se lanza un error explícitamente visible.
// En desarrollo/pruebas se compone con ScenarioInventoryAdapter para
// permitir simular estados (loading/empty/error) sin contaminar el contrato.

export type InventorySource = "mock" | "api";

function resolveSource(): InventorySource {
  const global_ = (
    import.meta.env.VITE_DATA_MODE as string | undefined
  )?.toLowerCase();
  if (global_ === "api") return "api";
  if (global_ === "mock") return "mock";

  // Sin configuración explícita: en development usamos mock con ScenarioInventoryAdapter
  // para simular estados sin alterar el contrato de negocio.
  // En producción NO hay fallback silencioso: lanzamos error si no hay configuración.
  if (import.meta.env.DEV) return "mock";

  throw new Error(
    "[inventory] VITE_DATA_MODE debe estar configurado en producción (mock|api). " +
      "No existe fallback silencioso al mock.",
  );
}

// Repositorio lazy que falla bajo demanda en modo API sin adapter implementado
class ApiPendingRepository implements InventoryRepository {
  private error: Error;

  constructor() {
    this.error = new Error(
      "[inventory] ApiInventoryAdapter no está implementado. " +
        "Configura VITE_DATA_MODE=mock hasta completar la integración HTTP.",
    );
  }

  private fail(): Promise<never> {
    return Promise.reject(this.error);
  }

  getStockItems(): Promise<never> { return this.fail(); }
  getStockDetail(): Promise<never> { return this.fail(); }
  getThresholds(): Promise<never> { return this.fail(); }
  updateGlobalThreshold(): Promise<never> { return this.fail(); }
  updateSkuThreshold(): Promise<never> { return this.fail(); }
  getTransfers(): Promise<never> { return this.fail(); }
  receiveTransfer(): Promise<never> { return this.fail(); }
  getDashboardKpis(): Promise<never> { return this.fail(); }
  getDashboardAlerts(): Promise<never> { return this.fail(); }
  getLocationDistribution(): Promise<never> { return this.fail(); }
  getCategories(): Promise<never> { return this.fail(); }
  getBrands(): Promise<never> { return this.fail(); }
  getLocations(): Promise<never> { return this.fail(); }
}

let repository: InventoryRepository | null = null;

export function getInventoryRepository(): InventoryRepository {
  if (!repository) {
    const source = resolveSource();

    let base: InventoryRepository;
    if (source === "api") {
      // ApiInventoryAdapter: BLOCKED_CONTRACT hasta integración formal.
      // Devolvemos un repo que falla BAJO DEMANDA (lazy) al invocar métodos,
      // no al instanciar. Esto permite que la app arranque y los hooks rendericen
      // el error controlado en modo API.
      base = new ApiPendingRepository();
    } else {
      base = new MockInventoryAdapter();
    }

    // En desarrollo/pruebas se decora con ScenarioInventoryAdapter para
    // permitir simular estados sin alterar el contrato de negocio.
    repository = import.meta.env.DEV
      ? new ScenarioInventoryAdapter(base)
      : base;
  }
  return repository;
}

// Resetea el singleton (útil en pruebas para inyectar repositorios alternativos).
export function resetInventoryRepository(instance?: InventoryRepository): void {
  repository = instance ?? null;
}
