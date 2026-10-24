import { useEffect, useState } from "react";
import { InventoryError } from "../services/inventoryErrors";
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
      let putError: unknown = null;
      try {
        await getInventoryRepository().updateGlobalThreshold(val);
      } catch (err: unknown) {
        if (
          err instanceof InventoryError &&
          err.code === "RESULTADO_INCIERTO"
        ) {
          putError = err;
        } else {
          throw err;
        }
      }

      // Lectura autoritativa antes de acreditar el nuevo valor
      try {
        const authoritative = await getInventoryRepository().getThresholds();
        if (authoritative.globalThreshold === val) {
          setResponse({
            requestKey,
            thresholds: authoritative,
            error: null,
          });
          setSuccessMessage("Umbral global actualizado correctamente.");
          notifyInventoryChanged();
          return true;
        }
      } catch {
        // Fall through to show uncertain state
      }

      throw putError instanceof Error
        ? putError
        : new InventoryError(
            "RESULTADO_INCIERTO",
            "El umbral podría haberse actualizado, pero no se confirmó el resultado. Consulta el valor actual antes de continuar.",
          );
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
      let putError: unknown = null;
      try {
        await getInventoryRepository().updateSkuThreshold(sku, val);
      } catch (err: unknown) {
        if (
          err instanceof InventoryError &&
          err.code === "RESULTADO_INCIERTO"
        ) {
          putError = err;
        } else {
          throw err;
        }
      }

      // Lectura autoritativa antes de acreditar el nuevo valor
      try {
        const authoritative = await getInventoryRepository().getThresholds();
        if (authoritative.skuOverrides[sku] === val) {
          setResponse({
            requestKey,
            thresholds: authoritative,
            error: null,
          });
          setSuccessMessage(`Umbral para SKU ${sku} actualizado correctamente.`);
          notifyInventoryChanged();
          return true;
        }
      } catch {
        // Fall through to show uncertain state
      }

      throw putError instanceof Error
        ? putError
        : new InventoryError(
            "RESULTADO_INCIERTO",
            "El umbral podría haberse actualizado, pero no se confirmó el resultado. Consulta el valor actual antes de continuar.",
          );
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
