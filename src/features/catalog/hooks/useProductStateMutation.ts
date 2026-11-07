import { useState } from "react";
import type { ProductDetailView } from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { useCatalogServices } from "./useCatalogServices";
import { useContext } from "react";
import { PromotionSessionContext } from "../../../app/config/PromotionSessionContext";

const unknownKey = (user: string, id: string) => `g6:catalog:uncertain:product:${encodeURIComponent(user)}:${id}`;
const unknownProducts = new Set<string>();
const hasUnknown = (user: string, id: string) => unknownProducts.has(`${user}:${id}`) || (() => { try { return typeof sessionStorage !== "undefined" && sessionStorage.getItem(unknownKey(user, id)) === "1"; } catch { return false; } })();

export interface UseProductStateMutationResult {
  submitting: boolean;
  reconciling: boolean;
  error?: string;
  isUnknownError: boolean;
  activate: (id: string, scenario?: string) => Promise<ProductDetailView | null>;
  deactivate: (id: string, scenario?: string) => Promise<ProductDetailView | null>;
  reactivate: (id: string, scenario?: string) => Promise<ProductDetailView | null>;
  reconcile: (id: string, expectedStatus: string) => Promise<boolean>;
  clearError: () => void;
  isUnknown: (id: string) => boolean;
}

export function useProductStateMutation(): UseProductStateMutationResult {
  const { catalog: catalogService } = useCatalogServices();
  const session = useContext(PromotionSessionContext);
  const userId = () => session?.snapshot().user?.id ?? "session-unavailable";
  const [submitting, setSubmitting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string>();
  const [isUnknownError, setIsUnknownError] = useState(false);

  const clearError = () => {
    setError(undefined);
    setIsUnknownError(false);
  };

  const execute = async (
    id: string,
    fn: () => Promise<ProductDetailView>,
  ): Promise<ProductDetailView | null> => {
    if (submitting || reconciling) return null;
    if (hasUnknown(userId(), id)) { setIsUnknownError(true); setError("La escritura anterior tiene resultado incierto. Consulta el estado antes de cualquier reenvío."); return null; }
    setSubmitting(true);
    clearError();

    try {
      const res = await fn();
      return res;
    } catch (err) {
      if (err instanceof CatalogError) {
        setError(err.message);
        if (err.kind === "unknown" || err.kind === "write_unknown") {
          setIsUnknownError(true);
          if (err.kind === "write_unknown") { unknownProducts.add(`${userId()}:${id}`); try { sessionStorage.setItem(unknownKey(userId(), id), "1"); } catch { /* module latch remains */ } }
        }
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Error inesperado al cambiar de estado.",
        );
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const activate = (id: string, scenario?: string) =>
    execute(id, () => catalogService.activate(id, undefined, scenario));

  const deactivate = (id: string, scenario?: string) =>
    execute(id, () => catalogService.deactivate(id, undefined, scenario));

  const reactivate = (id: string, scenario?: string) =>
    execute(id, () => catalogService.reactivate(id, undefined, scenario));

  const reconcile = async (id: string, expectedStatus: string): Promise<boolean> => {
    if (reconciling) return false;
    setReconciling(true);
    try {
      // The published GET is commercial and has no administrative status.
      // Do not treat it as evidence or issue a futile reconciliation read.
      void id; void expectedStatus;
      setError("GET /productos/{productoId} devuelve un DTO comercial sin estado administrativo; la intención incierta no puede reconciliarse ni liberarse.");
      return false;
    } finally {
      setReconciling(false);
    }
  };

  return {
    submitting,
    reconciling,
    error,
    isUnknownError,
    activate,
    deactivate,
    reactivate,
    reconcile,
    clearError,
    isUnknown: (id: string) => hasUnknown(userId(), id),
  };
}
