import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { promotionRuntime } from "../services/promotionServices";

export function usePromotionServices() {
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const context = promotionRuntime.resolve(params);
  const retry = () => {
    setParams(context.clearTransientParams, { replace: true });
    setRevision((value) => value + 1);
  };
  return { ...context, revision, retry };
}
