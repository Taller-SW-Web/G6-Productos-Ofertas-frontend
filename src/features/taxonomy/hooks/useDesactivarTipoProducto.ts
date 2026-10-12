import { useEffect, useRef, useState } from "react";
import { productTypeService } from "../services/productTypeService";
import type { ProductTypeDesactivarResult } from "../types";

export type DesactivarTipoProductoState =
  | { status: "idle" }
  | { status: "enviando" }
  | { status: "success"; result: ProductTypeDesactivarResult }
  | { status: "error"; message: string };

export function useDesactivarTipoProducto(
  id: string,
  onSuccess?: (result: ProductTypeDesactivarResult) => void,
) {
  const [state, setState] = useState<DesactivarTipoProductoState>({
    status: "idle",
  });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const enviar = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "enviando" });
    void productTypeService.desactivar(id, controller.signal).then(
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
              : "No se pudo desactivar el tipo de producto.",
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