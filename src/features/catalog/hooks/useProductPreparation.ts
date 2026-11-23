import { useEffect, useState, useCallback, useRef } from "react";
import type { ProductPreparationView } from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { useCatalogServices } from "./useCatalogServices";
import { useAuthSession } from "../../../app/config/useAuthSession";

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
  const { session, view: sessionView } = useAuthSession();
  const sessionKey = JSON.stringify([sessionView.user?.id ?? null, sessionView.expiresAt, session?.getSessionVersion() ?? 0, [...(sessionView.user?.roles ?? [])].sort()]);
  const [state, setState] = useState<ProductPreparationState>({
    productId,
    status: "loading",
    retrying: false,
  });
  const [refreshRevision, setRefreshRevision] = useState(0);
  const retryInFlight = useRef(false);
  const retryController = useRef<AbortController | null>(null);
  const activeProductId = useRef(productId);
  activeProductId.current = productId;
  const activeSessionKey = useRef(sessionKey);
  activeSessionKey.current = sessionKey;

  useEffect(() => {
    retryController.current?.abort();
    retryController.current = null;
    retryInFlight.current = false;
    return () => retryController.current?.abort();
  }, [productId, sessionKey]);

  const reload = useCallback(() => {
    setRefreshRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
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

    const current = () => !controller.signal.aborted && activeProductId.current === productId && activeSessionKey.current === sessionKey;
    const poll = async () => {
      try {
        const data = await catalogService.getPreparation(productId, scenario, controller.signal);
        if (!current()) return;
        setState((prev) => ({ ...prev, status: "success", data, error: undefined }));
        const pending = [data.pricing.status, data.inventario?.status, ...data.variantes.map(item => item.inventario.status)].some(status => status === "PENDING");
        if (!pending) return;
        const backoffMs = Math.min(30_000, 2_000 * 2 ** attempt++);
        const jittered = Math.round(backoffMs * (0.8 + Math.random() * 0.4));
        const delay = Math.max(data.retryAfterMs ?? 0, jittered);
        timer = setTimeout(() => { void poll(); }, delay);
      } catch (err) {
        if (!current()) return;
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : "Error al consultar la preparación del producto.",
        }));
      }
    };
    void poll();

    return () => { controller.abort(); if (timer !== undefined) clearTimeout(timer); };
  }, [productId, scenario, catalogService, revision, refreshRevision, sessionKey]);

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
    const controller = new AbortController();
    retryController.current = controller;
    const ownerSessionKey = sessionKey;
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
        controller.signal,
      );
      if (controller.signal.aborted || activeProductId.current !== productId || activeSessionKey.current !== ownerSessionKey) return;
      setState((prev) => ({
        ...prev,
        retrying: false,
        retrySuccess: res.message,
      }));
      // A 202 confirms admission only. Re-read Catalog's durable preparation state.
      setRefreshRevision((current) => current + 1);
    } catch (err) {
      if (controller.signal.aborted || activeProductId.current !== productId || activeSessionKey.current !== ownerSessionKey) return;
      setState((prev) => ({
        ...prev,
        retrying: false,
        retryError:
          err instanceof CatalogError
            ? err.message
            : "No se pudo reintentar la preparación.",
      }));
    } finally {
      if (retryController.current === controller) {
        retryController.current = null;
        retryInFlight.current = false;
      }
    }
  }, [catalogService, productId, scenario, sessionKey, state.data]);

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
