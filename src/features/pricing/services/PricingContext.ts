import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { PricingRuntime } from "./pricingRuntime";
import type { PriceTarget, PricingRepository } from "./pricingRepository";
import type { RequestState } from "../hooks/usePricingRequest";

export const PricingContext = createContext<{
  runtime: PricingRuntime;
  catalog: RequestState<PriceTarget[]>;
  retryCatalog: () => void;
  watchCatalog: () => () => void;
} | null>(null);
export function usePricingRuntime() {
  const context = useContext(PricingContext);
  if (!context) throw new Error("Pricing requiere un PricingProvider.");
  return context.runtime;
}
export function usePricingCatalog() {
  const context = useContext(PricingContext);
  if (!context) throw new Error("Pricing requiere un PricingProvider.");
  const { watchCatalog } = context;
  useEffect(watchCatalog, [watchCatalog]);
  return context.catalog;
}
export function useRetryPricingCatalog() {
  const context = useContext(PricingContext);
  if (!context) throw new Error("Pricing requiere un PricingProvider.");
  return context.retryCatalog;
}
export function usePricingRevision(operation: keyof PricingRepository) {
  const { updates } = usePricingRuntime();
  return useSyncExternalStore(
    updates.subscribe,
    () => updates.version(operation),
    () => updates.version(operation),
  );
}
