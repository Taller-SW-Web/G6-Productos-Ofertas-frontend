import { useEffect, useState } from "react";
import { notifyInventoryChanged } from "../services/inventoryEvents";
import { getInventoryRepository } from "../services/inventoryProvider";
import { useInventoryChangeSignal } from "./useInventoryChangeSignal";
import type {
  ReceiveTransferPayload,
  TransferFiltersQuery,
  TransferItem,
} from "../services/inventoryTypes";

export function useTransfers(filters: TransferFiltersQuery) {
  const revision = useInventoryChangeSignal();
  const { targetLocationId, status } = filters;
  const requestKey = JSON.stringify([targetLocationId, status, revision]);

  const [response, setResponse] = useState<{
    requestKey: string;
    transfers: TransferItem[];
    error: string | null;
  }>();

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getInventoryRepository()
      .getTransfers({ targetLocationId, status })
      .then((data) => {
        if (!cancelled) {
          setResponse({ requestKey, transfers: data, error: null });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setResponse({
            requestKey,
            transfers: [],
            error: err.message || "Error al cargar traslados.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [targetLocationId, status, requestKey]);

  const receive = async (payload: ReceiveTransferPayload) => {
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const updated =
        await getInventoryRepository().receiveTransfer(payload);
      setResponse((prev) =>
        prev
          ? {
              ...prev,
              transfers: prev.transfers.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : undefined,
      );
      setSuccessMessage(
        `Recepción registrada para traslado ${updated.transferCode} (${updated.status}).`,
      );
      notifyInventoryChanged();
      return updated;
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error al registrar la recepción de traslado.";
      setSubmitError(msg);
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const isCurrent = response?.requestKey === requestKey;
  const loading = !isCurrent;
  const transfers = isCurrent ? response.transfers : [];
  const error = isCurrent ? response.error : null;

  return {
    transfers,
    loading,
    submitting,
    error,
    submitError,
    successMessage,
    receive,
    clearFeedback: () => {
      setSubmitError(null);
      setSuccessMessage(null);
    },
  };
}