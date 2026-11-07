import { useEffect, useRef, useState } from "react";
import { categoryService } from "../services/categoryService";
import { generarSlug } from "../services/slug";
import { isUncertainTaxonomyMutation } from "../adapters/taxonomyHttp";
import type {
  CategoryDetail,
  CategoryUpdateInput,
  SlugCheckResult,
} from "../types";

export type UpdateCategoryPhase =
  | "idle"
  | "comprobando"
  | "confirmando"
  | "guardando"
  | "actualizado";

export function useUpdateCategory() {
  const [phase, setPhase] = useState<UpdateCategoryPhase>("idle");
  const [slugCheck, setSlugCheck] = useState<SlugCheckResult | null>(null);
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CategoryDetail | null>(null);
  const [unknownIntent, setUnknownIntent] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const comprobar = (nombre: string) => {
    const propuesto = generarSlug(nombre);
    setSlug(propuesto);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setSlugCheck(null);
    setResultado(null);
    setPhase("comprobando");
    void categoryService.comprobarSlug(propuesto, controller.signal).then(
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

  const actualizar = (input: CategoryUpdateInput) => {
    const intent = JSON.stringify(input);
    if (unknownIntent === intent) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setPhase("guardando");
    void categoryService.actualizar(input, controller.signal).then(
      (detalle) => {
        if (controller.signal.aborted) return;
        setResultado(detalle);
        setPhase("actualizado");
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        if (isUncertainTaxonomyMutation(err)) setUnknownIntent(intent);
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo actualizar la categoría.",
        );
        setPhase("confirmando");
      },
    );
  };

  const reconciliar = async (input: CategoryUpdateInput) => {
    try {
      const current = await categoryService.obtener(input.id);
      if (current && current.nombre === input.nombre && current.padreId === input.padreId && (current.descripcion ?? "") === (input.descripcion ?? "") && current.orden === input.orden) {
        setResultado(current); setError(null); setPhase("actualizado"); return true;
      }
      setError("La lectura actual no confirma todos los campos enviados. Conservamos el bloqueo de esta intención; revisa el detalle antes de continuar.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo reconciliar la categoría."); }
    return false;
  };

  const cerrar = () => {
    controllerRef.current?.abort();
    setError(null);
    setSlugCheck(null);
    setPhase("idle");
  };

  return {
    phase,
    slugCheck,
    slug,
    error,
    resultado,
    isUnknownIntent: (input: CategoryUpdateInput) => unknownIntent === JSON.stringify(input),
    setSlug,
    comprobar,
    actualizar,
    reconciliar,
    cerrar,
  };
}
