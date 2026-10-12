import { useContext, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getPromotionRuntime } from "../services/promotionServices";
import { DataModeContext } from "../../../app/config/DataModeContext";

export function usePromotionServices() {
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const mode = useContext(DataModeContext);
  if (!mode)
    throw new Error("La aplicación requiere configurar su modo de datos.");
  const context = getPromotionRuntime(mode).resolve(params);
  const retry = () => {
    setParams(context.clearTransientParams, { replace: true });
    setRevision((value) => value + 1);
  };
  return { ...context, revision, retry };
}
