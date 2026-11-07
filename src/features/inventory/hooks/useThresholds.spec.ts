import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useThresholds } from "./useThresholds";
import { InventoryError } from "../services/inventoryErrors";
import { notifyInventoryChanged } from "../services/inventoryEvents";
import { resetInventoryRepository } from "../services/inventoryProvider";
import type { InventoryRepository } from "../services/inventoryRepository";
import type { ThresholdConfig } from "../services/inventoryTypes";
import { createMemoryStorage } from "../../../../tests/fixtures/h4Controlled";

function createMockRepository(
  overrides: Partial<InventoryRepository> = {},
): InventoryRepository {
  return {
    getStockItems: vi.fn(),
    getStockDetail: vi.fn(),
    getThresholds: vi.fn(),
    updateGlobalThreshold: vi.fn(),
    updateSkuThreshold: vi.fn(),
    getTransfers: vi.fn(),
    receiveTransfer: vi.fn(),
    getDashboardKpis: vi.fn(),
    getDashboardAlerts: vi.fn(),
    getLocationDistribution: vi.fn(),
    getCategories: vi.fn(),
    getBrands: vi.fn(),
    getLocations: vi.fn(),
    ...overrides,
  };
}

function config(
  globalThreshold: number,
  skuOverrides: Record<string, number> = {},
): ThresholdConfig {
  return { globalThreshold, skuOverrides };
}

afterEach(() => {
  cleanup();
  resetInventoryRepository();
  vi.unstubAllGlobals();
});

describe("useThresholds — flujo real del hook (P1-02)", () => {
  it("INV-H4-05: DELETE confirmado con GET auxiliar 503 conserva intención y no repite DELETE", async () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("sessionStorage", storage);
    const getThresholds = vi.fn().mockResolvedValueOnce(config(10, { "SKU-H4": 3 })).mockRejectedValueOnce(new Error("503 GET auxiliar"));
    const removeSkuThresholdOverride = vi.fn().mockResolvedValue(undefined);
    resetInventoryRepository(createMockRepository({ getThresholds, removeSkuThresholdOverride }));
    const { result } = renderHook(() => useThresholds());
    await waitFor(() => expect(result.current.thresholds?.skuOverrides["SKU-H4"]).toBe(3));
    await act(async () => { await result.current.removeSkuOverride("SKU-H4"); });
    expect(removeSkuThresholdOverride).toHaveBeenCalledOnce();
    expect(getThresholds).toHaveBeenCalledTimes(2);
    expect(storage.getItem("g6:inventory:threshold:session-unavailable:sku:SKU-H4")).not.toBeNull();
    expect(result.current.feedback?.title).toBe("Resultado no confirmado");
  });

  it("INV-H4-06: GET antiguo conserva marcador de umbral incierto y bloquea segunda escritura", async () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("sessionStorage", storage);
    const updateGlobalThreshold = vi.fn().mockRejectedValue(new InventoryError("RESULTADO_INCIERTO", "timeout después del despacho"));
    const getThresholds = vi.fn().mockResolvedValue(config(10));
    resetInventoryRepository(createMockRepository({ getThresholds, updateGlobalThreshold }));
    const { result } = renderHook(() => useThresholds());
    await waitFor(() => expect(result.current.thresholds?.globalThreshold).toBe(10));
    await act(async () => { await result.current.updateGlobal(12); });
    const intent = "g6:inventory:threshold:session-unavailable:global:";
    expect(storage.getItem(intent)).not.toBeNull();
    expect(updateGlobalThreshold).toHaveBeenCalledOnce();
    await act(async () => { await result.current.updateGlobal(13); });
    expect(updateGlobalThreshold).toHaveBeenCalledOnce();
    expect(storage.getItem(intent)).not.toBeNull();
    expect(getThresholds).toHaveBeenCalledTimes(2);
  });

  it("PUT 200 confirmado seguido del fallo del GET que dispara su propia notificación conserva la configuración y el éxito", async () => {
    const initial = config(10);
    const confirmed = config(20);
    const getThresholds = vi
      .fn()
      .mockResolvedValueOnce(initial)
      // Recarga derivada de notifyInventoryChanged() de la propia mutación.
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockResolvedValue(initial);
    const updateGlobalThreshold = vi.fn().mockResolvedValue(confirmed);

    resetInventoryRepository(
      createMockRepository({ getThresholds, updateGlobalThreshold }),
    );

    const { result } = renderHook(() => useThresholds());
    await waitFor(() =>
      expect(result.current.thresholds?.globalThreshold).toBe(10),
    );

    await act(async () => {
      await result.current.updateGlobal(20);
    });

    // La notificación provoca una segunda lectura que falla.
    await waitFor(() => expect(getThresholds).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.thresholds?.globalThreshold).toBe(20),
    );

    expect(result.current.error).toBeNull();
    expect(result.current.feedback).toEqual({
      semantic: "success",
      title: "Escritura confirmada",
      message: "Umbral global actualizado correctamente.",
    });
    expect(result.current.refreshWarning).toBe("503 Service Unavailable");
    expect(updateGlobalThreshold).toHaveBeenCalledTimes(1);
  });

  it("las recargas por cambios externos siguen actualizando la configuración", async () => {
    const initial = config(10);
    const external = config(15);
    const getThresholds = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(external);

    resetInventoryRepository(createMockRepository({ getThresholds }));

    const { result } = renderHook(() => useThresholds());
    await waitFor(() =>
      expect(result.current.thresholds?.globalThreshold).toBe(10),
    );

    await act(async () => {
      notifyInventoryChanged();
    });

    await waitFor(() =>
      expect(result.current.thresholds?.globalThreshold).toBe(15),
    );
    expect(result.current.error).toBeNull();
  });

  it("PUT incierto con lectura autoritativa coincidente se presenta como VERIFIED, sin atribuir la escritura", async () => {
    const initial = config(10);
    const authoritative = config(18);
    const getThresholds = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(authoritative)
      .mockResolvedValue(authoritative);
    const updateGlobalThreshold = vi
      .fn()
      .mockRejectedValue(
        new InventoryError("RESULTADO_INCIERTO", "Timeout de transporte."),
      );

    resetInventoryRepository(
      createMockRepository({ getThresholds, updateGlobalThreshold }),
    );

    const { result } = renderHook(() => useThresholds());
    await waitFor(() =>
      expect(result.current.thresholds?.globalThreshold).toBe(10),
    );

    await act(async () => {
      await result.current.updateGlobal(18);
    });

    expect(result.current.thresholds?.globalThreshold).toBe(18);
    expect(result.current.error).toBeNull();
    expect(result.current.feedback).toEqual({
      semantic: "warning",
      title: "Valor verificado, escritura no atribuida",
      message: "El valor deseado fue verificado en el servidor.",
    });
    expect(updateGlobalThreshold).toHaveBeenCalledTimes(1);
  });

  it("la recarga propio-disparada que aún no refleja el valor confirmado no revierte el resultado", async () => {
    const initial = config(10);
    const confirmed = config(20);
    const staleServer = config(10);
    const getThresholds = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(staleServer)
      .mockResolvedValue(staleServer);
    const updateGlobalThreshold = vi.fn().mockResolvedValue(confirmed);

    resetInventoryRepository(
      createMockRepository({ getThresholds, updateGlobalThreshold }),
    );

    const { result } = renderHook(() => useThresholds());
    await waitFor(() =>
      expect(result.current.thresholds?.globalThreshold).toBe(10),
    );

    await act(async () => {
      await result.current.updateGlobal(20);
    });

    await waitFor(() => expect(getThresholds).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.refreshWarning).not.toBeNull(),
    );
    expect(result.current.thresholds?.globalThreshold).toBe(20);
    expect(result.current.error).toBeNull();
    expect(result.current.feedback?.semantic).toBe("success");
  });
});
