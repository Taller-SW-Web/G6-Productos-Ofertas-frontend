import { useState, useCallback } from "react";
import type { VariantMutationResult } from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { catalogService } from "../services/catalogService";

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
}

export function useVariantStateMutation(): UseVariantStateMutationResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VariantMutationResult | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const activate = useCallback(
    async (productId: string, variantId: string, scenario?: string) => {
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
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const deactivate = useCallback(
    async (productId: string, variantId: string, scenario?: string) => {
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
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const reactivate = useCallback(
    async (productId: string, variantId: string, scenario?: string) => {
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
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    loading,
    error,
    result,
    activate,
    deactivate,
    reactivate,
    clearError,
  };
}
