import { afterEach, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useInventoryDashboard } from "./useInventoryDashboard";
import { resetInventoryRepository } from "../services/inventoryProvider";
import { deferred } from "../../../../tests/fixtures/h4Controlled";
import { createHttpInventoryRepository, type InventoryHttpRequest } from "../adapters/apiInventoryAdapter";
import { act } from "@testing-library/react";
import { useProductStateMutation } from "../../catalog/hooks/useProductStateMutation";
import { CatalogError } from "../../catalog/services/catalogRepository";
import { CatalogServicesContext } from "../../catalog/services/CatalogServicesContext";
import { PromotionSessionContext } from "../../../app/config/PromotionSessionContext";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { createElement, type ReactNode } from "react";

afterEach(() => {
  cleanup();
  resetInventoryRepository();
  vi.restoreAllMocks();
});

it("CAT-H4-04: una mutación incierta de A queda aislada cuando la sesión cambia a B", async () => {
  let owner = "g7-catalog-owner-a";
  const session = { snapshot: () => ({ user: { id: owner, nombreCompleto: "Test", correo: "test@example.test", roles: [] }, mfa: false, busy: false, notice: "" }) };
  let rejectMutation!: (error: Error) => void;
  const mutation = new Promise<never>((_resolve, reject) => { rejectMutation = reject; });
  const activate = vi.fn(() => mutation);
  const services = { catalog: { activate } };
  const wrapper = ({ children }: { children: ReactNode }) => createElement(
    DataModeContext.Provider,
    { value: "api" },
    createElement(CatalogServicesContext.Provider, { value: services as never },
      createElement(PromotionSessionContext.Provider, { value: session as never }, children)),
  );
  const hook = renderHook(() => useProductStateMutation(), { wrapper });
  let result: Promise<unknown> | undefined;
  act(() => { result = hook.result.current.activate("product-h4-a"); });
  expect(activate).toHaveBeenCalledTimes(1);
  owner = "g7-catalog-owner-b";
  hook.rerender();
  await act(async () => { rejectMutation(new CatalogError("write_unknown", "resultado incierto")); await result; });
  await expect(result).resolves.toBeNull();
  expect(hook.result.current.error).toBeUndefined();
  expect(hook.result.current.isUnknown("product-h4-a")).toBe(false);
  owner = "g7-catalog-owner-a";
  hook.rerender();
  expect(hook.result.current.isUnknown("product-h4-a")).toBe(true);
  expect(activate).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("g6:catalog:uncertain:product:g7-catalog-owner-a:product-h4-a")).toBe("1");
});

it("INV-H4-04: desmontar un consumidor no cancela el GET compartido del otro", async () => {
  const pending = deferred<Response>();
  const request = vi.fn(async (path: string, init: InventoryHttpRequest) => { void path; void init; return pending.promise; });
  const repository = createHttpInventoryRepository({ transport: { request }, currentUserScope: () => "g7-inventory-owner-a" });
  resetInventoryRepository(repository);

  const first = renderHook(() => useInventoryDashboard({}));
  const second = renderHook(() => useInventoryDashboard({}));
  expect(request).toHaveBeenCalledTimes(1);
  first.unmount();
  pending.resolve(new Response(JSON.stringify({ generatedAt: "2026-10-20T00:00:00.000Z", totalSkus: 12, totalOnHand: 150, totalReserved: 20, totalAvailable: 125, skusDisponibles: 9, skusStockBajo: 2, skusAgotados: 1, porUbicacion: [] }), { status: 200, headers: { "content-type": "application/json" } }));
  await waitFor(() => expect(second.result.current.loading).toBe(false));
  expect(second.result.current.kpis?.availableUnits).toBe(125);
  expect(request).toHaveBeenCalledTimes(1);
  second.unmount();
});
