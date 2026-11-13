import { useEffect, useState } from "react";
import { getInventoryRepository } from "../services/inventoryProvider";
import { useInventoryChangeSignal } from "./useInventoryChangeSignal";
import type {
  StockFiltersQuery,
  StockPage,
} from "../services/inventoryTypes";

export function useInventoryStock(filters: StockFiltersQuery, page?: number) {
  const revision = useInventoryChangeSignal();
  const { search, category, brand, locationId, status } = filters;
  // Token de recarga explícito: permite reintentar una consulta fallida sin
  // depender de que cambien los filtros (si ya estaban vacíos, no habría refetch).
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = JSON.stringify([
    search,
    category,
    brand,
    locationId,
    status,
    page,
    revision,
    reloadToken,
  ]);

  const [response, setResponse] = useState<{
    requestKey: string;
    result: StockPage;
    error: string | null;
  }>();

  useEffect(() => {
    const controller = new AbortController();

    const repository = getInventoryRepository();
    const query = { search, category, brand, locationId, status };
    const load = page !== undefined && repository.getStockPage
      ? repository.getStockPage(query, page, 20, controller.signal)
      : repository.getStockItems(query, controller.signal).then(items => ({ items, total: items.length, pages: items.length ? 1 : 0 }));
    load
      .then((data) => {
        if (!controller.signal.aborted) {
          setResponse({ requestKey, result: data, error: null });
        }
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted) {
          setResponse({
            requestKey,
            result: { items: [], total: 0, pages: 0 },
            error: err.message || "Error al cargar el inventario.",
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [search, category, brand, locationId, status, page, requestKey]);

  const isCurrent = response?.requestKey === requestKey;
  const loading = !isCurrent;
  const result = isCurrent ? response.result : { items: [], total: 0, pages: 0 };
  const error = isCurrent ? response.error : null;

  return {
    ...result,
    loading,
    error,
    refetch: () => setReloadToken((token) => token + 1),
  };
}
