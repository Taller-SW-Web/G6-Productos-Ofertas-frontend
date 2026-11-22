import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthSession } from "../../../app/config/useAuthSession";
import { brandService } from "../services/brandService";
import { categoryService } from "../services/categoryService";
import { getTaxonomyGateway } from "../services/taxonomyGatewayRuntime";

type Tipo = "categoria" | "marca";
type Estado = "recuperando" | "idle" | "pendiente" | "confirmada" | "rechazada" | "error";
type Snapshot = { scope: string; estado: Estado; operacionId: string | null; mensaje: string };

async function clave(tipo: Tipo, id: string, owner: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${owner}\0${tipo}\0${id}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `g6:taxonomy:operation:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function useSeguimientoBaja(tipo: Tipo, id: string) {
  const { session, view } = useAuthSession();
  const owner = session ? view.user?.id ?? null : getTaxonomyGateway()?.scopeId?.() ?? null;
  const version = session?.getSessionVersion() ?? 0;
  const scope = JSON.stringify([owner, version, tipo, id]);
  const [snapshot, setSnapshot] = useState<Snapshot>({ scope, estado: "recuperando", operacionId: null, mensaje: "" });
  const [intento, setIntento] = useState(0);
  const keyRef = useRef<{ scope: string; key: string } | null>(null);
  const pollRef = useRef<AbortController | null>(null);
  const scopeRef = useRef(scope);
  const actual = snapshot.scope === scope ? snapshot : { scope, estado: "recuperando" as const, operacionId: null, mensaje: "" };

  useEffect(() => {
    if (!session) return;
    return session.subscribe(() => {
      if ((session.snapshot().user?.id ?? null) !== owner || session.getSessionVersion() !== version) pollRef.current?.abort();
    });
  }, [session, owner, version]);

  useEffect(() => {
    let vigente = true;
    scopeRef.current = scope;
    keyRef.current = null;
    const esActual = () => vigente && scopeRef.current === scope && (!session || ((session.snapshot().user?.id ?? null) === owner && session.getSessionVersion() === version));
    const recuperar = async () => {
      await Promise.resolve();
      let guardada: string | null = null;
      if (owner) {
        try {
          const key = await clave(tipo, id, owner);
          if (!esActual()) return;
          keyRef.current = { scope, key };
          try { guardada = sessionStorage.getItem(key); } catch { /* continuar en memoria */ }
        } catch { /* permitir operar sin persistencia */ }
      }
      if (esActual()) setSnapshot({ scope, estado: guardada ? "pendiente" : "idle", operacionId: guardada, mensaje: "" });
    };
    void recuperar();
    return () => { vigente = false; pollRef.current?.abort(); };
  }, [scope, owner, tipo, id, session, version]);

  const registrar = useCallback((operationId: string) => {
    if (scopeRef.current !== scope) return;
    if (session && ((session.snapshot().user?.id ?? null) !== owner || session.getSessionVersion() !== version)) return;
    const referencia = keyRef.current;
    if (referencia?.scope === scope) {
      try { sessionStorage.setItem(referencia.key, operationId); } catch { /* conservar la operación en memoria */ }
    }
    setSnapshot({ scope, estado: "pendiente", operacionId: operationId, mensaje: "" });
  }, [session, owner, version, scope]);

  useEffect(() => {
    if (!actual.operacionId || actual.estado !== "pendiente") return;
    const operationId = actual.operacionId;
    const controller = new AbortController();
    pollRef.current = controller;
    let vigente = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retraso = 2000;
    const esVigente = () => vigente && !controller.signal.aborted && (!session || ((session.snapshot().user?.id ?? null) === owner && session.getSessionVersion() === version));
    const actualizar = (cambio: Partial<Snapshot>) => {
      if (esVigente()) setSnapshot((prev) => prev.scope === scope && prev.operacionId === operationId ? { ...prev, ...cambio } : prev);
    };
    const consultar = async () => {
      try {
        const result = tipo === "categoria"
          ? await categoryService.consultarEstadoOperacion(operationId, controller.signal)
          : await brandService.consultarResultadoBaja(operationId, controller.signal);
        if (!esVigente()) return;
        const valor = "estado" in result ? result.estado : result.resultado;
        if (valor === "confirmada" || valor === "exito" || valor === "rechazada") {
          actualizar({ estado: valor === "rechazada" ? "rechazada" : "confirmada", mensaje: result.mensaje });
          const referencia = keyRef.current;
          if (referencia?.scope === scope && esVigente()) {
            try { sessionStorage.removeItem(referencia.key); } catch { /* no ocultar una decisión terminal */ }
          }
          return;
        }
        if (valor !== "pendiente") { actualizar({ estado: "error", mensaje: result.mensaje }); return; }
        actualizar({ mensaje: result.mensaje });
        timer = setTimeout(consultar, retraso);
        retraso = Math.min(retraso * 2, 30000);
      } catch (error) {
        actualizar({ estado: "error", mensaje: error instanceof Error ? error.message : "No se pudo consultar la operación." });
      }
    };
    void consultar();
    return () => { vigente = false; controller.abort(); clearTimeout(timer); if (pollRef.current === controller) pollRef.current = null; };
  }, [actual.operacionId, actual.estado, scope, session, owner, version, tipo, intento]);

  const reintentar = () => {
    if (actual.operacionId) { setSnapshot({ ...actual, estado: "pendiente" }); setIntento((value) => value + 1); }
  };
  return { estado: actual.estado, operacionId: actual.operacionId, mensaje: actual.mensaje, registrar, reintentar };
}
