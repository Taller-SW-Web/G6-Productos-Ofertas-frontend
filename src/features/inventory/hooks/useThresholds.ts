import { useEffect, useRef, useState } from "react";
import { InventoryError } from "../services/inventoryErrors";
import { notifyInventoryChanged } from "../services/inventoryEvents";
import { getInventoryRepository } from "../services/inventoryProvider";
import { useInventoryChangeSignal } from "./useInventoryChangeSignal";
import type { InventoryRepository } from "../services/inventoryRepository";
import type { ThresholdConfig } from "../services/inventoryTypes";

// Resultado acreditado de una mutación de umbrales.
//   - CONFIRMED: el PUT devolvió 200 y su DTO coincide exactamente con el valor
//     solicitado; la escritura queda atribuida a esta operación.
//   - VERIFIED: la escritura no pudo acreditarse por su propia respuesta, pero
//     una lectura autoritativa posterior confirmó el valor deseado. NO se
//     atribuye el cambio al PUT ni se implica que ya estuviera antes.
export interface ThresholdMutationSuccess {
  status: "CONFIRMED" | "VERIFIED";
  config: ThresholdConfig;
  message: string;
}

// Feedback listo para presentación. Se calcula desde el resultado real de la
// mutación para que el mensaje nunca afirme más de lo que se acreditó.
export interface ThresholdFeedback {
  semantic: "success" | "warning" | "error";
  title: string;
  message: string;
}

const VERIFIED_MESSAGE = "El valor deseado fue verificado en el servidor.";

export function describeThresholdMutationSuccess(
  result: ThresholdMutationSuccess,
): ThresholdFeedback {
  if (result.status === "VERIFIED") {
    return {
      semantic: "warning",
      title: "Valor verificado, escritura no atribuida",
      message: result.message,
    };
  }
  return {
    semantic: "success",
    title: "Escritura confirmada",
    message: result.message,
  };
}

export function describeThresholdMutationError(
  error: unknown,
  fallback: string,
): ThresholdFeedback {
  if (error instanceof InventoryError && error.code === "RESULTADO_INCIERTO") {
    return {
      semantic: "warning",
      title: "Resultado no confirmado",
      message: error.message,
    };
  }
  return {
    semantic: "error",
    title: "Error al actualizar umbral",
    message:
      error instanceof Error && error.message ? error.message : fallback,
  };
}

function unaccreditedWriteError(): InventoryError {
  return new InventoryError(
    "RESULTADO_INCIERTO",
    "El servidor respondió con un valor distinto al solicitado. No se acredita la escritura; consulta el valor actual antes de reintentar.",
  );
}

// Conciliación conservadora: una sola lectura autoritativa y CERO reintentos de
// escritura. Si el GET confirma el valor deseado se acredita como VERIFIED; en
// cualquier otro caso se propaga el error original (resultado no acreditado).
async function reconcileThresholdWrite(
  repository: InventoryRepository,
  matchesDesiredValue: (config: ThresholdConfig) => boolean,
  fallbackError: unknown,
): Promise<ThresholdMutationSuccess> {
  try {
    const authoritative = await repository.getThresholds();
    if (matchesDesiredValue(authoritative)) {
      return {
        status: "VERIFIED",
        config: authoritative,
        message: VERIFIED_MESSAGE,
      };
    }
  } catch {
    // Si la lectura de conciliación falla se conserva el estado incierto.
  }
  throw fallbackError;
}

export async function updateGlobalThresholdWithReconciliation(
  val: number,
  repository: InventoryRepository = getInventoryRepository(),
): Promise<ThresholdMutationSuccess> {
  let updated: ThresholdConfig;
  try {
    updated = await repository.updateGlobalThreshold(val);
  } catch (err: unknown) {
    if (err instanceof InventoryError && err.code === "RESULTADO_INCIERTO") {
      return reconcileThresholdWrite(
        repository,
        (config) => config.globalThreshold === val,
        err,
      );
    }
    throw err;
  }

  // Validación semántica: un 200 con DTO contradictorio no acredita la
  // escritura. Se intenta una única conciliación por lectura.
  if (updated.globalThreshold !== val) {
    return reconcileThresholdWrite(
      repository,
      (config) => config.globalThreshold === val,
      unaccreditedWriteError(),
    );
  }

  return {
    status: "CONFIRMED",
    config: updated,
    message: "Umbral global actualizado correctamente.",
  };
}

export async function updateSkuThresholdWithReconciliation(
  sku: string,
  val: number,
  repository: InventoryRepository = getInventoryRepository(),
): Promise<ThresholdMutationSuccess> {
  let updated: ThresholdConfig;
  try {
    updated = await repository.updateSkuThreshold(sku, val);
  } catch (err: unknown) {
    if (err instanceof InventoryError && err.code === "RESULTADO_INCIERTO") {
      return reconcileThresholdWrite(
        repository,
        (config) => config.skuOverrides[sku] === val,
        err,
      );
    }
    throw err;
  }

  if (updated.skuOverrides[sku] !== val) {
    return reconcileThresholdWrite(
      repository,
      (config) => config.skuOverrides[sku] === val,
      unaccreditedWriteError(),
    );
  }

  return {
    status: "CONFIRMED",
    config: updated,
    message: `Umbral para SKU ${sku} actualizado correctamente.`,
  };
}

async function removeSkuThresholdOverrideWithReconciliation(sku: string, repository: InventoryRepository): Promise<ThresholdMutationSuccess> {
  if (!repository.removeSkuThresholdOverride) throw new InventoryError("CONTRATO_BLOQUEADO", "Backend no implementa la eliminación contractual del override.");
  try { await repository.removeSkuThresholdOverride(sku); }
  catch (error) {
    if (!(error instanceof InventoryError && error.code === "RESULTADO_INCIERTO")) throw error;
  }
  const config = await repository.getThresholds();
  if (Object.hasOwn(config.skuOverrides, sku)) throw new InventoryError("RESULTADO_INCIERTO", "La lectura autoritativa aún muestra el override; no se repetirá la eliminación.");
  return { status: "VERIFIED", config, message: "La lectura autoritativa confirma que el SKU hereda el umbral global." };
}

// Identifica la escritura propia cuya notificación provocó la recarga en curso.
// Sirve para que esa recarga no pueda degradar el resultado ya confirmado.
interface OwnMutationReload {
  kind: "global" | "sku";
  value: number;
  sku?: string;
}

function serverReflectsOwnMutation(
  data: ThresholdConfig,
  pending: OwnMutationReload,
): boolean {
  if (pending.kind === "global") return data.globalThreshold === pending.value;
  if (pending.sku === undefined) return false;
  return data.skuOverrides[pending.sku] === pending.value;
}

export function useThresholds() {
  const revision = useInventoryChangeSignal();
  const requestKey = JSON.stringify([revision]);

  const [response, setResponse] = useState<{
    requestKey: string;
    thresholds: ThresholdConfig | null;
    error: string | null;
  }>();

  // Última configuración válida conocida (de una lectura exitosa o de una
  // escritura confirmada). Una recarga fallida NO la invalida.
  const confirmedConfigRef = useRef<ThresholdConfig | null>(null);
  const ownMutationReloadRef = useRef<OwnMutationReload | null>(null);

  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<ThresholdFeedback | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const thresholdIntentKey = (kind: "global" | "sku", sku?: string) => {
    const repo = getInventoryRepository() as InventoryRepository & { getThresholdWriteScope?: () => string };
    return `g6:inventory:threshold:${encodeURIComponent(repo.getThresholdWriteScope?.() ?? "session-unavailable")}:${kind}:${encodeURIComponent(sku ?? "")}`;
  };

  useEffect(() => {
    let cancelled = false;

    getInventoryRepository()
      .getThresholds()
      .then((data) => {
        if (cancelled) return;
        const ownMutation = ownMutationReloadRef.current;
        ownMutationReloadRef.current = null;

        // La recarga disparada por una escritura propia que aún no aparece en
        // el servidor (consistencia eventual) no revierte el resultado
        // confirmado. Las recargas por cambios externos siguen actualizando.
        if (ownMutation && !serverReflectsOwnMutation(data, ownMutation)) {
          const preserved = confirmedConfigRef.current;
          setRefreshWarning(
            "El listado aún no refleja el cambio confirmado; se conserva el último valor acreditado.",
          );
          setResponse({
            requestKey,
            thresholds: preserved,
            error: null,
          });
          return;
        }

        confirmedConfigRef.current = data;
        for (const kind of ["global", "sku"] as const) {
          try {
            const prefix = `g6:inventory:threshold:${encodeURIComponent((getInventoryRepository() as InventoryRepository & { getThresholdWriteScope?: () => string }).getThresholdWriteScope?.() ?? "session-unavailable")}:${kind}:`;
            for (const key of Object.keys(sessionStorage).filter(item => item.startsWith(prefix))) {
              const intent = JSON.parse(sessionStorage.getItem(key) ?? "null") as { value?: number; sku?: string } | null;
              const confirmed = kind === "global" ? data.globalThreshold === intent?.value : intent?.sku && data.skuOverrides[intent.sku] === intent.value;
              if (confirmed) sessionStorage.removeItem(key);
            }
          } catch { /* unresolved marker remains fail-closed */ }
        }
        setRefreshWarning(null);
        setResponse({ requestKey, thresholds: data, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        ownMutationReloadRef.current = null;
        const message = err.message || "Error al cargar umbrales.";

        // P1-02: un fallo de lectura posterior no puede convertir una escritura
        // confirmada en error ni borrar la configuración vigente.
        const preserved = confirmedConfigRef.current;
        if (preserved) {
          setRefreshWarning(message);
          setResponse({ requestKey, thresholds: preserved, error: null });
          return;
        }
        setRefreshWarning(null);
        setResponse({ requestKey, thresholds: null, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const applyMutation = async (
    mutate: () => Promise<ThresholdMutationSuccess>,
    pending: OwnMutationReload,
    fallbackError: string,
  ): Promise<boolean> => {
    setSaving(true);
    setFeedback(null);
    setRefreshWarning(null);
    const intentKey = thresholdIntentKey(pending.kind, pending.sku);
    try { if (sessionStorage.getItem(intentKey)) throw new InventoryError("RESULTADO_INCIERTO", "Hay una escritura previa de este umbral pendiente de conciliación."); sessionStorage.setItem(intentKey, JSON.stringify({ ...pending })); }
    catch (error) { setFeedback(describeThresholdMutationError(error, fallbackError)); setSaving(false); return false; }
    try {
      const result = await mutate();
      try { sessionStorage.removeItem(intentKey); } catch { /* verified from server on next read */ }
      confirmedConfigRef.current = result.config;
      setResponse({
        requestKey,
        thresholds: result.config,
        error: null,
      });
      setFeedback(describeThresholdMutationSuccess(result));
      // Se conserva la notificación para el resto de vistas; solo la recarga
      // derivada de esta misma mutación queda protegida.
      ownMutationReloadRef.current = pending;
      notifyInventoryChanged();
      return true;
    } catch (err: unknown) {
      if (!(err instanceof InventoryError && err.code === "RESULTADO_INCIERTO")) { try { sessionStorage.removeItem(intentKey); } catch { /* retain fail-closed */ } }
      setFeedback(describeThresholdMutationError(err, fallbackError));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateGlobal = (val: number) =>
    applyMutation(
      () => updateGlobalThresholdWithReconciliation(val),
      { kind: "global", value: val },
      "Error al actualizar umbral global.",
    );

  const updateSku = (sku: string, val: number) =>
    applyMutation(
      () => updateSkuThresholdWithReconciliation(sku, val),
      { kind: "sku", value: val, sku },
      "Error al actualizar umbral.",
    );

  const removeSkuOverride = (sku: string) => applyMutation(
    () => removeSkuThresholdOverrideWithReconciliation(sku, getInventoryRepository()),
    { kind: "sku", value: -1, sku },
    "No se pudo recuperar la herencia del umbral global.",
  );

  const isCurrent = response?.requestKey === requestKey;
  const loading = !isCurrent;
  const thresholds = response?.thresholds ?? null;
  const error = isCurrent ? response.error : null;

  return {
    thresholds,
    loading,
    saving,
    error,
    feedback,
    refreshWarning,
    updateGlobal,
    updateSku,
    removeSkuOverride,
    canRemoveSkuOverride: typeof (getInventoryRepository() as InventoryRepository).removeSkuThresholdOverride === "function",
    clearFeedback: () => {
      setFeedback(null);
    },
  };
}
