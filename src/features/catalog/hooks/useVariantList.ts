import { useCallback, useEffect, useState } from "react";
import type {
  ProductDetailView,
  VariantDetailView,
  VariantQuery,
} from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { catalogService } from "../services/catalogService";

export interface UseVariantListOptions {
  productId?: string;
  query?: VariantQuery;
  scenario?: string;
}

export interface UseVariantListResult {
  product: ProductDetailView | null;
  variants: VariantDetailView[];
  total: number;
  loading: boolean;
  error: string | null;
  isSimpleProduct: boolean;
  reload: () => void;
}

export function useVariantList({
  productId,
  query,
  scenario,
}: UseVariantListOptions = {}): UseVariantListResult {
  const targetProductId = productId || "PROD-OXF-001";
  const [revision, setRevision] = useState<number>(0);
  const queryStatus = query?.status;
  const queryPage = query?.page;
  const queryPageSize = query?.pageSize;

  const key = JSON.stringify([
    targetProductId,
    queryStatus,
    queryPage,
    queryPageSize,
    scenario,
    revision,
  ]);

  const [response, setResponse] = useState<{
    key: string;
    product: ProductDetailView | null;
    variants: VariantDetailView[];
    total: number;
    error: string | null;
    isSimpleProduct: boolean;
  }>();

  const reload = useCallback(() => {
    setRevision((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      catalogService.getById(targetProductId, scenario, controller.signal),
      catalogService.listVariants(
        targetProductId,
        { status: queryStatus, page: queryPage, pageSize: queryPageSize },
        scenario,
        controller.signal,
      ),
    ])
      .then(([p, pageResult]) => {
        if (!controller.signal.aborted) {
          if (!p) {
            setResponse({
              key,
              product: null,
              variants: [],
              total: 0,
              error: "El producto padre no fue encontrado.",
              isSimpleProduct: false,
            });
            return;
          }
          if (!p.hasVariants) {
            setResponse({
              key,
              product: p,
              variants: [],
              total: 0,
              error: null,
              isSimpleProduct: true,
            });
          } else {
            setResponse({
              key,
              product: p,
              variants: pageResult.items,
              total: pageResult.total,
              error: null,
              isSimpleProduct: false,
            });
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          if (err instanceof CatalogError && err.kind === "product_not_variants") {
            setResponse({
              key,
              product: null,
              variants: [],
              total: 0,
              error: null,
              isSimpleProduct: true,
            });
          } else {
            setResponse({
              key,
              product: null,
              variants: [],
              total: 0,
              error: err instanceof Error ? err.message : "Error al cargar variantes.",
              isSimpleProduct: false,
            });
          }
        }
      });

    return () => {
      controller.abort();
    };
  }, [key, targetProductId, queryStatus, queryPage, queryPageSize, scenario, revision]);

  const isCurrent = response?.key === key;

  return {
    product: isCurrent ? response.product : null,
    variants: isCurrent ? response.variants : [],
    total: isCurrent ? response.total : 0,
    loading: !isCurrent,
    error: isCurrent ? response.error : null,
    isSimpleProduct: isCurrent ? response.isSimpleProduct : false,
    reload,
  };
}
