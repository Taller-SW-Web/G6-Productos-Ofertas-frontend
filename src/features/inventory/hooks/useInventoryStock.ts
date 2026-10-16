import { useEffect, useState } from "react";
import { getInventoryRepository } from "../services/inventoryProvider";
import { useInventoryChangeSignal } from "./useInventoryChangeSignal";
import type {
  StockFiltersQuery,
  StockItem,
} from "../services/inventoryTypes";

export function useInventoryStock(filters: StockFiltersQuery) {
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
    items: StockItem[];
    error: string | null;
  }>();

  useEffect(() => {
    let cancelled = false;

    getInventoryRepository()
      .getStockItems({ search, category, brand, locationId, status })
      .then((data) => {
        if (!cancelled) {
          setResponse({ requestKey, items: data, error: null });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setResponse({
            requestKey,
            items: [],
            error: err.message || "Error al cargar el inventario.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [search, category, brand, locationId, status, requestKey]);

  const isCurrent = response?.requestKey === requestKey;
  const loading = !isCurrent;
  const items = isCurrent ? response.items : [];
  const error = isCurrent ? response.error : null;

  return { items, loading, error };
}