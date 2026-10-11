import { useCallback, useState } from "react";
import { pricingService } from "../services/pricingService";
import type { BatchScenario } from "../services/pricingModels";
import { usePricingAction, usePricingRead } from "./usePricingRequest";

export function usePriceBatch(id: string, scenario: BatchScenario) {
  const [revision, setRevision] = useState(0);
  const read = useCallback(
    (signal: AbortSignal) => pricingService.readBatch(id, scenario, signal),
    [id, scenario],
  );
  // The reference remains stable when refreshing/error scenarios change.
  const response = usePricingRead(`${id}:${scenario}:${revision}`, read, id);
  const report = usePricingAction<string>();
  return {
    ...response,
    report,
    refresh: () => {
      report.clear();
      setRevision((value) => value + 1);
    },
    download: () =>
      report.run((signal) => pricingService.report(id, scenario, signal)),
  };
}
