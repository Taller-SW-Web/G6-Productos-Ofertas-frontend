import { useEffect, useRef, useState } from "react";
import { categoryService } from "../services/categoryService";
import type { CategoryBajaScenario } from "../services/categoryRepository";
import type { BajaSolicitudResult } from "../types";

export type SolicitarBajaState =
  | { status: "idle" }
  | { status: "enviando" }
  | { status: "success"; result: BajaSolicitudResult }
  | { status: "error"; message: string };

export function useSolicitarBaja(id: string, scenario: CategoryBajaScenario) {
  const [state, setState] = useState<SolicitarBajaState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const solicitar = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "enviando" });
    void categoryService.solicitarBaja(id, scenario, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setState({ status: "success", result });
      },
      (error: unknown) => {
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
