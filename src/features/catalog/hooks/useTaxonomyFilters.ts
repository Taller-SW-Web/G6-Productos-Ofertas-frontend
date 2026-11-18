import { useEffect, useState } from "react";
import { useCatalogServices } from "./useCatalogServices";
import type { TaxonomyBrand, TaxonomyCategory, TaxonomyProductType } from "../services/taxonomyRepository";

export function useTaxonomyFilters(revision: number, includeBrands = false) {
  const { taxonomy } = useCatalogServices();
  const [result, setResult] = useState<{ repository: typeof taxonomy; revision: number;
    categories: TaxonomyCategory[]; productTypes: TaxonomyProductType[]; brands: TaxonomyBrand[];
    error: string | null; typesUnavailable: boolean }>();
  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      taxonomy.getCategories(controller.signal),
      taxonomy.getProductTypes(controller.signal),
      includeBrands ? taxonomy.getBrands(controller.signal) : Promise.resolve([]),
    ])
      .then(([categories, productTypes, brands]) => {
        if (controller.signal.aborted) return;
        setResult({
          repository: taxonomy, revision,
          categories: categories.status === "fulfilled" ? categories.value : [],
          productTypes: productTypes.status === "fulfilled" ? productTypes.value : [],
          brands: brands.status === "fulfilled" ? brands.value : [],
          typesUnavailable: productTypes.status === "rejected",
          error: categories.status === "rejected"
            ? categories.reason instanceof Error ? categories.reason.message : "No se pudieron consultar las categorías."
            : null,
        });
      });
    return () => controller.abort();
  }, [taxonomy, revision, includeBrands]);
  const current = result?.repository === taxonomy && result?.revision === revision;
  return { categories: current ? result.categories : [], productTypes: current ? result.productTypes : [],
    brands: current ? result.brands : [], typesUnavailable: current && result.typesUnavailable,
    loading: !current, error: current ? result.error : null };
}
