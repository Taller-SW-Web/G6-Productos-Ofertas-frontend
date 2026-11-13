import { useEffect, useRef, useState } from "react";
import { categoryService } from "../services/categoryService";
import type { BajaCategoriaSeguimiento, BajaSolicitudResult, CategoryDetail } from "../types";
import { getTaxonomyGateway } from "../services/taxonomyGatewayRuntime";
import { resolveDataMode } from "../../../app/config/dataMode";
import { solicitarBajaHttp } from "../adapters/httpTaxonomyDeactivationAdapter";
import { useTaxonomyOperationPolling } from "./useTaxonomyOperationPolling";

export type SolicitarBajaState =
  | { status: "idle" }
  | { status: "enviando" }
  | { status: "success"; result: BajaSolicitudResult }
  | { status: "error"; message: string };

export type BajaSeguimientoState =
  | { status: "idle" }
  | { status: "consultando" }
  | { status: "success"; result: BajaCategoriaSeguimiento }
  | { status: "error"; message: string };

export function useSolicitarBaja(id: string, detalle?: CategoryDetail) {
  const api = resolveDataMode(import.meta.env?.VITE_DATA_MODE, import.meta.env?.DEV ?? true) === "api";
  const [operationId, setOperationId] = useState<string | null>(null);
  const polling = useTaxonomyOperationPolling(api ? getTaxonomyGateway() : undefined, operationId);
  const [state, setState] = useState<SolicitarBajaState>({ status: "idle" });
  const [mockSeguimiento, setSeguimiento] = useState<BajaSeguimientoState>({
    status: "idle",
  });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const solicitar = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "enviando" });
    setSeguimiento({ status: "idle" });
    const gateway = api ? getTaxonomyGateway() : undefined;
    const solicitud = api
      ? gateway && detalle ? solicitarBajaHttp(gateway, "categorias", id, controller.signal).then((operacionId): BajaSolicitudResult => {
          setOperationId(operacionId);
          return { resultado: "verificando", categoria: detalle, bloqueos: [], mensaje: "Solicitud admitida; esperando resultado.", operacionId };
        }) : Promise.reject(new Error("La baja de categoría no está configurada."))
      : categoryService.solicitarBaja(id, controller.signal);
    void solicitud.then(
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

  const consultarEstado = (operacionId: string) => {
    if (api) { setOperationId(operacionId); return; }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSeguimiento({ status: "consultando" });
    void categoryService
      .consultarEstadoOperacion(operacionId, controller.signal)
      .then(
        (result) => {
          if (controller.signal.aborted) return;
          setSeguimiento({ status: "success", result });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setSeguimiento({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo consultar el estado de la operación.",
          });
        },
      );
  };

  const reiniciar = () => {
    controllerRef.current?.abort();
    setOperationId(null);
    setState({ status: "idle" });
    setSeguimiento({ status: "idle" });
  };

  let seguimiento: BajaSeguimientoState = mockSeguimiento;
  if (api && operationId && polling.status !== "idle") {
    if (polling.status === "error") seguimiento = { status: "error", message: polling.message };
    else {
      const estado = polling.status === "completed" ? "confirmada" : polling.status === "rejected" ? "rechazada" : polling.status === "unconfirmed" ? "no-concluyente" : "pendiente";
      const mensaje = estado === "confirmada" ? "La baja fue confirmada." : estado === "rechazada" ? "La baja fue rechazada; consulta el estado de la categoría." : estado === "no-concluyente" ? "No se recibió confirmación dentro del plazo. Consulta la operación antes de reintentar." : "Solicitud admitida; esperando resultado.";
      seguimiento = { status: "success", result: { operacionId: operationId, estado, mensaje } };
    }
  }
  return { state, seguimiento, solicitar, consultarEstado, reiniciar, seguimientoAutomatico: api };
}