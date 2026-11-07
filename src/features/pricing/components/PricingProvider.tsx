import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
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
  const [catalogConsumers, setCatalogConsumers] = useState(0);
  const watchCatalog = useCallback(() => {
    setCatalogConsumers(count => count + 1);
    return () => setCatalogConsumers(count => count - 1);
  }, []);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const readRevision = useCallback(() => runtime.updates.version("listTargets"), [runtime]);
  const sourceRevision = useSyncExternalStore(runtime.updates.subscribe, readRevision, readRevision);
  const retryCatalog = useCallback(
    () => setCatalogRevision((value) => value + 1),
    [],
  );
  const read = useCallback(
    (signal: AbortSignal) => runtime.service.listTargets(signal),
    [runtime],
  );
  const catalogKey = `catalog:${catalogRevision}:${sourceRevision}`;
  const { state } = usePricingRead(catalogKey, read, catalogKey, catalogConsumers > 0);
  return (
    <PricingContext.Provider value={{ runtime, catalog: state, retryCatalog, watchCatalog }}>
      {children}
    </PricingContext.Provider>
  );
}
