import { useEffect, useState } from "react";
import { useCatalogServices } from "./useCatalogServices";
import type { TaxonomyCategory, TaxonomyProductType } from "../services/taxonomyRepository";

export function useTaxonomyFilters(revision: number, includeProductTypes: boolean) {
  const { taxonomy } = useCatalogServices();
  const [result, setResult] = useState<{ repository: typeof taxonomy; revision: number;
    categories: TaxonomyCategory[]; productTypes: TaxonomyProductType[]; error: string | null }>();
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      taxonomy.getCategories(controller.signal),
      includeProductTypes ? taxonomy.getProductTypes(controller.signal) : Promise.resolve([]),
    ])
      .then(([categories, productTypes]) => {
        if (!controller.signal.aborted) setResult({ repository: taxonomy, revision, categories, productTypes, error: null });
      }).catch(error => {
        if (!controller.signal.aborted) setResult({ repository: taxonomy, revision, categories: [], productTypes: [],
          error: error instanceof Error ? error.message : "No se pudo consultar Taxonomía." });
      });
    return () => controller.abort();
  }, [taxonomy, revision, includeProductTypes]);
  const current = result?.repository === taxonomy && result?.revision === revision;
  return { categories: current ? result.categories : [], productTypes: current ? result.productTypes : [],
    loading: !current, error: current ? result.error : null };
}
