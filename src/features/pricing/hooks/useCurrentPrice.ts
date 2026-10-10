import { useEffect, useState } from "react";
import { pricingService } from "../services/pricingService";
import type {
  PriceQuery,
  PriceScenario,
  PriceSnapshot,
} from "../services/pricingRepository";

type PriceState =
  | { status: "loading" }
  | { status: "success"; result: PriceSnapshot | null }
  | { status: "error"; message: string; previous?: PriceSnapshot };
export function useCurrentPrice(
  query: PriceQuery,
  scenario: PriceScenario,
  revision: number,
) {
  const { targetId, channel } = query;
  const queryKey = JSON.stringify([targetId, channel]);
  const requestKey = JSON.stringify([targetId, channel, scenario, revision]);
  const [response, setResponse] = useState<{
    requestKey: string;
    state: PriceState;
  }>();
  const [lastSuccess, setLastSuccess] = useState<{
    queryKey: string;
    snapshot: PriceSnapshot;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    void pricingService
      .read({ targetId, channel }, scenario, controller.signal)
      .then(
        (result) => {
          if (controller.signal.aborted) return;
          if (result) setLastSuccess({ queryKey, snapshot: result });
          else setLastSuccess(undefined);
          setResponse({ requestKey, state: { status: "success", result } });
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            setResponse({
              requestKey,
              state: {
                status: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Consulta no disponible.",
              },
            });
        },
      );
    return () => controller.abort();
  }, [targetId, channel, scenario, requestKey, queryKey]);
  const previous =
    lastSuccess?.queryKey === queryKey ? lastSuccess.snapshot : undefined;
  const state =
    response?.requestKey === requestKey
      ? response.state
      : ({ status: "loading" } as const);
  return { state, previous };
}
