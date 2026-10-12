import { useEffect, useRef, useState } from "react";
import { productTypeService } from "../services/productTypeService";
import type { ProductTypeDesasociarResult } from "../types";

export type DesasociarCaracteristicaState =
  | { status: "idle" }
  | { status: "enviando" }
  | { status: "success"; result: ProductTypeDesasociarResult }
  | { status: "error"; message: string };

export function useDesasociarCaracteristica(
  id: string,
  onSuccess?: (result: ProductTypeDesasociarResult) => void,
) {
  const [state, setState] = useState<DesasociarCaracteristicaState>({
    status: "idle",
  });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const enviar = (caracteristicaId: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "enviando" });
    void productTypeService
      .desasociarCaracteristica(id, caracteristicaId, controller.signal)
      .then(
        (result) => {
          if (controller.signal.aborted) return;
          setState({ status: "success", result });
          onSuccess?.(result);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo desasociar la característica.",
          });
        },
      );
  };

  const reiniciar = () => {
    controllerRef.current?.abort();
    setState({ status: "idle" });
  };

  return { state, enviar, reiniciar };
}