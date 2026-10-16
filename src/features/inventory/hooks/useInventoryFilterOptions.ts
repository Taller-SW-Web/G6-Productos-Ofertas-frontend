import { useEffect, useState } from "react";
import { getInventoryRepository } from "../services/inventoryProvider";
import type {
  InventoryBrandOption,
  InventoryCategoryOption,
  InventoryLocationOption,
} from "../services/inventoryCatalogRepository";
import {
  normalizeCategoryId,
  normalizeBrandId,
} from "../mappings/catalogMappings";

export function useInventoryFilterOptions() {
  const [categories, setCategories] = useState<InventoryCategoryOption[]>([]);
  const [brands, setBrands] = useState<InventoryBrandOption[]>([]);
  const [locations, setLocations] = useState<InventoryLocationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        // Usar el repositorio real para obtener catálogos, respetando VITE_DATA_MODE global
        const repo = getInventoryRepository();

        // Usar allSettled para aislar fallos: si ubicaciones está en BLOCKED_CONTRACT
        // no debe arrastrar ni bloquear la carga de categorías y marcas.
        const [catResult, brandResult, locResult] = await Promise.allSettled([
          repo.getCategories?.() ?? Promise.resolve([]),
          repo.getBrands?.() ?? Promise.resolve([]),
          repo.getLocations?.() ?? Promise.resolve([]),
        ]);

        if (cancelled) return;

        if (catResult.status === "fulfilled") {
          const normalizedCategories = catResult.value.map(
            (cat) => ({ ...cat, id: normalizeCategoryId(cat.id) }),
          );
          setCategories(normalizedCategories);
        }
        if (brandResult.status === "fulfilled") {
          const normalizedBrands = brandResult.value.map(
            (brand) => ({ ...brand, id: normalizeBrandId(brand.id) }),
          );
          setBrands(normalizedBrands);
        }
        if (locResult.status === "fulfilled") {
          setLocations(locResult.value);
        } else {
          // Registra como BLOCKED_CONTRACT informativo si falla
          // pero no aborta el render de la página ni de otros catálogos.
          console.warn(
            "[inventory] Catálogo de ubicaciones en BLOCKED_CONTRACT:",
            locResult.reason,
          );
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Error al cargar opciones de filtro de catálogo.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, brands, locations, loading, error };
}
