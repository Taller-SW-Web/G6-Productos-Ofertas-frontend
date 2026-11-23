import { afterEach, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useInventoryDashboard } from "./useInventoryDashboard";
import { resetInventoryRepository } from "../services/inventoryProvider";
import { deferred } from "../../../../tests/fixtures/h4Controlled";
import { createHttpInventoryRepository } from "../adapters/apiInventoryAdapter";
import { act } from "@testing-library/react";
import { useProductStateMutation } from "../../catalog/hooks/useProductStateMutation";
import { CatalogError } from "../../catalog/services/catalogRepository";
import { CatalogServicesContext } from "../../catalog/services/CatalogServicesContext";
import { PromotionSessionContext } from "../../../app/config/PromotionSessionContext";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { createElement, type ReactNode } from "react";

const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");

afterEach(() => {
  cleanup();
  resetInventoryRepository();
  vi.restoreAllMocks();
  if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
  else Reflect.deleteProperty(navigator, "locks");
});

it("CAT-H4-04: una mutación incierta de A queda aislada cuando la sesión cambia a B", async () => {
  localStorage.clear();
  const lockManager = {
    request: async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<unknown>) => callback({ name: "catalog-test-lock", mode: "exclusive" } as Lock),
  } as unknown as LockManager;
  Object.defineProperty(navigator, "locks", { configurable: true, value: lockManager });
  let owner = "g7-catalog-owner-a";
  const session = {
    getSessionVersion: () => 1,
    snapshot: () => ({ expiresAt: 2_000_000_000_000, user: { id: owner, nombreCompleto: "Test", correo: "test@example.test", roles: [] }, mfa: false, busy: false, notice: "" }),
  };
  let rejectMutation!: (error: Error) => void;
  const mutation = new Promise<never>((_resolve, reject) => { rejectMutation = reject; });
  const getById = vi.fn().mockResolvedValue({ id: "product-h4-a", status: "BORRADOR", catalogVersion: 4 });
  const activate = vi.fn(() => mutation);
  const services = { catalog: { getById, activate } };
  const wrapper = ({ children }: { children: ReactNode }) => createElement(
    DataModeContext.Provider,
    { value: "api" },
    createElement(CatalogServicesContext.Provider, { value: services as never },
      createElement(PromotionSessionContext.Provider, { value: session as never }, children)),
  );
  const hook = renderHook(() => useProductStateMutation(), { wrapper });
  let result: Promise<unknown> | undefined;
  await act(async () => {
    result = hook.result.current.activate("product-h4-a");
    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1));
  });
  expect(getById).toHaveBeenCalledTimes(1);
  owner = "g7-catalog-owner-b";
  hook.rerender();
  await act(async () => { rejectMutation(new CatalogError("write_unknown", "resultado incierto")); await result; });
  await expect(result).resolves.toBeNull();
  expect(hook.result.current.error).toBeUndefined();
  expect(hook.result.current.isUnknown("product-h4-a")).toBe(true);
  let reconciled: unknown;
  await act(async () => { reconciled = await hook.result.current.reconcile("product-h4-a", "ACTIVO"); });
  expect(reconciled).toBeNull();
  expect(getById).toHaveBeenCalledTimes(1);
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key?.startsWith("g6:catalog:state-intent:v2:")));
  const stored = keys.map(key => JSON.parse(localStorage.getItem(key) ?? "null") as { userId?: string; productId?: string; phase?: string } | null)
    .find(intent => intent?.userId === "g7-catalog-owner-a" && intent.productId === "product-h4-a");
  expect(stored).toMatchObject({ phase: "uncertain", userId: "g7-catalog-owner-a", productId: "product-h4-a" });
  owner = "g7-catalog-owner-a";
  hook.rerender();
  expect(hook.result.current.isUnknown("product-h4-a")).toBe(true);
  await act(async () => { await hook.result.current.activate("product-h4-a"); });
  expect(activate).toHaveBeenCalledTimes(1);
});
it("INV-H4-04: desmontar un consumidor no cancela el GET compartido del otro", async () => {
  const pending = deferred<Response>();
  const request = vi.fn(async (path: string) =>
    path === "/api/v1/inventario/dashboard" ? pending.promise :
      Response.json({ items: [], meta: { pagina: 1, tamanio: 100, total: 0, totalPaginas: 0 } }));
  const dashboardReads = () => request.mock.calls.filter(([path]) => path === "/api/v1/inventario/dashboard");
  const repository = createHttpInventoryRepository({ transport: { request }, currentUserScope: () => "g7-inventory-owner-a" });
  resetInventoryRepository(repository);

  const first = renderHook(() => useInventoryDashboard({}));
  const second = renderHook(() => useInventoryDashboard({}));
  expect(dashboardReads()).toHaveLength(1);
  first.unmount();
  pending.resolve(new Response(JSON.stringify({ generatedAt: "2026-10-20T00:00:00.000Z", totalSkus: 12, totalOnHand: 150, totalReserved: 20, totalAvailable: 125, skusDisponibles: 9, skusStockBajo: 2, skusAgotados: 1, porUbicacion: [] }), { status: 200, headers: { "content-type": "application/json" } }));
  await waitFor(() => expect(second.result.current.loading).toBe(false));
  expect(second.result.current.kpis?.availableUnits).toBe(125);
  expect(dashboardReads()).toHaveLength(1);
  second.unmount();
});
