import { useCallback } from "react";
import { pricingService } from "../services/pricingService";
import type { PriceQuery } from "../services/pricingRepository";
import type { ReviewScenario } from "../services/pricingModels";
import { usePricingRead } from "./usePricingRequest";

export function useHistoricalPrice(
  query: PriceQuery,
  at: string | null,
  scenario: ReviewScenario,
  revision: number,
) {
  const { targetId, channel } = query;
  const read = useCallback(
    (signal: AbortSignal) =>
      at
        ? pricingService.readHistorical(
            { targetId, channel },
            at,
            scenario,
            signal,
          )
        : Promise.resolve(null),
    [targetId, channel, at, scenario],
  );
  return usePricingRead(
    `${targetId}:${channel}:${at}:${scenario}:${revision}`,
    read,
  );
}
