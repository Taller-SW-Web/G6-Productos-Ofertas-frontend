import { useEffect, useRef, useState } from "react";
import { characteristicService } from "../services/characteristicService";
import type {
  CharacteristicCreateInput,
  CharacteristicCreateResult,
} from "../types";
import { isUncertainTaxonomyMutation } from "../adapters/taxonomyHttp";

export type CreateCharacteristicPhase = "idle" | "guardando" | "incierto" | "creado";

export function useCreateCharacteristic() {
  const [phase, setPhase] = useState<CreateCharacteristicPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<CharacteristicCreateResult | null>(null);
  const [pendingInput, setPendingInput] = useState<CharacteristicCreateInput | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const crear = (input: CharacteristicCreateInput) => {
    if (phase === "guardando" || (pendingInput && JSON.stringify(pendingInput) === JSON.stringify(input))) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setPhase("guardando");
    void characteristicService.crear(input, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setCreado(result);
        setPendingInput(null);
        setPhase("creado");
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo crear la característica.",
        );
        if (isUncertainTaxonomyMutation(err)) setPendingInput(input);
        setPhase(isUncertainTaxonomyMutation(err) ? "incierto" : "idle");
      },
    );
  };

  const reconciliar = async () => {
    if (!pendingInput) return;
    try {
      const list = await characteristicService.list();
      const matches = list.caracteristicas.filter(item => item.nombre === pendingInput.nombre && item.tipo === pendingInput.tipo && (item.unidad ?? undefined) === pendingInput.unidad);
      if (matches.length === 1 && matches[0]) {
        setCreado({ id: matches[0].id, nombre: matches[0].nombre, tipo: matches[0].tipo, estado: matches[0].estado, unidad: matches[0].unidad });
        setPendingInput(null); setPhase("creado");
      } else setError(matches.length > 1 ? "La consulta encontró varias características coincidentes; la mutación sigue protegida." : "No se encontró una coincidencia en Taxonomía. El resultado sigue incierto y no se reenviará.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo reconciliar la característica."); }
  };

  const reiniciar = () => {
    controllerRef.current?.abort();
    setError(null);
    setCreado(null);
    setPhase("idle");
  };

  return { phase, error, creado, crear, reiniciar, reconciliar };
}
