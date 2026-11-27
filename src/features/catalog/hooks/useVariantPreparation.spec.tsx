// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthSessionContext } from "../../../app/config/AuthSessionContext";
import { DataModeContext } from "../../../app/config/DataModeContext";
import type { G7Session } from "../../promotions/adapters/g7Session";
import { CatalogServicesContext } from "../services/CatalogServicesContext";
import type { CatalogRepository, ProductDetailView, VariantDetailView } from "../services/catalogRepository";
import type { CatalogServices } from "../services/catalogServices";
import { useVariantPreparation } from "./useVariantPreparation";

const productId = "11111111-1111-4111-8111-111111111111";
const variantId = "22222222-2222-4222-8222-222222222222";

it("CAT-F03 variantes: los ciclos posteriores consultan solo preparación", async () => {
  const prod = { id: productId, hasVariants: true } as unknown as ProductDetailView;
  const variant = { productId, variantId, sku: "SKU-1", status: "BORRADOR", catalogVersion: null } as unknown as VariantDetailView;
  const getById = vi.fn().mockResolvedValue(prod);
  const getVariantById = vi.fn().mockResolvedValue(variant);
  const getPreparation = vi.fn()
    .mockResolvedValueOnce({ productId, hasVariants: true, pricing: { status: "COMPLETED" }, inventario: null, variantes: [{ variantId, sku: "SKU-1", inventario: { status: "PENDING", manualRetryAllowed: false } }] })
    .mockResolvedValueOnce({ productId, hasVariants: true, pricing: { status: "COMPLETED" }, inventario: null, variantes: [{ variantId, sku: "SKU-1", inventario: { status: "COMPLETED", manualRetryAllowed: false } }] });
  const catalog = { getById, getVariantById, getPreparation } as unknown as CatalogRepository;
  const view = { user: { id: "user-a", roles: ["GESTOR_COMERCIAL"] }, expiresAt: 2_000_000_000_000 };
  const session = {
    snapshot: () => view,
    getSessionVersion: () => 1,
  } as unknown as G7Session;
  const services = { catalog, taxonomy: {} } as CatalogServices;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthSessionContext.Provider value={session}>
      <DataModeContext.Provider value="api">
        <CatalogServicesContext.Provider value={services}>{children}</CatalogServicesContext.Provider>
      </DataModeContext.Provider>
    </AuthSessionContext.Provider>
  );
  const hook = renderHook(() => useVariantPreparation(productId, variantId), { wrapper });
  await waitFor(() => expect(getPreparation).toHaveBeenCalledTimes(2), { timeout: 6000 });
  expect(getById).toHaveBeenCalledOnce();
  expect(getVariantById).toHaveBeenCalledOnce();
  hook.unmount();
  cleanup();
});
