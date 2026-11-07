import { useState, useCallback } from "react";
import type { VariantMutationResult } from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { useCatalogServices } from "./useCatalogServices";
import { PromotionSessionContext } from "../../../app/config/PromotionSessionContext";
import { useContext } from "react";

const unknownKey = (user: string, productId: string, variantId: string) => `g6:catalog:uncertain:variant:${encodeURIComponent(user)}:${productId}:${variantId}`;
const unknownVariants = new Set<string>();
const intentKey = (productId: string, variantId: string) => `${productId}\u0000${variantId}`;
const hasUnknown = (user: string, productId: string, variantId: string) => unknownVariants.has(`${user}:${intentKey(productId, variantId)}`) || (() => {
  try { return typeof sessionStorage !== "undefined" && sessionStorage.getItem(unknownKey(user, productId, variantId)) === "1"; } catch { return false; }
})();

export interface UseVariantStateMutationResult {
  loading: boolean;
  error: string | null;
  result: VariantMutationResult | null;
  activate: (
    productId: string,
    variantId: string,
    scenario?: string,
  ) => Promise<VariantMutationResult>;
  deactivate: (
    productId: string,
    variantId: string,
    scenario?: string,
  ) => Promise<VariantMutationResult>;
  reactivate: (
    productId: string,
    variantId: string,
    scenario?: string,
  ) => Promise<VariantMutationResult>;
  clearError: () => void;
  isUnknownError: boolean;
  reconcile: (productId: string, variantId: string, expected: "ACTIVA" | "INACTIVA") => Promise<boolean>;
  isUnknown: (productId: string, variantId: string) => boolean;
}

export function useVariantStateMutation(): UseVariantStateMutationResult {
  const { catalog: catalogService } = useCatalogServices();
  const session = useContext(PromotionSessionContext);
  const userId = useCallback(() => session?.snapshot().user?.id ?? "session-unavailable", [session]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VariantMutationResult | null>(null);
  const [isUnknownError, setIsUnknownError] = useState(false);

  const clearError = useCallback(() => {
    setError(null);
  }, []);
  const reconcile = useCallback(async (productId: string, variantId: string, expected: "ACTIVA" | "INACTIVA") => {
    try {
      const current = await catalogService.getVariantById(productId, variantId);
      if (current?.status === expected) {
        try { sessionStorage.removeItem(unknownKey(userId(), productId, variantId)); } catch { /* current session state is authoritative */ }
        unknownVariants.delete(`${userId()}:${intentKey(productId, variantId)}`);
        setIsUnknownError(false); setError(null); return true;
      }
      setError(`La consulta no confirmó el estado ${expected}; no se reenviará la mutación.`); return false;
    } catch { setError("No se pudo consultar el estado de la variante; no se reenviará la mutación."); return false; }
  }, [catalogService, userId]);
  const isUnknown = useCallback((productId: string, variantId: string) => hasUnknown(userId(), productId, variantId), [userId]);

  const activate = useCallback(
    async (productId: string, variantId: string, scenario?: string) => {
      if (isUnknownError || hasUnknown(userId(), productId, variantId)) throw new Error("Resultado de escritura incierto; consulta el estado antes de volver a operar.");
      setLoading(true);
      setError(null);
      try {
        const res = await catalogService.activateVariant(productId, variantId, scenario);
        setResult(res);
        return res;
      } catch (err) {
        const msg =
          err instanceof CatalogError
            ? err.message
            : "Error inesperado al activar la variante.";
        setError(msg);
        if (err instanceof CatalogError && err.kind === "write_unknown") { unknownVariants.add(`${userId()}:${intentKey(productId, variantId)}`); setIsUnknownError(true); try { sessionStorage.setItem(unknownKey(userId(), productId, variantId), "1"); } catch { /* module latch */ } }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [catalogService, isUnknownError, userId],
  );

  const deactivate = useCallback(
    async (productId: string, variantId: string, scenario?: string) => {
      if (isUnknownError || hasUnknown(userId(), productId, variantId)) throw new Error("Resultado de escritura incierto; consulta el estado antes de volver a operar.");
      setLoading(true);
      setError(null);
      try {
        const res = await catalogService.deactivateVariant(productId, variantId, scenario);
        setResult(res);
        return res;
      } catch (err) {
        const msg =
          err instanceof CatalogError
            ? err.message
            : "Error inesperado al desactivar la variante.";
        setError(msg);
        if (err instanceof CatalogError && err.kind === "write_unknown") { unknownVariants.add(`${userId()}:${intentKey(productId, variantId)}`); setIsUnknownError(true); try { sessionStorage.setItem(unknownKey(userId(), productId, variantId), "1"); } catch { /* module latch */ } }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [catalogService, isUnknownError, userId],
  );

  const reactivate = useCallback(
    async (productId: string, variantId: string, scenario?: string) => {
      if (isUnknownError || hasUnknown(userId(), productId, variantId)) throw new Error("Resultado de escritura incierto; consulta el estado antes de volver a operar.");
      setLoading(true);
      setError(null);
      try {
        const res = await catalogService.reactivateVariant(productId, variantId, scenario);
        setResult(res);
        return res;
      } catch (err) {
        const msg =
          err instanceof CatalogError
            ? err.message
            : "Error inesperado al reactivar la variante.";
        setError(msg);
        if (err instanceof CatalogError && err.kind === "write_unknown") { unknownVariants.add(`${userId()}:${intentKey(productId, variantId)}`); setIsUnknownError(true); try { sessionStorage.setItem(unknownKey(userId(), productId, variantId), "1"); } catch { /* module latch */ } }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [catalogService, isUnknownError, userId],
  );

  return {
    loading,
    error,
    result,
    activate,
    deactivate,
    reactivate,
    clearError,
    isUnknownError,
    reconcile,
    isUnknown,
  };
}
