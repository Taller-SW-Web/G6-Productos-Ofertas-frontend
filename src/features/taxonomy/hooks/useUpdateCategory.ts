import { useEffect, useRef, useState } from "react";
import { categoryService } from "../services/categoryService";
import type { CategoryDetail, CategoryUpdateInput, SlugCheckResult } from "../types";

export type UpdateCategoryPhase =
  | "idle"
  | "comprobando"
  | "confirmando"
  | "guardando"
  | "actualizado"
  | "error";

export function useUpdateCategory() {
  const [phase, setPhase] = useState<UpdateCategoryPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CategoryDetail | null>(null);
  const [slugCheck, setSlugCheck] = useState<SlugCheckResult | null>(null);
  const [slug, setSlug] = useState("");
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

  const comprobar = (nombre: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setSlugCheck(null);
    setSlug("");
    setPhase("comprobando");
    void categoryService.proponerSlug(nombre, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setSlugCheck(result);
        setSlug(result.slug);
        setPhase("confirmando");
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "No se pudo verificar el slug.");
        setPhase("error");
      },
    );
  };

  const cerrar = () => {
    controllerRef.current?.abort();
    setSlugCheck(null);
    setSlug("");
    setError(null);
    setPhase("idle");
  };

  return { phase, error, resultado, slugCheck, slug, setSlug, comprobar, cerrar, actualizar };
}
