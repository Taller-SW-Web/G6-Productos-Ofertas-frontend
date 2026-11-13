// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { CommercialModeGate } from "../../../app/config/CommercialModeGate";
import { DataModeContext } from "../../../app/config/DataModeContext";
import {
  configureInventoryApi,
  getInventoryRepository,
  resetInventoryRepository,
} from "../services/inventoryProvider";
import { createPricingRuntime } from "../../pricing/services/pricingService";
import { createCombosRuntime } from "../../combos/services/combosService";
import { createAuthenticatedInventoryTransport } from "./authenticatedInventoryTransport";
import { createHttpInventoryRepository } from "./apiInventoryAdapter";
import type { G7Session } from "../../promotions/adapters/g7Session";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
});

function renderWithGate(path: string, mode: "mock" | "api") {
  return render(
    <MantineProvider>
      <DataModeContext.Provider value={mode}>
        <MemoryRouter initialEntries={[path]}>
          <CommercialModeGate>
            <div data-testid="target-content">Contenido Permitido</div>
          </CommercialModeGate>
        </MemoryRouter>
      </DataModeContext.Provider>
    </MantineProvider>,
  );
}

describe("Composition Root & Regresiones de Inventario", () => {
  beforeEach(() => {
    (import.meta.env as Record<string, unknown>).VITE_DATA_MODE = "mock";
    resetInventoryRepository();
    configureInventoryApi(null);
  });

  describe("1. Regresión crítica en modo Mock (Combos e Inventario)", () => {
    it("Combos e Inventario comparten la misma instancia singleton y los cambios de stock se reflejan sin recarga", async () => {
      // Simula el orden correcto de inicialización de startApplication:
      (import.meta.env as Record<string, unknown>).VITE_DATA_MODE = "mock";
      configureInventoryApi(null);

      const pricingRuntime = await createPricingRuntime("mock");
      const combosRuntime = await createCombosRuntime("mock", pricingRuntime);

      // El repositorio que consume la UI de Inventario
      const inventoryRepo = getInventoryRepository();

      const transfers = await inventoryRepo.getTransfers();
      const transfer = transfers.find((t) => t.id === "tr-running-bla-m")!;
      const sku = transfer.sku; // "CAM-RUN-BLA-M"

      // 1. Combos lee el stock inicial
      const [initialAvailability] = await combosRuntime.availability.readStocks([sku]);
      expect(initialAvailability?.stock).toBeDefined();
      const initialStock = initialAvailability!.stock ?? 0;

      // 2. Inventario ejecuta una recepción en su repositorio
      await inventoryRepo.receiveTransfer({
        transferId: transfer.id,
        quantityReceived: 5,
        disposition: "REINGRESAR_DISPONIBLE",
        finalReceipt: true,
        operationId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        receivedAt: "2026-11-12T18:00:00Z",
      });

      // 3. Combos consulta nuevamente el stock del SKU y ve el cambio inmediatamente
      const [updatedAvailability] = await combosRuntime.availability.readStocks([sku]);
      expect(updatedAvailability?.stock).toBe(initialStock + 5);
    });
  });

  describe("2. Integración del composition root para la conexión HTTP de Inventario", () => {
    it("conecta el transporte autenticado al Gateway e inyecta Bearer token", async () => {
      (import.meta.env as Record<string, unknown>).VITE_DATA_MODE = "api";

      const requests: { url: string; headers: Record<string, string>; method: string }[] = [];
      const mockFetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          url: String(input),
          headers: (init?.headers as Record<string, string>) ?? {},
          method: init?.method ?? "GET",
        });
        return new Response(
          JSON.stringify({
            umbralGlobal: 5,
            overrides: [{ sku: "ADI-ENT22-AZU-M", umbral: 3 }],
            actualizadoEn: "2026-11-12T12:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const mockSession = {
        getAccessToken: vi.fn(async () => "g7-test-token-123"),
        refreshAccessToken: vi.fn(async () => null),
        invalidateAccessToken: vi.fn(),
      } as unknown as G7Session;

      const gateway = "https://gateway.test.local";
      const transport = createAuthenticatedInventoryTransport(gateway, mockSession, mockFetcher);
      configureInventoryApi(() => createHttpInventoryRepository({ transport }));

      const repo = getInventoryRepository();
      const thresholds = await repo.getThresholds();

      expect(thresholds.globalThreshold).toBe(5);
      expect(thresholds.skuOverrides["ADI-ENT22-AZU-M"]).toBe(3);

      expect(requests.length).toBe(1);
      expect(requests[0]?.url).toBe("https://gateway.test.local/api/v1/inventario/umbrales");
      expect(requests[0]?.headers.Authorization).toBe("Bearer g7-test-token-123");
    });

    it("maneja 401 TOKEN_INVALIDO en GET solicitando refresco del token", async () => {
      (import.meta.env as Record<string, unknown>).VITE_DATA_MODE = "api";

      let callCount = 0;
      const mockFetcher = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ code: "TOKEN_INVALIDO" }), { status: 401 });
        }
        return new Response(
          JSON.stringify({
            umbralGlobal: 10,
            overrides: [],
            actualizadoEn: "2026-11-12T12:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const mockSession = {
        getAccessToken: vi.fn(async () => "expired-token"),
        refreshAccessToken: vi.fn(async () => "new-renewed-token"),
        invalidateAccessToken: vi.fn(),
      } as unknown as G7Session;

      const transport = createAuthenticatedInventoryTransport("http://localhost:3000", mockSession, mockFetcher);
      configureInventoryApi(() => createHttpInventoryRepository({ transport }));

      const repo = getInventoryRepository();
      const thresholds = await repo.getThresholds();

      expect(thresholds.globalThreshold).toBe(10);
      expect(mockSession.refreshAccessToken).toHaveBeenCalledWith("expired-token", expect.anything());
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe("3. Disponibilidad selectiva de rutas en modo API (CommercialModeGate)", () => {
    it("permite /inventario/umbrales en modo API", () => {
      renderWithGate("/inventario/umbrales", "api");
      expect(screen.queryByTestId("target-content")).toBeTruthy();
    });

    it("permite /inventario/dashboard en modo API", () => {
      renderWithGate("/inventario/dashboard", "api");
      expect(screen.queryByTestId("target-content")).toBeTruthy();
    });

    it("bloquea /inventario en modo API mostrando mensaje de limitación y enlace a Consultas", () => {
      renderWithGate("/inventario", "api");
      expect(screen.queryByTestId("target-content")).toBeNull();
      expect(screen.getByText(/Función no disponible/i)).toBeTruthy();
      const link = screen.getByRole("link", { name: /Abrir en Consultas de los módulos/i });
      expect(link.getAttribute("href")).toBe("/consultas?operacion=consultarDisponibilidad");
    });

    it("bloquea /inventario/traslados en modo API mostrando mensaje de limitación y enlace a Consultas", () => {
      renderWithGate("/inventario/traslados", "api");
      expect(screen.queryByTestId("target-content")).toBeNull();
      expect(screen.getByText(/Función no disponible/i)).toBeTruthy();
      const link = screen.getByRole("link", { name: /Abrir en Consultas de los módulos/i });
      expect(link.getAttribute("href")).toBe("/consultas?operacion=listarTrasladosInventario");
    });

    it("permite todas las rutas de inventario en modo Mock", () => {
      for (const path of ["/inventario", "/inventario/umbrales", "/inventario/traslados", "/inventario/dashboard"]) {
        const { unmount } = renderWithGate(path, "mock");
        expect(screen.queryByTestId("target-content")).toBeTruthy();
        unmount();
      }
    });
  });
});
