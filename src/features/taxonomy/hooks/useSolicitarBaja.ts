import { useEffect, useRef, useState } from "react";
import { categoryService } from "../services/categoryService";
import type { BajaSolicitudResult } from "../types";

export type SolicitarBajaState =
  | { status: "idle" }
  | { status: "enviando" }
  | { status: "success"; result: BajaSolicitudResult }
  | { status: "error"; message: string };

export function useSolicitarBaja(id: string, onAccepted?: (id: string) => void) {
  const [state, setState] = useState<SolicitarBajaState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const enviandoRef = useRef(false);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const solicitar = () => {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "enviando" });
    void categoryService.solicitarBaja(id, controller.signal).then(
      (result) => {
        enviandoRef.current = false;
        if (controller.signal.aborted) return;
        if (result.resultado === "verificando" && result.operacionId) onAccepted?.(result.operacionId);
        setState({ status: "success", result });
      },
      (error: unknown) => {
        enviandoRef.current = false;
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo verificar la baja.",
        });
      },
    );
  };

  const reiniciar = () => {
    controllerRef.current?.abort();
    setState({ status: "idle" });
  };

  return { state, solicitar, reiniciar };
}
