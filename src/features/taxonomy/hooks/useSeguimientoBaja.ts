import { useCallback, useEffect, useRef, useState } from "react";
import { brandService } from "../services/brandService";
import { categoryService } from "../services/categoryService";
import { getTaxonomyGateway } from "../services/taxonomyGatewayRuntime";

type Tipo = "categoria" | "marca";
type Estado = "recuperando" | "idle" | "pendiente" | "confirmada" | "rechazada" | "error";

async function clave(tipo: Tipo, id: string, owner: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${owner}\0${tipo}\0${id}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `g6:taxonomy:operation:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Solo guarda la referencia confirmada por el 202 y la aísla por usuario y entidad. */
export function useSeguimientoBaja(tipo: Tipo, id: string) {
  const [estado, setEstado] = useState<Estado>("recuperando");
  const [operacionId, setOperacionId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [intento, setIntento] = useState(0);
  const keyRef = useRef<string | null>(null);
  const ownerRef = useRef<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const owner = getTaxonomyGateway()?.scopeId?.() ?? null;
    ownerRef.current = owner;
    keyRef.current = null;
    if (!owner) {
      void Promise.resolve().then(() => { if (vigente) setEstado("idle"); });
      return () => { vigente = false; };
    }
    void clave(tipo, id, owner).then((key) => {
      if (!vigente || getTaxonomyGateway()?.scopeId?.() !== owner) return;
      keyRef.current = key;
      const guardada = sessionStorage.getItem(key);
      if (guardada) { setOperacionId(guardada); setEstado("pendiente"); }
      else setEstado("idle");
    }).catch(() => { if (vigente) { setMensaje("No se pudo recuperar el seguimiento guardado."); setEstado("error"); } });
    return () => { vigente = false; };
  }, [tipo, id]);

  const registrar = useCallback((operationId: string) => {
    setOperacionId(operationId);
    setEstado("pendiente");
    if (keyRef.current && ownerRef.current === (getTaxonomyGateway()?.scopeId?.() ?? null)) {
      try { sessionStorage.setItem(keyRef.current, operationId); }
      catch { setMensaje("No se pudo guardar la referencia para recuperarla al recargar."); }
    }
  }, []);

  useEffect(() => {
    if (!operacionId || estado !== "pendiente") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retraso = 2000;
    const consultar = async () => {
      try {
        const result = tipo === "categoria"
          ? await categoryService.consultarEstadoOperacion(operacionId, controller.signal)
          : await brandService.consultarResultadoBaja(operacionId, controller.signal);
        if (controller.signal.aborted) return;
        if (ownerRef.current !== (getTaxonomyGateway()?.scopeId?.() ?? null)) throw new Error("La sesión cambió durante la consulta.");
        const valor = "estado" in result ? result.estado : result.resultado;
        setMensaje(result.mensaje);
        if (valor === "confirmada" || valor === "exito" || valor === "rechazada") {
          setEstado(valor === "rechazada" ? "rechazada" : "confirmada");
          if (keyRef.current) sessionStorage.removeItem(keyRef.current);
          return;
        }
        if (valor !== "pendiente") { setEstado("error"); return; }
        timer = setTimeout(consultar, retraso);
        retraso = Math.min(retraso * 2, 30000);
      } catch (error) {
        if (!controller.signal.aborted) {
          setMensaje(error instanceof Error ? error.message : "No se pudo consultar la operación.");
          setEstado("error");
        }
      }
    };
    void consultar();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [operacionId, estado, tipo, intento]);

  const reintentar = () => { if (operacionId) { setEstado("pendiente"); setIntento((value) => value + 1); } };
  return { estado, operacionId, mensaje, registrar, reintentar };
}
