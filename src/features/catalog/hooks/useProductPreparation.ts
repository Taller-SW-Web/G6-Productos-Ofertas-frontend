import { useEffect, useState, useCallback, useRef } from "react";
import type { ProductPreparationView } from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { useCatalogServices } from "./useCatalogServices";

export interface ProductPreparationState {
  productId: string;
  status: "loading" | "success" | "error";
  data?: ProductPreparationView;
  error?: string;
  retrying: boolean;
  retryError?: string;
  retrySuccess?: string;
}

export function useProductPreparation(
  productId: string,
  scenario?: string,
  revision = 0,
) {
  const { catalog: catalogService } = useCatalogServices();
  const [state, setState] = useState<ProductPreparationState>({
    productId,
    status: "loading",
    retrying: false,
  });
  const [refreshRevision, setRefreshRevision] = useState(0);
  const retryInFlight = useRef(false);
  const activeProductId = useRef(productId);
  activeProductId.current = productId;

  const reload = useCallback(() => {
    setRefreshRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => {
      const changingProduct = prev.productId !== productId;
      return {
        ...prev,
        productId,
        status: "loading",
        retrying: false,
        data: undefined,
        error: undefined,
        retryError: changingProduct ? undefined : prev.retryError,
        retrySuccess: changingProduct ? undefined : prev.retrySuccess,
      };
    });

    catalogService
      .getPreparation(productId, scenario, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && activeProductId.current === productId) {
          setState((prev) => ({ ...prev, status: "success", data }));
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || activeProductId.current !== productId)
          return;
        setState((prev) => ({
          ...prev,
          status: "error",
          error:
            err instanceof Error
              ? err.message
              : "Error al consultar la preparación del producto.",
        }));
      });

    return () => controller.abort();
  }, [productId, scenario, catalogService, revision, refreshRevision]);

  const retry = useCallback(async (dependencia: "PRICING" | "INVENTARIO") => {
    if (retryInFlight.current) return;
    const dependency =
      dependencia === "PRICING"
        ? state.data?.pricing
        : state.data?.inventario;
    if (!dependency?.manualRetryAllowed || dependency.status === "COMPLETED") {
      setState((prev) => ({
        ...prev,
        retryError: "Catálogo no autorizó el reintento de esta preparación.",
        retrySuccess: undefined,
      }));
      return;
    }
    retryInFlight.current = true;
    setState((prev) => ({
      ...prev,
      retrying: true,
      retryError: undefined,
      retrySuccess: undefined,
    }));
    try {
      const res = await catalogService.retryPreparation(
        productId,
        { dependencia },
        scenario,
      );
      if (activeProductId.current !== productId) return;
      setState((prev) => ({
        ...prev,
        retrying: false,
        retrySuccess: res.message,
      }));
      // A 202 confirms admission only. Re-read Catalog's durable preparation state.
      setRefreshRevision((current) => current + 1);
    } catch (err) {
      if (activeProductId.current !== productId) return;
      setState((prev) => ({
        ...prev,
        retrying: false,
        retryError:
          err instanceof CatalogError
            ? err.message
            : "No se pudo reintentar la preparación.",
      }));
    } finally {
      retryInFlight.current = false;
    }
  }, [catalogService, productId, scenario, state.data]);

  const currentState =
    state.productId === productId
      ? state
      : { productId, status: "loading" as const, retrying: false };
  return {
    ...currentState,
    retry,
    reload,
  };
}
