import { useEffect, useRef, useState } from "react";
import { brandService } from "../services/brandService";
import type { BrandBajaResult } from "../types";
import { getTaxonomyGateway } from "../services/taxonomyGatewayRuntime";
import { resolveDataMode } from "../../../app/config/dataMode";
import { solicitarBajaHttp } from "../adapters/httpTaxonomyDeactivationAdapter";
import { useTaxonomyOperationPolling } from "./useTaxonomyOperationPolling";

export type SolicitarBajaMarcaFase = "solicitud" | "verificacion";

export type SolicitarBajaMarcaState =
  | { status: "idle" }
  | { status: "enviando"; fase: SolicitarBajaMarcaFase }
  | { status: "success"; result: BrandBajaResult }
  | { status: "error"; message: string };

export function useSolicitarBajaMarca(
  id: string,
  onSuccess?: (result: BrandBajaResult) => void,
) {
  const api = resolveDataMode(import.meta.env?.VITE_DATA_MODE, import.meta.env?.DEV ?? true) === "api";
  const [operationId, setOperationId] = useState<string | null>(null);
  const polling = useTaxonomyOperationPolling(api ? getTaxonomyGateway() : undefined, operationId);
  const [baseState, setState] = useState<SolicitarBajaMarcaState>({
    status: "idle",
  });
  const callbackRef = useRef(onSuccess);
  useEffect(() => { callbackRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => {
    if (api && operationId && polling.status === "completed") {
      callbackRef.current?.({ resultado: "exito", mensaje: "La baja fue confirmada.", operacionId: operationId });
    }
  }, [api, operationId, polling]);
  const controllerRef = useRef<AbortController | null>(null);
  const operacionIdRef = useRef<string | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const resolver = (result: BrandBajaResult) => {
    operacionIdRef.current =
      result.resultado === "pendiente" ? (result.operacionId ?? null) : null;
    setState({ status: "success", result });
    onSuccess?.(result);
  };

  const emitirError = (error: unknown, controller: AbortController) => {
    if (controller.signal.aborted) return;
    setState({
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "No se pudo solicitar la baja de la marca.",
    });
  };

  const solicitar = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "enviando", fase: "solicitud" });
    const gateway = api ? getTaxonomyGateway() : undefined;
    const solicitud = api
      ? gateway ? solicitarBajaHttp(gateway, "marcas", id, controller.signal).then((operacionId): BrandBajaResult => { setOperationId(operacionId); return { resultado: "pendiente", mensaje: "Solicitud admitida; esperando resultado.", operacionId }; }) : Promise.reject(new Error("La baja de marca no está configurada."))
      : brandService.solicitarBaja(id, controller.signal);
    void solicitud.then(
      (result) => {
        if (controller.signal.aborted) return;
        resolver(result);
      },
      (error: unknown) => emitirError(error, controller),
    );
  };

  const consultar = () => {
    if (api) return;
    const operacionId = operacionIdRef.current;
    if (!operacionId) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "enviando", fase: "verificacion" });
    void brandService.consultarResultadoBaja(operacionId, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        resolver(result);
      },
      (error: unknown) => emitirError(error, controller),
    );
  };

  const reiniciar = () => {
    controllerRef.current?.abort();
    operacionIdRef.current = null;
    setOperationId(null);
    setState({ status: "idle" });
  };

  let state: SolicitarBajaMarcaState = baseState;
  if (api && operationId && polling.status !== "idle") {
    if (polling.status === "error") state = { status: "error", message: polling.message };
    else {
      const resultado = polling.status === "completed" ? "exito" : polling.status === "rejected" ? "rechazada" : polling.status === "unconfirmed" ? "no-concluyente" : "pendiente";
      const mensaje = resultado === "exito" ? "La baja fue confirmada." : resultado === "rechazada" ? "La baja fue rechazada; consulta el estado de la marca." : resultado === "no-concluyente" ? "No se recibió confirmación dentro del plazo. Consulta la operación antes de reintentar." : "Solicitud admitida; esperando resultado.";
      state = { status: "success", result: { resultado, mensaje, operacionId: operationId } };
    }
  }
  return { state, solicitar, consultar, reiniciar, seguimientoAutomatico: api };
}