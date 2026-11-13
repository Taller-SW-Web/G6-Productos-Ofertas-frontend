// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTaxonomyOperationPolling } from "../hooks/useTaxonomyOperationPolling";
import type { TaxonomyGatewayTransport } from "./httpProductTypeAdapter";

afterEach(() => vi.useRealTimers());
describe("seguimiento automático", () => {
  it.each(["COMPLETED", "REJECTED"] as const)("observa admisión y %s con valores nulos", async terminal => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({operation_id:"op",status:"PENDING_DEACTIVATION",result:null,code:null})).mockResolvedValueOnce(Response.json({operation_id:"op",status:terminal,result:null,code:null}));
    const transport = {request} as TaxonomyGatewayTransport;
    const {result} = renderHook(() => useTaxonomyOperationPolling(transport,"op",500,5000));
    await waitFor(() => expect(result.current.status).toBe("pending"));
    await waitFor(() => expect(result.current.status).toBe(terminal === "COMPLETED" ? "completed" : "rejected"), {timeout:2000});
  });
  it("cancela la petición al desmontar", async () => {
    let signal: AbortSignal | undefined;
    const request = vi.fn((_path, current: AbortSignal) => {signal = current; return new Promise<Response>(() => {});});
    const {unmount} = renderHook(() => useTaxonomyOperationPolling({request},"op"));
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    expect(signal?.aborted).toBe(true);
  });
  it("marca sin confirmación al superar el plazo", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockImplementation(() => new Promise<Response>(() => {}));
    const {result} = renderHook(() => useTaxonomyOperationPolling({request},"op",500,1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.status).toBe("unconfirmed");
  });
});
