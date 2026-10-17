import { useEffect, useRef, useState } from "react";
import { categoryService } from "../services/categoryService";
import type { CategoryDetail, CategoryUpdateInput } from "../types";

export type UpdateCategoryPhase =
  | "idle"
  | "guardando"
  | "actualizado"
  | "error";

export function useUpdateCategory() {
  const [phase, setPhase] = useState<UpdateCategoryPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CategoryDetail | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const actualizar = (input: CategoryUpdateInput) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setResultado(null);
    setPhase("guardando");
    void categoryService.actualizar(input, controller.signal).then(
      (detalle) => {
        if (controller.signal.aborted) return;
        setResultado(detalle);
        setPhase("actualizado");
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo actualizar la categoría.",
        );
        setPhase("error");
      },
    );
  };

  return { phase, error, resultado, actualizar };
}
