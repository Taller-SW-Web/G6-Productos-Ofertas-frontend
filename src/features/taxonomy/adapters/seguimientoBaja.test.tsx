// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AuthSessionContext } from "../../../app/config/AuthSessionContext";
import type { G7Session, SessionView } from "../../promotions/adapters/g7Session";

const mocks = vi.hoisted(() => ({ consultar: vi.fn(), owner: { id: "usuario-a" } }));
vi.mock("../services/categoryService", () => ({ categoryService: { consultarEstadoOperacion: mocks.consultar } }));
vi.mock("../services/brandService", () => ({ brandService: { consultarResultadoBaja: mocks.consultar } }));
vi.mock("../services/taxonomyGatewayRuntime", () => ({ getTaxonomyGateway: () => ({ scopeId: () => mocks.owner.id }) }));
import { retrasoConJitter, useSeguimientoBaja } from "../hooks/useSeguimientoBaja";

beforeEach(() => {
  sessionStorage.clear();
  mocks.consultar.mockReset();
  mocks.owner.id = "usuario-a";
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("seguimiento de baja", () => {
  it.each(["operacionId", "entityId", "entityType"] as const)("rechaza %s diferente y conserva la referencia", async (campo) => {
    const respuesta = { operacionId: "op-1", entityId: "cat-1", entityType: "CATEGORY", estado: "confirmada", mensaje: "Confirmada" };
    mocks.consultar.mockResolvedValue({ ...respuesta, [campo]: "distinto" });
    const hook = renderHook(() => useSeguimientoBaja("categoria", "cat-1"));
    await waitFor(() => expect(hook.result.current.estado).toBe("idle"));
    act(() => hook.result.current.registrar("op-1"));
    await waitFor(() => expect(hook.result.current.estado).toBe("error"));
    expect(hook.result.current.mensaje).toMatch(/inválida/);
    expect(hook.result.current.operacionId).toBe("op-1");
    expect(sessionStorage.length).toBe(1);
  });
  it("aplica jitter a intervalos crecientes con tope de 30 segundos", () => {
    expect([2000, 4000, 8000, 16000, 30000].map((delay) => retrasoConJitter(delay, 0.5))).toEqual([1500, 3000, 6000, 12000, 22500]);
    expect(retrasoConJitter(30000, 0)).toBe(15000);
    expect(retrasoConJitter(30000, 1)).toBe(30000);
  });

  it("programa intervalos exponenciales con jitter y no programa tras el terminal", async () => {
    const base = { operacionId: "op-1", entityId: "cat-1", entityType: "CATEGORY", mensaje: "En curso" };
    for (let i = 0; i < 5; i++) mocks.consultar.mockResolvedValueOnce({ ...base, estado: "pendiente" });
    mocks.consultar.mockResolvedValueOnce({ ...base, estado: "confirmada" });
    const hook = renderHook(() => useSeguimientoBaja("categoria", "cat-1"));
    await waitFor(() => expect(hook.result.current.estado).toBe("idle"));
    const original = globalThis.setTimeout;
    const intervalos: number[] = [];
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.spyOn(globalThis, "setTimeout").mockImplementation((handler, delay, ...args) => {
      if (typeof delay === "number" && delay >= 1500) { intervalos.push(delay); return original(handler, 1, ...args); }
      return original(handler, delay, ...args);
    });
    act(() => hook.result.current.registrar("op-1"));
    await waitFor(() => expect(hook.result.current.estado).toBe("confirmada"));
    expect(intervalos).toEqual([1500, 3000, 6000, 12000, 22500]);
    expect(mocks.consultar).toHaveBeenCalledTimes(6);
  });

  it.each(["confirmada", "rechazada"] as const)("recupera tras recarga y detiene el seguimiento en %s", async (terminal) => {
    mocks.consultar.mockResolvedValueOnce({ operacionId: "op-1", entityId: "cat-1", entityType: "CATEGORY", estado: "pendiente", mensaje: "En curso" });
    const first = renderHook(() => useSeguimientoBaja("categoria", "cat-1"));
    await waitFor(() => expect(first.result.current.estado).toBe("idle"));
    act(() => first.result.current.registrar("op-1"));
    await waitFor(() => expect(mocks.consultar).toHaveBeenCalledTimes(1));
    expect(sessionStorage.length).toBe(1);
    first.unmount();
    mocks.consultar.mockResolvedValueOnce({ operacionId: "op-1", entityId: "cat-1", entityType: "CATEGORY", estado: terminal, mensaje: "Terminal" });
    const second = renderHook(() => useSeguimientoBaja("categoria", "cat-1"));
    await waitFor(() => expect(second.result.current.estado).toBe(terminal));
    expect(second.result.current.mensaje).toBe("Terminal");
    expect(sessionStorage.length).toBe(0);
    expect(mocks.consultar).toHaveBeenCalledTimes(2);
  });

  it("no recupera la referencia guardada por otra identidad", async () => {
    mocks.consultar.mockResolvedValue({ operacionId: "op-1", entityId: "marca-1", entityType: "BRAND", resultado: "pendiente", mensaje: "En curso" });
    const first = renderHook(() => useSeguimientoBaja("marca", "marca-1"));
    await waitFor(() => expect(first.result.current.estado).toBe("idle"));
    act(() => first.result.current.registrar("op-1"));
    await waitFor(() => expect(mocks.consultar).toHaveBeenCalledTimes(1));
    first.unmount();
    mocks.owner.id = "usuario-b";
    const second = renderHook(() => useSeguimientoBaja("marca", "marca-1"));
    await waitFor(() => expect(second.result.current.estado).toBe("idle"));
    expect(second.result.current.operacionId).toBeNull();
    expect(mocks.consultar).toHaveBeenCalledTimes(1);
  });

  it("conserva la referencia al fallar la consulta y permite reintentar", async () => {
    mocks.consultar.mockRejectedValueOnce(new Error("HTTP 503")).mockResolvedValueOnce({ operacionId: "op-1", entityId: "marca-1", entityType: "BRAND", resultado: "exito", mensaje: "Confirmada" });
    const hook = renderHook(() => useSeguimientoBaja("marca", "marca-1"));
    await waitFor(() => expect(hook.result.current.estado).toBe("idle"));
    act(() => hook.result.current.registrar("op-1"));
    await waitFor(() => expect(hook.result.current.estado).toBe("error"));
    expect(hook.result.current.mensaje).toBe("HTTP 503");
    expect(sessionStorage.length).toBe(1);
    act(() => hook.result.current.reintentar());
    await waitFor(() => expect(hook.result.current.estado).toBe("confirmada"));
  });

  it("vuelve a consultar tras el intervalo y se detiene al completar", async () => {
    mocks.consultar.mockResolvedValueOnce({ operacionId: "op-1", entityId: "cat-1", entityType: "CATEGORY", estado: "pendiente", mensaje: "En curso" }).mockResolvedValueOnce({ operacionId: "op-1", entityId: "cat-1", entityType: "CATEGORY", estado: "confirmada", mensaje: "Finalizada" });
    const hook = renderHook(() => useSeguimientoBaja("categoria", "cat-1"));
    await waitFor(() => expect(hook.result.current.estado).toBe("idle"));
    act(() => hook.result.current.registrar("op-1"));
    await waitFor(() => expect(mocks.consultar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hook.result.current.estado).toBe("confirmada"), { timeout: 3500 });
    expect(mocks.consultar).toHaveBeenCalledTimes(2);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect(mocks.consultar).toHaveBeenCalledTimes(2);
  });

  it.each(["getItem", "setItem", "removeItem"] as const)("tolera SecurityError de %s y reconoce el terminal", async (metodo) => {
    vi.spyOn(Storage.prototype, metodo).mockImplementation(() => { throw new DOMException("bloqueado", "SecurityError"); });
    mocks.consultar.mockResolvedValue({ operacionId: "op-1", entityId: "cat-1", entityType: "CATEGORY", estado: "confirmada", mensaje: "Finalizada" });
    const hook = renderHook(() => useSeguimientoBaja("categoria", "cat-1"));
    await waitFor(() => expect(hook.result.current.estado).toBe("idle"));
    act(() => hook.result.current.registrar("op-1"));
    await waitFor(() => expect(hook.result.current.estado).toBe("confirmada"));
    expect(hook.result.current.operacionId).toBe("op-1");
    expect(hook.result.current.mensaje).toBe("Finalizada");
  });

  it.each(["usuario", "categoria"] as const)("descarta respuestas tardías al cambiar %s sin desmontar", async (cambio) => {
    let view: SessionView = { user: { id: "usuario-a", nombreCompleto: "A", correo: "a@example.test", roles: [] }, mfa: false, busy: false, notice: "", expiresAt: null };
    const listeners = new Set<() => void>();
    const session = { snapshot: () => view, getSessionVersion: () => 0, subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); } } as unknown as G7Session;
    const wrapper = ({ children }: { children: ReactNode }) => <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>;
    let resolver!: (value: { estado: string; mensaje: string }) => void;
    let signalAnterior: AbortSignal | undefined;
    mocks.consultar.mockImplementationOnce((_id: string, signal: AbortSignal) => { signalAnterior = signal; return new Promise((resolve) => { resolver = resolve; }); });
    mocks.consultar.mockResolvedValue({ operacionId: "op-b", entityId: cambio === "usuario" ? "cat-a" : "cat-b", entityType: "CATEGORY", estado: "pendiente", mensaje: "B pendiente" });
    const hook = renderHook(({ id }) => useSeguimientoBaja("categoria", id), { initialProps: { id: "cat-a" }, wrapper });
    await waitFor(() => expect(hook.result.current.estado).toBe("idle"));
    act(() => hook.result.current.registrar("op-a"));
    await waitFor(() => expect(signalAnterior).toBeDefined());
    if (cambio === "usuario") {
      act(() => { mocks.owner.id = "usuario-b"; view = { ...view, user: { ...view.user!, id: "usuario-b" } }; listeners.forEach((notify) => notify()); });
    } else hook.rerender({ id: "cat-b" });
    await waitFor(() => expect(hook.result.current.estado).toBe("idle"));
    expect(signalAnterior?.aborted).toBe(true);
    act(() => hook.result.current.registrar("op-b"));
    await waitFor(() => expect(hook.result.current.mensaje).toBe("B pendiente"));
    await act(async () => { resolver({ estado: "confirmada", mensaje: "A tardía" }); await Promise.resolve(); });
    expect(hook.result.current.operacionId).toBe("op-b");
    expect(hook.result.current.mensaje).toBe("B pendiente");
    expect(sessionStorage.length).toBe(2);
  });
});
