import { useCallback, useContext, useRef, useState } from "react";
import type { VariantMutationResult } from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { useCatalogServices } from "./useCatalogServices";
import { PromotionSessionContext } from "../../../app/config/PromotionSessionContext";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { clearCatalogStateIntent, hasCatalogStateIntent, isVariantStatus, nextCatalogStatus, readCatalogStateIntent, saveCatalogStateIntent, type CatalogStateAction, type CatalogStateIntent } from "../services/catalogStateIntent";

type SessionIdentity = { userId: string; sessionExpiresAt: number | null; sessionVersion: number; sessionRoles: readonly string[] };
function sameIdentity(a: SessionIdentity | null, b: SessionIdentity): boolean {
  return Boolean(a && a.userId === b.userId && a.sessionExpiresAt === b.sessionExpiresAt && a.sessionVersion === b.sessionVersion && JSON.stringify(a.sessionRoles) === JSON.stringify(b.sessionRoles));
}

export interface UseVariantStateMutationResult {
  loading: boolean;
  error: string | null;
  result: VariantMutationResult | null;
  activate: (productId: string, variantId: string, scenario?: string) => Promise<VariantMutationResult>;
  deactivate: (productId: string, variantId: string, scenario?: string) => Promise<VariantMutationResult>;
  reactivate: (productId: string, variantId: string, scenario?: string) => Promise<VariantMutationResult>;
  clearError: () => void;
  isUnknownError: boolean;
  reconcile: (productId: string, variantId: string, expected: "ACTIVA" | "INACTIVA") => Promise<VariantMutationResult | null>;
  isUnknown: (productId: string, variantId: string) => boolean;
}

export function useVariantStateMutation(): UseVariantStateMutationResult {
  const { catalog: catalogService } = useCatalogServices();
  const session = useContext(PromotionSessionContext);
  const mode = useContext(DataModeContext);
  const sessionBound = mode !== "mock";
  const identity = useCallback(() => {
    const view = session?.snapshot();
    const userId = view?.user?.id;
    return userId ? { userId, sessionExpiresAt: view.expiresAt, sessionVersion: session?.getSessionVersion() ?? 0, sessionRoles: [...(view.user?.roles ?? [])].sort() } : null;
  }, [session]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VariantMutationResult | null>(null);
  const [isUnknownError, setIsUnknownError] = useState(false);
  const inFlight = useRef(false);

  const clearError = useCallback(() => { setError(null); setIsUnknownError(false); }, []);
  const isUnknown = useCallback((productId: string, variantId: string) => {
    const owner = identity();
    return sessionBound && owner ? hasCatalogStateIntent("variant", productId, variantId) : false;
  }, [identity, sessionBound]);

  const execute = useCallback(async (productId: string, variantId: string, action: CatalogStateAction, scenario?: string): Promise<VariantMutationResult> => {
    const owner = identity();
    if (sessionBound && !owner) throw new CatalogError("session", "Se requiere una sesión administrativa vigente para cambiar el estado.");
    if (inFlight.current) throw new CatalogError("conflict", "La mutación ya está en curso.");
    const existing = sessionBound && hasCatalogStateIntent("variant", productId, variantId);
    if (existing) { setIsUnknownError(true); throw new CatalogError("write_unknown", "Existe una intención pendiente para esta variante; no se reenviará automáticamente."); }
    inFlight.current = true; setLoading(true); clearError();
    let intent: CatalogStateIntent | null = null;
    try {
      // Only the current authorized administrative read can establish the version/status precondition.
      const current = await catalogService.getVariantById(productId, variantId, scenario);
      if (sessionBound && (!owner || !sameIdentity(identity(), owner))) throw new CatalogError("session", "La sesión o sus permisos cambiaron durante la lectura; no se envió la mutación.");
      if (sessionBound && hasCatalogStateIntent("variant", productId, variantId)) throw new CatalogError("conflict", "Otra pestaña dejó una intención pendiente para esta variante; no se envió la mutación.");
      if (!current || current.productId !== productId || current.variantId !== variantId || !isVariantStatus(current.status)) throw new CatalogError("blocked_contract", "La lectura administrativa no confirma identidad y estado de la variante.");
      const allowed = action === "activate" ? current.status === "BORRADOR" : action === "reactivate" ? current.status === "INACTIVA" : current.status === "ACTIVA";
      if (!allowed) throw new CatalogError("conflict", "El estado administrativo actual no permite esta acción.");
      if (sessionBound) {
        if (!owner) throw new CatalogError("session", "Se requiere una sesión administrativa vigente para cambiar el estado.");
        intent = { schemaVersion: 2, entity: "variant", ...owner, productId, variantId, action, priorStatus: current.status, expectedStatus: nextCatalogStatus(action) === "ACTIVO" ? "ACTIVA" : "INACTIVA", priorVersion: current.catalogVersion, phase: "dispatching", updatedAt: Date.now() };
        if (!saveCatalogStateIntent(intent)) throw new CatalogError("write_unknown", "No se pudo preservar la intención en esta sesión; no se envió la mutación.");
        if (!sameIdentity(identity(), owner)) throw new CatalogError("session", "La sesión o sus permisos cambiaron antes del envío; no se envió la mutación.");
      }
      // OpenAPI 0.7.0-rc.2 publishes these variant state POSTs without a request body.
      const response = action === "activate" ? await catalogService.activateVariant(productId, variantId, scenario)
        : action === "deactivate" ? await catalogService.deactivateVariant(productId, variantId, scenario)
          : await catalogService.reactivateVariant(productId, variantId, scenario);
      if (sessionBound && (!owner || !sameIdentity(identity(), owner))) return response;
      if (intent) clearCatalogStateIntent(intent); setResult(response); return response;
    } catch (err) {
      if (intent) {
        if (err instanceof CatalogError && (err.kind === "write_unknown" || err.kind === "write_acknowledged")) {
          intent = { ...intent, phase: err.kind === "write_acknowledged" ? "acknowledged" : "uncertain", correlationId: err.details?.correlationId, operationId: err.details?.operationId, updatedAt: Date.now() };
          saveCatalogStateIntent(intent);
        } else clearCatalogStateIntent(intent);
      }
      if (!sessionBound || (owner && sameIdentity(identity(), owner))) {
        setError(err instanceof Error ? err.message : "Error inesperado al cambiar el estado de la variante.");
        setIsUnknownError(intent !== null && (intent.phase === "uncertain" || intent.phase === "acknowledged"));
      }
      throw err;
    } finally { inFlight.current = false; setLoading(false); }
  }, [catalogService, clearError, identity, sessionBound]);

  const reconcile = useCallback(async (productId: string, variantId: string, expected: "ACTIVA" | "INACTIVA"): Promise<VariantMutationResult | null> => {
    const owner = identity();
    if (!sessionBound || !owner) return null;
    const intent = readCatalogStateIntent(owner, "variant", productId, variantId);
    if (!intent || intent.expectedStatus !== expected) return null;
    try {
      const current = await catalogService.getVariantById(productId, variantId);
      if (!sameIdentity(identity(), owner)) return null;
      if (!current || current.productId !== productId || current.variantId !== variantId || current.status !== expected || intent.priorVersion === null || current.catalogVersion === null || current.catalogVersion <= intent.priorVersion) {
        setError("La lectura administrativa no confirma el estado y la versión esperados; la intención se conserva."); setIsUnknownError(true); return null;
      }
      if (intent.phase !== "acknowledged") {
        setError("El estado observado es compatible, pero no atribuye la operación pendiente. La intención se conserva y no se reenvía."); setIsUnknownError(true); return null;
      }
      clearCatalogStateIntent(intent); setError(null); setIsUnknownError(false);
      const reconciled = { variant: current };
      setResult(reconciled); return reconciled;
    } catch {
      setError("No se pudo completar la lectura administrativa autorizada; la intención se conserva."); setIsUnknownError(true); return null;
    }
  }, [catalogService, identity, sessionBound]);

  return {
    loading, error, result, clearError, isUnknownError, reconcile, isUnknown,
    activate: (productId, variantId, scenario) => execute(productId, variantId, "activate", scenario),
    deactivate: (productId, variantId, scenario) => execute(productId, variantId, "deactivate", scenario),
    reactivate: (productId, variantId, scenario) => execute(productId, variantId, "reactivate", scenario),
  };
}
