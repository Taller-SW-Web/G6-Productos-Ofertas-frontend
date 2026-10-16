import { test, expect, type Page } from "@playwright/test";
import { MockInventoryAdapter } from "../src/features/inventory/adapters/mockInventoryAdapter";
import type { ReceiveTransferPayload } from "../src/features/inventory/services/inventoryTypes";

// Regresiones de la auditoría funcional de MK-015/MK-016:
//   TAC-06 (P1) KPI por SKU en varias ubicaciones no debe ocultar stock bajo.
//   TAC-07 (P1) Alerta de discrepancia por destino con merma sin saldo.
//   TAC-08 (P2) Distinguir KPI "sin datos" (null) de valor real cero (0).
//   TAC-09 (P2) Mostrar errores parciales de categorías/marcas en los filtros.

const { describe, beforeEach } = test;
const it = test;

const OPERATION_IDS = {
  tac06: "123e4567-e89b-12d3-a456-426614174000",
  tac07: "123e4567-e89b-12d3-a456-426614174001",
} as const;

function reception(
  overrides: Partial<ReceiveTransferPayload> & Pick<ReceiveTransferPayload, "operationId">,
): ReceiveTransferPayload {
  return {
    transferId: "tr-002",
    quantityReceived: 1,
    disposition: "REINGRESAR_DISPONIBLE",
    finalReceipt: false,
    receivedAt: "2026-10-16T12:00:00Z",
    ...overrides,
  };
}

describe("Auditoría MK-016 · regresiones TAC-06…TAC-09", () => {
  describe("TAC-06 (P1) · KPI por SKU en varias ubicaciones", () => {
    let adapter: MockInventoryAdapter;

    beforeEach(() => {
      adapter = new MockInventoryAdapter();
    });

    it("cuenta como stock bajo al SKU con una ubicación bajo umbral aunque otra tenga excedente", async () => {
      const before = await adapter.getDashboardKpis();

      // POL-RUN-M-BLU tiene excedente en ALM-CEN (45). Se recibe poco (2) en
      // RET-SAN, que no tenía saldo: allí queda bajo umbral.
      await adapter.receiveTransfer(
        reception({
          transferId: "tr-002",
          quantityReceived: 2,
          disposition: "REINGRESAR_DISPONIBLE",
          finalReceipt: false,
          operationId: OPERATION_IDS.tac06,
        }),
      );

      const after = await adapter.getDashboardKpis();

      // No debe ocultarse el stock bajo de RET-SAN por el saldo de ALM-CEN.
      expect(after.skusLowStock).toBe((before.skusLowStock ?? 0) + 1);
      expect(after.skusAvailable).toBe((before.skusAvailable ?? 0) - 1);
    });
  });

  describe("TAC-07 (P1) · Alerta de discrepancia filtrada por destino", () => {
    let adapter: MockInventoryAdapter;

    beforeEach(() => {
      adapter = new MockInventoryAdapter();
    });

    it("muestra la discrepancia al filtrar por el destino aunque la merma no deje saldo allí", async () => {
      // tr-002 (POL-RUN-M-BLU) se recibe como MERMA con cierre final y faltante:
      // el destino RET-SAN queda sin saldo del SKU, pero la discrepancia existe.
      await adapter.receiveTransfer(
        reception({
          transferId: "tr-002",
          quantityReceived: 10,
          disposition: "CONFIRMAR_MERMA",
          finalReceipt: true,
          operationId: OPERATION_IDS.tac07,
        }),
      );

      const alerts = await adapter.getDashboardAlerts({ locationId: "RET-SAN" });

      expect(alerts.some((alert) => alert.transferId === "tr-002")).toBe(true);
    });
  });

  describe("TAC-08 (P2) · KPI sin datos vs valor real cero", () => {
    let adapter: MockInventoryAdapter;

    beforeEach(() => {
      adapter = new MockInventoryAdapter();
    });

    it("devuelve null (sin datos) cuando no hay datos para la selección", async () => {
      const kpis = await adapter.getDashboardKpis({ search: "SKU-INEXISTENTE-XYZ" });

      expect(kpis.availableUnits).toBeNull();
      expect(kpis.skusLowStock).toBeNull();
      expect(kpis.transfersWithDiscrepancy).toBeNull();
    });

    it("devuelve 0 (cero real) cuando el dato existe y vale cero", async () => {
      const kpis = await adapter.getDashboardKpis({ search: "MED-CP-U-BLK" });

      expect(kpis.skusLowStock).toBe(0);
      expect(kpis.transfersWithDiscrepancy).toBe(0);
      expect(kpis.skusOutOfStock).toBe(1);
    });

    it("la UI muestra 'Sin datos' (no 0) cuando el dashboard no tiene datos", async ({
      page,
    }) => {
      await page.goto(
        "/tests/harness/inventory-adapter.html?path=/inventario/dashboard&empty=1",
      );

      await expect(
        page.getByRole("heading", { name: "Resumen de indicadores clave" }),
      ).toBeVisible();
      await expect(page.getByText("Unidades disponibles", { exact: true })).toBeVisible();
      // El estado vacío no debe mostrar ceros como si fueran datos reales.
      await expect(page.getByText("Sin datos").first()).toBeVisible();
    });
  });

  describe("TAC-09 (P2) · Errores parciales de categorías y marcas", () => {
    it("muestra un aviso parcial sin ocultar los filtros que sí cargaron", async ({
      page,
    }: {
      page: Page;
    }) => {
      await page.goto(
        "/tests/harness/inventory-adapter.html?path=/inventario/dashboard&fail-categories=1&fail-brands=1",
      );

      // Aviso parcial explícito
      await expect(
        page.getByText("No se pudieron cargar algunas opciones de filtro"),
      ).toBeVisible();

      // El filtro de ubicación (que sí cargó) sigue operativo
      const locationFilter = page.getByRole("combobox", {
        name: "Filtrar por ubicación",
      });
      await expect(locationFilter).toBeEnabled();
      await locationFilter.click();
      await expect(
        page.getByRole("option", { name: "Tienda Cusco Imperial", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    });
  });
});
