import { useEffect, useRef, useState } from "react";
import {
  SeoConflictError,
  type GuardarSeoInput,
} from "../services/seoRepository";
import { seoService } from "../services/seoService";
import type { SeoCategory } from "../types";
import { isUncertainTaxonomyMutation } from "../adapters/taxonomyHttp";

export type GuardarSeoState =
  | { status: "idle" }
  | { status: "enviando" }
  | { status: "success"; detalle: SeoCategory }
  | { status: "conflicto"; message: string }
  | { status: "incierto"; message: string }
  | { status: "error"; message: string };

export function useGuardarSeo(
  onSuccess?: (detalle: SeoCategory) => void,
) {
  const [state, setState] = useState<GuardarSeoState>({ status: "idle" });
  const [unknownIntent, setUnknownIntent] = useState<string | null>(null);
  const [unknownInput, setUnknownInput] = useState<GuardarSeoInput | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const guardar = (input: GuardarSeoInput) => {
    const intent = JSON.stringify(input);
    if (unknownIntent === intent) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "enviando" });
    void seoService.guardar(input, controller.signal).then(
      (detalle) => {
        if (controller.signal.aborted) return;
        if (detalle) {
          setState({ status: "success", detalle });
          onSuccess?.(detalle);
        } else {
          setState({
            status: "error",
            message: "La categoría no existe o ya no está disponible.",
          });
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (isUncertainTaxonomyMutation(error)) {
          setUnknownIntent(intent);
          setUnknownInput(input);
          setState({ status: "incierto", message: `${error.message} Consulta el slug y el historial de SEO antes de volver a guardar.` });
          return;
        }
        if (error instanceof SeoConflictError) {
          setState({ status: "conflicto", message: error.message });
          return;
        }
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudieron guardar los metadatos.",
        });
      },
    );
  };

  const reconciliar = async () => {
    if (!unknownInput) { setState({ status: "incierto", message: "Recarga los datos de SEO para recuperar la intención que requiere conciliación." }); return false; }
    try {
      const current = await seoService.obtener(unknownInput.id);
      if (current && current.slug === unknownInput.slug && (current.metaTitulo ?? "") === unknownInput.metaTitulo && (current.metaDescripcion ?? "") === unknownInput.metaDescripcion) {
        setState({ status: "success", detalle: current }); onSuccess?.(current); return true;
      }
      setState({ status: "incierto", message: "La lectura actual no coincide con todos los campos enviados. Conservamos el bloqueo de esta intención; revisa el historial antes de continuar." });
    } catch (error) { setState({ status: "incierto", message: error instanceof Error ? error.message : "No se pudo reconciliar SEO." }); }
    return false;
  };

  const reiniciar = () => {
    controllerRef.current?.abort();
    setState({ status: "idle" });
  };

  return { state, guardar, reiniciar, reconciliar, isUnknownIntent: (input: GuardarSeoInput) => unknownIntent === JSON.stringify(input) };
}
