import { useCallback, type ReactNode } from "react";
import { PricingContext } from "../services/PricingContext";
import type { PricingRuntime } from "../services/pricingRuntime";
import { usePricingRead } from "../hooks/usePricingRequest";

export function PricingProvider({
  runtime,
  children,
}: {
  runtime: PricingRuntime;
  children: ReactNode;
}) {
  const read = useCallback(
    (signal: AbortSignal) => runtime.service.listTargets(signal),
    [runtime],
  );
  const { state } = usePricingRead("catalog", read);
  return (
    <PricingContext.Provider value={{ runtime, catalog: state }}>
      {children}
    </PricingContext.Provider>
  );
}
