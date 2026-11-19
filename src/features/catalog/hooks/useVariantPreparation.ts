import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  ProductDetailView,
  VariantDetailView,
  VariantPreparation,
} from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { useCatalogServices } from "./useCatalogServices";

export interface UseVariantPreparationResult {
  product: ProductDetailView | null;
  variant: VariantDetailView | null;
  preparation: VariantPreparation | null;
  loading: boolean;
  retrying: boolean;
  error: string | null;
  retryMessage: string | null;
  canRetry: boolean;
  reload: () => Promise<void>;
  retry: () => Promise<void>;
}

export function useVariantPreparation(
  productId: string | undefined,
  variantId: string | undefined,
  scenario?: string,
): UseVariantPreparationResult {
  const { catalog: catalogService } = useCatalogServices();
  const [revision, setRevision] = useState<number>(0);
  const key = JSON.stringify([productId, variantId, scenario, revision]);

  const [response, setResponse] = useState<{
    key: string;
    repository: typeof catalogService;
    product: ProductDetailView | null;
    variant: VariantDetailView | null;
    preparation: VariantPreparation | null;
    error: string | null;
  }>();

  const [retrying, setRetrying] = useState<boolean>(false);
  const retryInFlight = useRef(false);
  const activeSelection = useRef(JSON.stringify([productId, variantId, scenario]));
  const selectionKey = JSON.stringify([productId, variantId, scenario]);
  useLayoutEffect(() => {
    activeSelection.current = selectionKey;
  }, [selectionKey]);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRevision((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!productId || !variantId) return;

    const controller = new AbortController();

    Promise.all([
      catalogService.getById(productId, scenario, controller.signal),
      catalogService.getVariantById(productId, variantId, scenario, controller.signal),
      catalogService.getPreparation(productId, scenario, controller.signal),
    ])
      .then(([prod, v, authoritativePreparation]) => {
        if (!controller.signal.aborted) {
          if (!prod || !v) {
            setResponse({ repository: catalogService,
              key,
              product: null,
              variant: null,
              preparation: null,
              error: "Producto o variante no encontrados.",
            });
            return;
          }

          const foundPrep = authoritativePreparation.variantes.find(
            (item) => item.variantId === v.variantId && item.sku === v.sku,
          );
          if (
            prod.id !== productId ||
            v.productId !== productId ||
            v.variantId !== variantId ||
            authoritativePreparation.productId !== productId ||
            !authoritativePreparation.hasVariants ||
            !foundPrep
          ) {
            setResponse({
              repository: catalogService,
              key,
              product: null,
              variant: null,
              preparation: null,
              error:
                "Catálogo no devolvió una preparación consistente para la variante y su SKU.",
            });
            return;
          }

          setResponse({ repository: catalogService,
            key,
            product: prod,
            variant: v,
            preparation: foundPrep,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setResponse({ repository: catalogService,
            key,
            product: null,
            variant: null,
            preparation: null,
            error: err instanceof Error ? err.message : "Error al cargar preparación.",
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [productId, variantId, scenario, revision, key, catalogService]);

  const isCurrent = response?.key === key && response?.repository === catalogService;
  const preparation = isCurrent ? response.preparation : null;
  const canRetry = Boolean(
    preparation?.inventario?.manualRetryAllowed &&
      preparation.inventario.status !== "COMPLETED",
  );

  const retry = useCallback(async () => {
    if (!productId || !variantId || retryInFlight.current || !canRetry) return;
    const selection = selectionKey;
    retryInFlight.current = true;
    setRetrying(true);
    setRetryMessage(null);
    setRetryError(null);
    try {
      const result = await catalogService.retryVariantPreparation(
        productId,
        variantId,
        scenario,
      );
      if (activeSelection.current === selection) {
        setRetryMessage(result.message);
        setRevision((prev) => prev + 1);
      }
    } catch (err) {
      if (activeSelection.current === selection) {
        if (err instanceof CatalogError) {
          setRetryError(err.message);
        } else {
          setRetryError("Error al solicitar el reintento de preparación.");
        }
      }
    } finally {
      retryInFlight.current = false;
      if (activeSelection.current === selection) setRetrying(false);
    }
  }, [productId, variantId, scenario, canRetry, catalogService, selectionKey]);

  return {
    product: isCurrent ? response.product : null,
    variant: isCurrent ? response.variant : null,
    preparation,
    loading: !isCurrent,
    retrying,
    error: retryError || (isCurrent ? response.error : null),
    retryMessage,
    canRetry,
    reload,
    retry,
  };
}
