import { useEffect, useRef, useState } from "react";
import { categoryService } from "../services/categoryService";
import { CategorySlugConflictError } from "../services/categoryRepository";
import type {
  CategoryCreateInput,
  CategoryCreateResult,
  SlugCheckResult,
} from "../types";

export type CreateCategoryPhase =
  | "idle"
  | "comprobando"
  | "confirmando"
  | "guardando"
  | "creado";

export function useCreateCategory() {
  const [phase, setPhase] = useState<CreateCategoryPhase>("idle");
  const [slugCheck, setSlugCheck] = useState<SlugCheckResult | null>(null);
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<CategoryCreateResult | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const comprobar = (nombre: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setSlugCheck(null);
    setCreado(null);
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
        setError(
          err instanceof Error ? err.message : "No se pudo verificar el slug.",
        );
        setPhase("idle");
      },
    );
  };

  const confirmar = (input: CategoryCreateInput) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setPhase("guardando");
    void categoryService.crear(input, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setCreado(result);
        setPhase("creado");
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof CategorySlugConflictError) {
          setError(
            "El slug dejó de estar disponible. Revisa la nueva propuesta antes de volver a confirmar.",
          );
          setPhase("comprobando");
          void categoryService.proponerSlug(input.nombre, controller.signal).then(
            (result) => {
              if (controller.signal.aborted) return;
              setSlugCheck(result);
              setSlug(result.slug);
              setPhase("confirmando");
            },
            (resolutionError: unknown) => {
              if (controller.signal.aborted) return;
              setError(
                resolutionError instanceof Error
                  ? `No se pudo obtener una nueva propuesta: ${resolutionError.message}`
                  : "No se pudo obtener una nueva propuesta. Inténtalo de nuevo.",
              );
              setPhase("confirmando");
            },
          );
          return;
        }
        setError(
          err instanceof Error ? err.message : "No se pudo crear la categoría.",
        );
        setPhase("confirmando");
      },
    );
  };

  const cerrar = () => {
    controllerRef.current?.abort();
    setError(null);
    setSlugCheck(null);
    setSlug("");
    setPhase("idle");
  };

  return { phase, slugCheck, slug, error, creado, setSlug, comprobar, confirmar, cerrar };
}
