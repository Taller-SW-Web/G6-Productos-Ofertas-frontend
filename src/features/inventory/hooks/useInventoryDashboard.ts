import { useEffect, useState } from "react";
import { getInventoryRepository } from "../services/inventoryProvider";
import { useInventoryChangeSignal } from "./useInventoryChangeSignal";
import type {
  DashboardFiltersQuery,
  InventoryAlert,
  InventoryKpiSummary,
  LocationDistribution,
  StockItem,
} from "../services/inventoryTypes";

export function useInventoryDashboard(filters: DashboardFiltersQuery) {
  const revision = useInventoryChangeSignal();
  const { search, category, brand, locationId, status } = filters;
  const requestKey = JSON.stringify([
    search,
    category,
    brand,
    locationId,
    status,
    revision,
  ]);

  const [response, setResponse] = useState<{
    requestKey: string;
    kpis: InventoryKpiSummary | null;
    alerts: InventoryAlert[];
    distribution: LocationDistribution[];
    stockItems: StockItem[];
    error: string | null;
  }>();

  useEffect(() => {
    let cancelled = false;

    const repository = getInventoryRepository();
    Promise.all([
      repository.getDashboardKpis({
        search,
        category,
        brand,
        locationId,
        status,
      }),
      repository.getDashboardAlerts({
        search,
        category,
        brand,
        locationId,
        status,
      }),
      repository.getLocationDistribution({
        search,
        category,
        brand,
        locationId,
        status,
      }),
      repository.getStockItems({
        search,
        category,
        brand,
        locationId,
        status,
      }),
    ])
      .then(([kpiData, alertsData, distData, stockData]) => {
        if (!cancelled) {
          setResponse({
            requestKey,
            kpis: kpiData,
            alerts: alertsData,
            distribution: distData,
            stockItems: stockData,
            error: null,
          });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setResponse({
            requestKey,
            kpis: null,
            alerts: [],
            distribution: [],
            stockItems: [],
            error:
              err.message ||
              "Error al cargar los datos analíticos del dashboard.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [search, category, brand, locationId, status, requestKey]);

  const isCurrent = response?.requestKey === requestKey;
  const loading = !isCurrent;
  const kpis = isCurrent ? response.kpis : null;
  const alerts = isCurrent ? response.alerts : [];
  const distribution = isCurrent ? response.distribution : [];
  const stockItems = isCurrent ? response.stockItems : [];
  const error = isCurrent ? response.error : null;

  return {
    kpis,
    alerts,
    distribution,
    stockItems,
    loading,
    error,
  };
}