// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { usePricingRead } from "../pricing/hooks/usePricingRequest";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("PRI-01 mantiene una lectura única aunque el callback se recree al renderizar", async () => {
  const read = vi.fn(async (signal: AbortSignal) => { signal.throwIfAborted(); return "precio confirmado"; });
  const hook = renderHook(() => usePricingRead("stable-test", signal => read(signal)));
  await waitFor(() => expect(hook.result.current.state).toEqual({ status: "success", result: "precio confirmado" }));
  hook.rerender();
  expect(read).toHaveBeenCalledTimes(1);
});

it("PRI-02 ignora la respuesta tardía del SKU/canal anterior y cancela al salir", async () => {
  let resolveOld: (value: string) => void = () => undefined;
  const old = new Promise<string>(resolve => { resolveOld = resolve; });
  const signals: AbortSignal[] = [];
  const hook = renderHook(({ key }) => usePricingRead(key, signal => {
    signals.push(signal);
    return key === "old-sku-global" ? old : Promise.resolve("nuevo marketplace");
  }), { initialProps: { key: "old-sku-global" } });
  await waitFor(() => expect(signals).toHaveLength(1));
  hook.rerender({ key: "new-sku-marketplace" });
  await waitFor(() => expect(hook.result.current.state).toEqual({ status: "success", result: "nuevo marketplace" }));
  expect(signals[0]!.aborted).toBe(true);
  resolveOld("precio viejo");
  await Promise.resolve();
  expect(hook.result.current.state).toEqual({ status: "success", result: "nuevo marketplace" });
  hook.unmount();
  expect(signals[1]!.aborted).toBe(true);
});

it("PRI-04 concluye en error recuperable aunque el proveedor ignore la cancelación", async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  const read = vi.fn(() => new Promise<string>(() => undefined));
  const hook = renderHook(() => usePricingRead("timeout-test", read));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  deadline.abort();
  await waitFor(() => expect(hook.result.current.state.status).toBe("error"));
  expect(hook.result.current.state).toMatchObject({ message: expect.stringContaining("Vuelve a consultar") });
});
