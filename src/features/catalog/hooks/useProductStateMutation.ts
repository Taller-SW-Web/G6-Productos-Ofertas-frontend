import { useCallback, useContext, useRef, useState } from "react";
import type { ProductDetailView, ProductStatus, StateMutationPayload } from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { useCatalogServices } from "./useCatalogServices";
import { PromotionSessionContext } from "../../../app/config/PromotionSessionContext";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { clearCatalogStateIntent, hasCatalogStateIntent, isProductStatus, nextCatalogStatus, readCatalogStateIntent, saveCatalogStateIntent, type CatalogStateAction, type CatalogStateIntent } from "../services/catalogStateIntent";

type SessionIdentity = { userId: string; sessionExpiresAt: number | null; sessionVersion: number; sessionRoles: readonly string[] };
function sameIdentity(a: SessionIdentity | null, b: SessionIdentity): boolean {
  return Boolean(a && a.userId === b.userId && a.sessionExpiresAt === b.sessionExpiresAt && a.sessionVersion === b.sessionVersion && JSON.stringify(a.sessionRoles) === JSON.stringify(b.sessionRoles));
}

export interface UseProductStateMutationResult {
  submitting: boolean;
  reconciling: boolean;
  error?: string;
  isUnknownError: boolean;
  activate: (id: string, scenario?: string) => Promise<ProductDetailView | null>;
  deactivate: (id: string, scenario?: string) => Promise<ProductDetailView | null>;
  reactivate: (id: string, scenario?: string) => Promise<ProductDetailView | null>;
  reconcile: (id: string, expectedStatus: ProductStatus) => Promise<ProductDetailView | null>;
  clearError: () => void;
  isUnknown: (id: string) => boolean;
}

export function useProductStateMutation(): UseProductStateMutationResult {
  const { catalog: catalogService } = useCatalogServices();
  const session = useContext(PromotionSessionContext);
  const mode = useContext(DataModeContext);
  const sessionBound = mode !== "mock";
  const identity = useCallback(() => {
    const view = session?.snapshot();
    const userId = view?.user?.id;
    return userId ? { userId, sessionExpiresAt: view.expiresAt, sessionVersion: session?.getSessionVersion() ?? 0, sessionRoles: [...(view.user?.roles ?? [])].sort() } : null;
  }, [session]);
  const [submitting, setSubmitting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string>();
  const [isUnknownError, setIsUnknownError] = useState(false);

  const clearError = useCallback(() => { setError(undefined); setIsUnknownError(false); }, []);
  const isUnknown = useCallback((id: string) => {
    const owner = identity();
    return sessionBound && owner ? hasCatalogStateIntent("product", id) : false;
  }, [identity, sessionBound]);

  const execute = useCallback(async (id: string, action: CatalogStateAction, scenario?: string): Promise<ProductDetailView | null> => {
    const owner = identity();
    if (sessionBound && !owner) { setError("Se requiere una sesión administrativa vigente para cambiar el estado."); return null; }
    if (inFlight.current) return null;
    const existing = sessionBound && hasCatalogStateIntent("product", id);
    if (existing) { setIsUnknownError(true); setError("Hay una intención anterior pendiente. Consulte la lectura administrativa antes de volver a operar."); return null; }
    inFlight.current = true;
    setSubmitting(true); clearError();
    let intent: CatalogStateIntent | null = null;
    try {
      // A fresh authorized administrative GET is the only authority for the write precondition.
      const current = await catalogService.getById(id, scenario);
      if (sessionBound && (!owner || !sameIdentity(identity(), owner))) throw new CatalogError("session", "La sesión o sus permisos cambiaron durante la lectura; no se envió la mutación.");
      if (sessionBound && hasCatalogStateIntent("product", id)) throw new CatalogError("conflict", "Otra pestaña dejó una intención pendiente para este producto; no se envió la mutación.");
      if (!current || current.id !== id || !isProductStatus(current.status) || current.catalogVersion === null) throw new CatalogError("blocked_contract", "La lectura administrativa vigente no confirma identidad, estado y versión del producto.");
      const allowed = action === "activate" ? current.status === "BORRADOR" : action === "reactivate" ? current.status === "INACTIVO" : current.status === "ACTIVO";
      if (!allowed) throw new CatalogError("conflict", "El estado administrativo actual no permite esta acción.");
      const target = nextCatalogStatus(action);
      if (sessionBound) {
        if (!owner) throw new CatalogError("session", "Se requiere una sesión administrativa vigente para cambiar el estado.");
        intent = { schemaVersion: 2, entity: "product", ...owner, productId: id, action, priorStatus: current.status, expectedStatus: target, priorVersion: current.catalogVersion, phase: "dispatching", updatedAt: Date.now() };
        if (!saveCatalogStateIntent(intent)) throw new CatalogError("write_unknown", "No se pudo conservar la intención en esta sesión; no se envió la mutación.");
        if (!sameIdentity(identity(), owner)) throw new CatalogError("session", "La sesión o sus permisos cambiaron antes del envío; no se envió la mutación.");
      }
      const payload: StateMutationPayload = { catalogVersion: current.catalogVersion };
      const result = action === "activate" ? await catalogService.activate(id, payload, scenario)
        : action === "deactivate" ? await catalogService.deactivate(id, payload, scenario)
          : await catalogService.reactivate(id, payload, scenario);
      if (sessionBound && (!owner || !sameIdentity(identity(), owner))) return null;
      if (intent) clearCatalogStateIntent(intent);
      return result;
    } catch (err) {
      if (intent) {
        if (err instanceof CatalogError && (err.kind === "write_unknown" || err.kind === "write_acknowledged")) {
          intent = { ...intent, phase: err.kind === "write_acknowledged" ? "acknowledged" : "uncertain", correlationId: err.details?.correlationId, operationId: err.details?.operationId, updatedAt: Date.now() };
          saveCatalogStateIntent(intent);
        } else clearCatalogStateIntent(intent);
      }
      if (!sessionBound || (owner && sameIdentity(identity(), owner))) {
        setError(err instanceof Error ? err.message : "Error inesperado al cambiar el estado.");
        setIsUnknownError(intent !== null && (intent.phase === "uncertain" || intent.phase === "acknowledged"));
      }
      return null;
    } finally { inFlight.current = false; setSubmitting(false); }
  }, [catalogService, clearError, identity, sessionBound]);

  const reconcile = useCallback(async (id: string, expectedStatus: ProductStatus): Promise<ProductDetailView | null> => {
    const owner = identity();
    if (!sessionBound || !owner || reconciling) return null;
    const intent = readCatalogStateIntent(owner, "product", id);
    if (!intent || intent.expectedStatus !== expectedStatus) return null;
    setReconciling(true);
    try {
      const current = await catalogService.getById(id);
      if (!sameIdentity(identity(), owner)) return null;
      if (!current || current.id !== intent.productId || current.status !== expectedStatus || current.catalogVersion === null || intent.priorVersion === null || current.catalogVersion <= intent.priorVersion) {
        setError(intent.phase === "acknowledged" ? "El servidor reconoció la escritura, pero la lectura administrativa vigente todavía no confirma el estado esperado." : "El estado observado es compatible o no concluyente y no atribuye la operación. La intención incierta se conserva; no se reenviará.");
        setIsUnknownError(true);
        return null;
      }
      if (intent.phase !== "acknowledged") {
        setError("El estado coincide, pero no existe evidencia que atribuya este cambio a la operación pendiente. La intención se conserva.");
        setIsUnknownError(true);
        return null;
      }
      clearCatalogStateIntent(intent);
      setError(undefined); setIsUnknownError(false);
      return current;
    } catch {
      setError("No se pudo completar la lectura administrativa autorizada; la intención se conserva.");
      setIsUnknownError(true);
      return null;
    } finally { setReconciling(false); }
  }, [catalogService, identity, reconciling, sessionBound]);

  return {
    submitting, reconciling, error, isUnknownError,
    activate: (id, scenario) => execute(id, "activate", scenario),
    deactivate: (id, scenario) => execute(id, "deactivate", scenario),
    reactivate: (id, scenario) => execute(id, "reactivate", scenario),
    reconcile, clearError, isUnknown,
  };
}
