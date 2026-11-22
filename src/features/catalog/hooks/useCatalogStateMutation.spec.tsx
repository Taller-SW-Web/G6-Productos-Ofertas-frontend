import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthSessionContext } from "../../../app/config/AuthSessionContext";
import { DataModeContext } from "../../../app/config/DataModeContext";
import type { G7Session } from "../../promotions/adapters/g7Session";
import { CatalogServicesContext } from "../services/CatalogServicesContext";
import type { CatalogRepository, ProductDetailView, VariantDetailView } from "../services/catalogRepository";
import type { CatalogServices } from "../services/catalogServices";
import { CatalogError } from "../services/catalogRepository";
import { useProductStateMutation } from "./useProductStateMutation";
import { useVariantStateMutation } from "./useVariantStateMutation";

const productId = "11111111-1111-4111-8111-111111111111";
const variantId = "22222222-2222-4222-8222-222222222222";
const product = (status: ProductDetailView["status"], catalogVersion: number) => ({ id: productId, status, catalogVersion }) as ProductDetailView;
const variant = (status: VariantDetailView["status"], catalogVersion: number) => ({ productId, variantId, status, catalogVersion }) as VariantDetailView;

function mount(catalog: Partial<CatalogRepository>, currentUser = { id: "user-a", nombreCompleto: "Gestora", correo: "qa@example.invalid", roles: ["GESTOR_COMERCIAL"] }) {
  let sessionVersion = 1;
  let sessionExpiresAt = 2_000_000_000_000;
  const session = {
    snapshot: () => ({ expiresAt: sessionExpiresAt, user: currentUser, mfa: false, busy: false, notice: "" }),
    getSessionVersion: () => sessionVersion,
  } as unknown as G7Session;
  const services = { catalog: catalog as CatalogRepository, taxonomy: {} } as CatalogServices;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthSessionContext.Provider value={session}>
      <DataModeContext.Provider value="api">
        <CatalogServicesContext.Provider value={services}>{children}</CatalogServicesContext.Provider>
      </DataModeContext.Provider>
    </AuthSessionContext.Provider>
  );
  return { ...renderHook(() => ({ product: useProductStateMutation(), variant: useVariantStateMutation() }), { wrapper }), changeSession: (userId: string) => { currentUser = { ...currentUser!, id: userId }; sessionVersion++; }, renewSession: () => { sessionExpiresAt += 60_000; sessionVersion++; } };
}

function intent() {
  const key = Object.keys(localStorage).find(value => value.startsWith("g6:catalog:state-intent:v2"));
  return key ? JSON.parse(localStorage.getItem(key)!) as Record<string, unknown> : null;
}

const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
let heldLocks = new Set<string>();

beforeEach(() => {
  heldLocks = new Set();
  const manager = {
    request: async (name: string, _options: { ifAvailable?: boolean }, callback: (lock: Lock | null) => Promise<unknown>) => {
      if (heldLocks.has(name)) return callback(null);
      heldLocks.add(name);
      try { return await callback({ name, mode: "exclusive" } as Lock); }
      finally { heldLocks.delete(name); }
    },
  } as unknown as LockManager;
  Object.defineProperty(navigator, "locks", { configurable: true, value: manager });
});

afterEach(() => {
  cleanup(); localStorage.clear(); vi.restoreAllMocks();
  if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
  else Reflect.deleteProperty(navigator, "locks");
});

it("CAT-F05 producto: persiste acción/estado/version e impide reenvío ante resultado incierto", async () => {
  const getById = vi.fn().mockResolvedValue(product("BORRADOR", 7));
  const activate = vi.fn().mockRejectedValue(new CatalogError("write_unknown", "timeout", { correlationId: "corr-1" }));
  const hook = mount({ getById, activate });
  await act(async () => { await hook.result.current.product.activate(productId); });
  expect(intent()).toMatchObject({ userId: "user-a", productId, action: "activate", priorStatus: "BORRADOR", expectedStatus: "ACTIVO", priorVersion: 7, correlationId: "corr-1", phase: "uncertain" });
  await act(async () => { await hook.result.current.product.activate(productId); });
  expect(getById).toHaveBeenCalledOnce();
  expect(activate).toHaveBeenCalledOnce();
  getById.mockResolvedValue(product("ACTIVO", 8));
  let reconciliation: unknown;
  await act(async () => { reconciliation = await hook.result.current.product.reconcile(productId, "ACTIVO"); });
  expect(reconciliation).toBeNull();
  expect(intent()).toMatchObject({ phase: "uncertain" });
});

it("CAT-F05 producto: una respuesta 2xx reconocida se conserva y sólo se libera con lectura admin y versión posterior", async () => {
  const getById = vi.fn().mockResolvedValueOnce(product("BORRADOR", 3)).mockResolvedValueOnce(product("ACTIVO", 4));
  const activate = vi.fn().mockRejectedValue(new CatalogError("write_acknowledged", "detail GET failed", { operationId: "op-1", correlationId: "corr-2" }));
  const hook = mount({ getById, activate });
  await act(async () => { await hook.result.current.product.activate(productId); });
  expect(intent()).toMatchObject({ phase: "acknowledged", operationId: "op-1", correlationId: "corr-2", priorVersion: 3 });
  hook.renewSession();
  let reconciled: unknown;
  await act(async () => { reconciled = await hook.result.current.product.reconcile(productId, "ACTIVO"); });
  expect(reconciled).toMatchObject({ id: productId, status: "ACTIVO", catalogVersion: 4 });
  expect(intent()).toBeNull();
  expect(activate).toHaveBeenCalledWith(productId, { catalogVersion: 3 }, undefined);
});

it("CAT-F05 producto: cambio de identidad después de GET administrativo cancela el envío", async () => {
  let release!: (value: ProductDetailView) => void;
  const getById = vi.fn(() => new Promise<ProductDetailView>(resolve => { release = resolve; }));
  const activate = vi.fn();
  const hook = mount({ getById, activate });
  let write: Promise<unknown>;
  await act(async () => { write = hook.result.current.product.activate(productId); });
  hook.changeSession("user-b");
  await act(async () => { release(product("BORRADOR", 5)); await write!; });
  expect(activate).not.toHaveBeenCalled();
  expect(intent()).toBeNull();
});

it("CAT-F05 variante: conserva intención incierta por identidad/variante y no inventa body", async () => {
  const getVariantById = vi.fn().mockResolvedValue(variant("BORRADOR", 2));
  const activateVariant = vi.fn().mockRejectedValue(new CatalogError("write_unknown", "timeout", { correlationId: "variant-corr" }));
  const hook = mount({ getVariantById, activateVariant });
  await act(async () => { await expect(hook.result.current.variant.activate(productId, variantId)).rejects.toMatchObject({ kind: "write_unknown" }); });
  expect(intent()).toMatchObject({ entity: "variant", userId: "user-a", productId, variantId, action: "activate", priorVersion: 2, expectedStatus: "ACTIVA", phase: "uncertain", correlationId: "variant-corr" });
  expect(activateVariant).toHaveBeenCalledWith(productId, variantId, undefined);
  await act(async () => { await expect(hook.result.current.variant.activate(productId, variantId)).rejects.toMatchObject({ kind: "write_unknown" }); });
  expect(activateVariant).toHaveBeenCalledOnce();
});

it("CAT-F05 doble submit: sólo una lectura precondición y una mutación quedan en vuelo", async () => {
  let release!: (value: ProductDetailView) => void;
  const getById = vi.fn(() => new Promise<ProductDetailView>(resolve => { release = resolve; }));
  const activate = vi.fn().mockResolvedValue(product("ACTIVO", 2));
  const hook = mount({ getById, activate });
  let first!: Promise<unknown>;
  await act(async () => { first = hook.result.current.product.activate(productId); });
  await act(async () => { await hook.result.current.product.activate(productId); });
  release(product("BORRADOR", 1));
  await act(async () => { await first; });
  expect(getById).toHaveBeenCalledOnce();
  expect(activate).toHaveBeenCalledOnce();
});

it("CAT-F05 exclusión atómica: Web Locks bloquea la segunda pestaña antes del GET o POST", async () => {
  let releaseFirst!: (value: ProductDetailView) => void;
  const firstRead = vi.fn(() => new Promise<ProductDetailView>(resolve => { releaseFirst = resolve; }));
  const secondRead = vi.fn().mockResolvedValue(product("BORRADOR", 1));
  const firstWrite = vi.fn().mockRejectedValue(new CatalogError("write_unknown", "timeout", { correlationId: "tab-a" }));
  const secondWrite = vi.fn().mockResolvedValue(product("ACTIVO", 2));
  const tabA = mount({ getById: firstRead, activate: firstWrite });
  const tabB = mount({ getById: secondRead, activate: secondWrite });
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  await act(async () => { first = tabA.result.current.product.activate(productId); second = tabB.result.current.product.activate(productId); });
  await act(async () => { await second; });
  releaseFirst(product("BORRADOR", 1));
  await act(async () => { await first; });
  expect(firstWrite).toHaveBeenCalledOnce();
  expect(secondWrite).not.toHaveBeenCalled();
  expect(firstRead).toHaveBeenCalledOnce();
  expect(secondRead).not.toHaveBeenCalled();
  expect(tabB.result.current.product.error).toContain("Ya hay una operación de Catálogo en curso");
  expect(localStorage.length).toBe(1);
  tabA.unmount();
  tabB.unmount();
});

it("CAT-F05: bloquea mutaciones API si Web Locks no está disponible", async () => {
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  const getById = vi.fn().mockResolvedValue(product("BORRADOR", 1));
  const activate = vi.fn();
  const hook = mount({ getById, activate });
  await act(async () => { await hook.result.current.product.activate(productId); });
  expect(getById).not.toHaveBeenCalled();
  expect(activate).not.toHaveBeenCalled();
  expect(hook.result.current.product.error).toContain("no se envió la mutación");
});

it("CAT-F05 recarga/cambio de sesión: la nueva identidad no reenvía ni reconcilia la intención ajena", async () => {
  const first = mount({
    getById: vi.fn().mockResolvedValue(product("BORRADOR", 8)),
    activate: vi.fn().mockRejectedValue(new CatalogError("write_unknown", "timeout", { correlationId: "reload-corr" })),
  });
  await act(async () => { await first.result.current.product.activate(productId); });
  first.unmount();

  const reloadRead = vi.fn().mockResolvedValue(product("ACTIVO", 9));
  const reloadWrite = vi.fn();
  const reloaded = mount({ getById: reloadRead, activate: reloadWrite });
  await act(async () => { await reloaded.result.current.product.activate(productId); });
  expect(reloadWrite).not.toHaveBeenCalled();
  expect(reloadRead).not.toHaveBeenCalled();
  expect(reloaded.result.current.product.isUnknown(productId)).toBe(true);
  reloaded.unmount();

  const getById = vi.fn().mockResolvedValue(product("ACTIVO", 9));
  const activate = vi.fn();
  const second = mount({ getById, activate }, { id: "user-b", nombreCompleto: "Otra persona", correo: "other@example.invalid", roles: ["GESTOR_COMERCIAL"] });
  await act(async () => { await second.result.current.product.activate(productId); });
  expect(activate).not.toHaveBeenCalled();
  expect(getById).not.toHaveBeenCalled();
  expect(second.result.current.product.isUnknown(productId)).toBe(true);
  let reconciled: unknown;
  await act(async () => { reconciled = await second.result.current.product.reconcile(productId, "ACTIVO"); });
  expect(reconciled).toBeNull();
  expect(getById).not.toHaveBeenCalled();
  expect(intent()).toMatchObject({ userId: "user-a", phase: "uncertain", correlationId: "reload-corr" });
});
