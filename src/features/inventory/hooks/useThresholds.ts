import { useEffect, useState } from "react";
import { notifyInventoryChanged } from "../services/inventoryEvents";
import { getInventoryRepository } from "../services/inventoryProvider";
import { useInventoryChangeSignal } from "./useInventoryChangeSignal";
import type { ThresholdConfig } from "../services/inventoryTypes";

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
      const updated =
        await getInventoryRepository().updateGlobalThreshold(val);
      setResponse({
        requestKey,
        thresholds: updated,
        error: null,
      });
      setSuccessMessage("Umbral global actualizado correctamente.");
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
      const updated = await getInventoryRepository().updateSkuThreshold(
        sku,
        val,
      );
      setResponse({
        requestKey,
        thresholds: updated,
        error: null,
      });
      setSuccessMessage(`Umbral para SKU ${sku} actualizado correctamente.`);
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