import { useEffect, useState } from "react";
import { InventoryError } from "../services/inventoryErrors";
import { notifyInventoryChanged } from "../services/inventoryEvents";
import { getInventoryRepository } from "../services/inventoryProvider";
import { useInventoryChangeSignal } from "./useInventoryChangeSignal";
import type { ThresholdConfig } from "../services/inventoryTypes";

export interface ThresholdMutationSuccess {
  status: "CONFIRMED" | "VERIFIED";
  config: ThresholdConfig;
  message: string;
}

export async function updateGlobalThresholdWithReconciliation(
  val: number,
  repository = getInventoryRepository(),
): Promise<ThresholdMutationSuccess> {
  try {
    const updated = await repository.updateGlobalThreshold(val);
    return {
      status: "CONFIRMED",
      config: updated,
      message: "Umbral global actualizado correctamente.",
    };
  } catch (err: unknown) {
    if (err instanceof InventoryError && err.code === "RESULTADO_INCIERTO") {
      try {
        const authoritative = await repository.getThresholds();
        if (authoritative.globalThreshold === val) {
          return {
            status: "VERIFIED",
            config: authoritative,
            message: "El valor deseado fue verificado en el servidor.",
          };
        }
      } catch {
        // Si el GET de conciliación falla, conservamos el estado incierto
      }
    }
    throw err;
  }
}

export async function updateSkuThresholdWithReconciliation(
  sku: string,
  val: number,
  repository = getInventoryRepository(),
): Promise<ThresholdMutationSuccess> {
  try {
    const updated = await repository.updateSkuThreshold(sku, val);
    return {
      status: "CONFIRMED",
      config: updated,
      message: `Umbral para SKU ${sku} actualizado correctamente.`,
    };
  } catch (err: unknown) {
    if (err instanceof InventoryError && err.code === "RESULTADO_INCIERTO") {
      try {
        const authoritative = await repository.getThresholds();
        if (authoritative.skuOverrides[sku] === val) {
          return {
            status: "VERIFIED",
            config: authoritative,
            message: "El valor deseado fue verificado en el servidor.",
          };
        }
      } catch {
        // Si el GET de conciliación falla, conservamos el estado incierto
      }
    }
    throw err;
  }
}

export function useThresholds() {
  const revision = useInventoryChangeSignal();
  const requestKey = JSON.stringify([revision]);

  const [response, setResponse] = useState<{
    requestKey: string;
    thresholds: ThresholdConfig | null;
    error: string | null;
  }>();

  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getInventoryRepository()
      .getThresholds()
      .then((data) => {
        if (!cancelled) {
          setResponse({ requestKey, thresholds: data, error: null });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setResponse({
            requestKey,
            thresholds: null,
            error: err.message || "Error al cargar umbrales.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const updateGlobal = async (val: number) => {
    setSaving(true);
    setSaveError(null);
    setSuccessMessage(null);
    try {
      const result = await updateGlobalThresholdWithReconciliation(val);
      setResponse({
        requestKey,
        thresholds: result.config,
        error: null,
      });
      setSuccessMessage(result.message);
      notifyInventoryChanged();
      return true;
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Error al actualizar umbral global.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateSku = async (sku: string, val: number) => {
    setSaving(true);
    setSaveError(null);
    setSuccessMessage(null);
    try {
      const result = await updateSkuThresholdWithReconciliation(sku, val);
      setResponse({
        requestKey,
        thresholds: result.config,
        error: null,
      });
      setSuccessMessage(result.message);
      notifyInventoryChanged();
      return true;
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : "Error al actualizar umbral.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const isCurrent = response?.requestKey === requestKey;
  const loading = !isCurrent;
  const thresholds = response?.thresholds ?? null;
  const error = isCurrent ? response.error : null;

  return {
    thresholds,
    loading,
    saving,
    error,
    saveError,
    successMessage,
    updateGlobal,
    updateSku,
    clearFeedback: () => {
      setSaveError(null);
      setSuccessMessage(null);
    },
  };
}
