import { useEffect, useState } from "react";
import { getTaxonomyOperation, type TaxonomyOperation } from "../adapters/httpTaxonomyOperationAdapter";
import type { TaxonomyGatewayTransport } from "../adapters/httpProductTypeAdapter";

export type OperationPollingState =
  | { status: "idle" | "pending" | "unconfirmed" }
  | { status: "completed" | "rejected"; operation: TaxonomyOperation }
  | { status: "error"; message: string };

export function useTaxonomyOperationPolling(transport: TaxonomyGatewayTransport | undefined, operationId: string | null, intervalMs = 2000, maximumMs = 90000): OperationPollingState {
  const [snapshot, setSnapshot] = useState<{ id: string; state: OperationPollingState } | null>(null);
  useEffect(() => {
    if (!transport || !operationId) return;
    const controller = new AbortController();
    const setState = (state: OperationPollingState) => setSnapshot({ id: operationId, state });
    const interval = Math.max(500, Math.min(intervalMs, 10000));
    const deadline = Date.now() + Math.max(1000, Math.min(maximumMs, 300000));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = setTimeout(() => { controller.abort(); setState({ status: "unconfirmed" }); }, deadline - Date.now());
    const poll = async () => {
      try {
        const operation = await getTaxonomyOperation(transport, operationId, controller.signal);
        if (controller.signal.aborted) return;
        if (operation.status === "COMPLETED" || operation.status === "REJECTED") {
          clearTimeout(expiry);
          setState({ status: operation.status === "COMPLETED" ? "completed" : "rejected", operation });
        } else {
          setState({ status: "pending" });
          timer = setTimeout(poll, interval);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          clearTimeout(expiry);
          setState({ status: "error", message: error instanceof Error ? error.message : "No se pudo consultar la operación." });
        }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(expiry); clearTimeout(timer); };
  }, [transport, operationId, intervalMs, maximumMs]);
  return snapshot?.id === operationId ? snapshot.state : { status: "idle" };
}
