import { useSearchParams } from "react-router-dom";
import { priceTargets } from "../mocks/prices";
import type { PriceQuery } from "../services/pricingRepository";

export function usePricingContext(skuLookup = false) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("target");
  const target = priceTargets.find((row) => row.id === (raw ?? "base"));
  const query: PriceQuery = {
    targetId: target?.id ?? "base",
    channel:
      (skuLookup || target?.kind === "variant") &&
      params.get("channel") === "retail"
        ? "retail"
        : "global",
  };
  const suffix = `?${params.toString()}`;
  return {
    params,
    setParams,
    target,
    query,
    suffix,
    invalid: raw !== null && !target,
    review: import.meta.env.DEV && params.get("modoRevision") === "1",
  };
}
