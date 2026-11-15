import { useEffect, useRef, useState } from "react";
import { categoryService } from "../services/categoryService";
import { generarSlug } from "../services/slug";
import type {
  CategoryCreateInput,
  CategoryCreateResult,
  SlugCheckResult,
} from "../types";
import { isUncertainTaxonomyMutation } from "../adapters/taxonomyHttp";

export type CreateCategoryPhase =
  | "idle"
  | "comprobando"
  | "confirmando"
  | "guardando"
  | "incierto"
  | "creado";

export function useCreateCategory() {
  const [phase, setPhase] = useState<CreateCategoryPhase>("idle");
  const [slugCheck, setSlugCheck] = useState<SlugCheckResult | null>(null);
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<CategoryCreateResult | null>(null);
  const [pendingInput, setPendingInput] = useState<CategoryCreateInput | null>(null);
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
    setCreado(null);
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

  const confirmar = (input: CategoryCreateInput) => {
    if (phase !== "confirmando" || !slugCheck) return;
    if (pendingInput && JSON.stringify(pendingInput) === JSON.stringify(input)) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setPhase("guardando");
    void categoryService.crear(input, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setPendingInput(null); setCreado(result);
        setPhase("creado");
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        const uncertain = isUncertainTaxonomyMutation(err);
        if (uncertain) setPendingInput(input);
        setError(
          err instanceof Error ? err.message : "No se pudo crear la categoría.",
        );
        setPhase(uncertain ? "incierto" : "confirmando");
      },
    );
  };

  const reconciliar = async () => {
    if (!pendingInput) return;
    try {
      const tree = await categoryService.list();
      const found: CategoryCreateResult[] = [];
      const visit = (items: import("../types").CategoryNode[]) => { for (const item of items) { if (item.nombre === pendingInput.nombre && item.slug === pendingInput.slug) found.push({ id: item.id, nombre: item.nombre, slug: pendingInput.slug }); if (item.hijas) visit(item.hijas); } };
      visit(tree.nodos);
      if (found.length === 1 && found[0]) { setCreado(found[0]); setPendingInput(null); setPhase("creado"); }
      else setError(found.length > 1 ? "El árbol muestra más de una coincidencia. Conservamos el bloqueo de envío." : "El árbol no muestra aún una coincidencia. El resultado sigue incierto y no se reenviará.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo reconciliar la categoría."); }
  };

  const cerrar = () => {
    controllerRef.current?.abort();
    setError(null);
    setSlugCheck(null);
    setSlug("");
    setPhase("idle");
  };

  return { phase, slugCheck, slug, error, creado, setSlug, comprobar, confirmar, cerrar, reconciliar };
}
