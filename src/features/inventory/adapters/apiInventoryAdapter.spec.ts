import { describe, expect, it, vi } from "vitest";
import { InventoryError } from "../services/inventoryErrors";
import type {
  ReceiveTransferPayload,
  TransferFiltersQuery,
} from "../services/inventoryTypes";
import {
  createHttpInventoryRepository,
  type InventoryHttpRequest,
  type InventoryHttpTransport,
} from "./apiInventoryAdapter";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function problemResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ title: code, status, code }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });
}

const UMBRALES = { umbralGlobal: 5, overrides: [{ sku: "SKU-A", umbral: 3 }] };

function traslado(overrides: Record<string, unknown> = {}) {
  return {
    traslado_id: "t-1",
    source_incident_id: null,
    sku: "SKU-A",
    quantity_shipped: 10,
    quantity_received: 4,
    missing_quantity: 6,
    source_location_id: "loc-1",
    target_location_id: "loc-2",
    estado: "EN_TRANSITO",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-02T00:00:00.000Z",
    ...overrides,
  };
}

const PRESENTATION = {
  transferCode: "TR-001",
  productName: "Producto A",
  sourceLocationName: "Almacén Central",
  targetLocationName: "Tienda Norte",
};

const RECEPCION_OK = {
  receipt_id: "r-1",
  operation_id: "11111111-1111-4111-8111-111111111111",
  traslado: traslado({ estado: "RECIBIDO_PARCIAL" }),
  disposition: "REINGRESAR_DISPONIBLE",
  received_quantity: 4,
  destination_balance: null,
  completed_at: "2026-10-03T00:00:00.000Z",
};

const RECEPCION_PAYLOAD: ReceiveTransferPayload = {
  transferId: "t-1",
  quantityReceived: 4,
  disposition: "REINGRESAR_DISPONIBLE",
  finalReceipt: false,
  operationId: "11111111-1111-4111-8111-111111111111",
  receivedAt: "2026-10-03T00:00:00.000Z",
};

interface SetupOptions {
  withoutResolver?: boolean;
}

function setup(
  respond: (path: string, request: InventoryHttpRequest) => Promise<Response>,
  options: SetupOptions = {},
) {
  const calls: { path: string; request: InventoryHttpRequest }[] = [];
  const request = vi.fn(async (path: string, init: InventoryHttpRequest) => {
    calls.push({ path, request: init });
    return respond(path, init);
  });
  const transport: InventoryHttpTransport = { request };
  const repository = createHttpInventoryRepository({
    transport,
    ...(options.withoutResolver
      ? {}
      : { resolveTransferPresentation: async () => PRESENTATION }),
  });
  return { repository, request, calls };
}

async function rejection(promise: Promise<unknown>): Promise<InventoryError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof InventoryError) return error;
    throw error;
  }
  throw new Error("Se esperaba un rechazo de InventoryError");
}

describe("apiInventoryAdapter — umbrales (mapeo total)", () => {
  it("getThresholds consulta el contract y mapea UmbralInventario", async () => {
    const { repository, calls } = setup(async () => jsonResponse(UMBRALES));
    await expect(repository.getThresholds()).resolves.toEqual({
      globalThreshold: 5,
      skuOverrides: { "SKU-A": 3 },
    });
    expect(calls[0]?.path).toBe("/api/v1/inventario/umbrales");
    expect(calls[0]?.request.method).toBe("GET");
  });

  it("updateGlobalThreshold envía {umbral} y devuelve la configuración", async () => {
    const { repository, calls } = setup(async () =>
      jsonResponse({ umbralGlobal: 7, overrides: [] }),
    );
    await expect(repository.updateGlobalThreshold(7)).resolves.toEqual({
      globalThreshold: 7,
      skuOverrides: {},
    });
    expect(calls[0]?.path).toBe("/api/v1/inventario/umbrales/global");
    expect(calls[0]?.request.method).toBe("PUT");
    expect(JSON.parse(calls[0]?.request.body ?? "{}")).toEqual({ umbral: 7 });
  });

  it("updateSkuThreshold codifica el SKU y envía {umbral}", async () => {
    const { repository, calls } = setup(async () =>
      jsonResponse({ umbralGlobal: 5, overrides: [{ sku: "SKU/A", umbral: 2 }] }),
    );
    await repository.updateSkuThreshold("SKU/A", 2);
    expect(calls[0]?.path).toBe("/api/v1/inventario/umbrales/skus/SKU%2FA");
    expect(JSON.parse(calls[0]?.request.body ?? "{}")).toEqual({ umbral: 2 });
  });

  it("rechaza una respuesta de umbrales incompatible", async () => {
    const { repository } = setup(async () =>
      jsonResponse({ umbralGlobal: -1, overrides: [] }),
    );
    await expect(rejection(repository.getThresholds())).resolves.toMatchObject({
      code: "RESPUESTA_INCOMPATIBLE",
    });
  });
});

describe("apiInventoryAdapter — traslados (requiere resolvedor autoritativo)", () => {
  it("getTransfers pagina hasta completar el total y mapea la presentación", async () => {
    const { repository, calls } = setup(async (path) => {
      const pagina = new URL(path, "http://local").searchParams.get("pagina");
      return pagina === "1"
        ? jsonResponse({
            items: [traslado({ traslado_id: "t-1" })],
            pagina: 1,
            tamanio: 100,
            total: 2,
          })
        : jsonResponse({
            items: [traslado({ traslado_id: "t-2" })],
            pagina: 2,
            tamanio: 100,
            total: 2,
          });
    });
    const items = await repository.getTransfers();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "t-1",
      transferCode: "TR-001",
      productName: "Producto A",
      sourceLocationName: "Almacén Central",
      quantityPending: 6,
      status: "EN_TRANSITO",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.path).toContain("tamanio=100");
    expect(calls[0]?.path).toContain("pagina=1");
    expect(calls[1]?.path).toContain("pagina=2");
  });

  it("getTransfers envía los filtros contractuales estado y target_location_id", async () => {
    const filters: TransferFiltersQuery = {
      status: "EN_TRANSITO",
      targetLocationId: "loc-2",
    };
    const { repository, calls } = setup(async () =>
      jsonResponse({ items: [], pagina: 1, tamanio: 100, total: 0 }),
    );
    await expect(repository.getTransfers(filters)).resolves.toEqual([]);
    expect(calls[0]?.path).toContain("estado=EN_TRANSITO");
    expect(calls[0]?.path).toContain("target_location_id=loc-2");
  });

  it("getTransfers falla con CONTRATO_BLOQUEADO si falta el resolvedor", async () => {
    const { repository } = setup(
      async () =>
        jsonResponse({
          items: [traslado()],
          pagina: 1,
          tamanio: 100,
          total: 1,
        }),
      { withoutResolver: true },
    );
    await expect(rejection(repository.getTransfers())).resolves.toMatchObject({
      code: "CONTRATO_BLOQUEADO",
    });
  });

  it("getTransfers no necesita resolvedor cuando no hay traslados", async () => {
    const { repository } = setup(
      async () => jsonResponse({ items: [], pagina: 1, tamanio: 100, total: 0 }),
      { withoutResolver: true },
    );
    await expect(repository.getTransfers()).resolves.toEqual([]);
  });

  it("detecta una paginación incoherente sin truncar silenciosamente", async () => {
    const { repository, calls } = setup(async (path) => {
      const pagina = new URL(path, "http://local").searchParams.get("pagina");
      return pagina === "1"
        ? jsonResponse({
            items: [traslado()],
            pagina: 1,
            tamanio: 100,
            total: 5,
          })
        : jsonResponse({ items: [], pagina: 2, tamanio: 100, total: 5 });
    });
    const error = await rejection(repository.getTransfers());
    expect(error.code).toBe("RESPUESTA_INCOMPATIBLE");
    expect(calls).toHaveLength(2);
  });
});

describe("apiInventoryAdapter — recepción de traslado (escritura idempotente)", () => {
  it("envía Idempotency-Key y mapea la respuesta del contract", async () => {
    const { repository, calls } = setup(async () => jsonResponse(RECEPCION_OK));
    await expect(repository.receiveTransfer(RECEPCION_PAYLOAD)).resolves.toMatchObject(
      {
        id: "t-1",
        status: "RECIBIDO_PARCIAL",
        quantityReceived: 4,
      },
    );
    const call = calls[0];
    expect(call?.path).toBe("/api/v1/inventario/traslados/t-1/recepciones");
    expect(call?.request.method).toBe("POST");
    expect(call?.request.headers?.["Idempotency-Key"]).toBe(
      RECEPCION_PAYLOAD.operationId,
    );
    expect(JSON.parse(call?.request.body ?? "{}")).toEqual({
      operation_id: RECEPCION_PAYLOAD.operationId,
      received_quantity: 4,
      disposition: "REINGRESAR_DISPONIBLE",
      final_receipt: false,
      received_at: RECEPCION_PAYLOAD.receivedAt,
    });
  });

  it("bloquea un doble envío concurrente del mismo traslado", async () => {
    let release: (response: Response) => void = () => {};
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const { repository } = setup(async () => gate);
    const first = repository.receiveTransfer(RECEPCION_PAYLOAD);
    const second = repository.receiveTransfer(RECEPCION_PAYLOAD);
    await expect(rejection(second)).resolves.toMatchObject({
      code: "RESULTADO_INCIERTO",
    });
    release(jsonResponse(RECEPCION_OK));
    await expect(first).resolves.toMatchObject({ id: "t-1" });
  });

  it("marca resultado incierto ante 5xx y exige verificar antes de reintentar", async () => {
    const { repository, request } = setup(async () =>
      problemResponse(503, "SERVICIO_NO_DISPONIBLE"),
    );
    await expect(
      rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
    expect(request).toHaveBeenCalledTimes(1);
    await expect(
      rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("traduce 409 TRASLADO_NO_RECIBIBLE e IDEMPOTENCY_CONFLICT", async () => {
    const noRecibible = setup(async () =>
      problemResponse(409, "TRASLADO_NO_RECIBIBLE"),
    );
    await expect(
      rejection(noRecibible.repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "TRASLADO_NO_RECIBIBLE" });

    const idempotencia = setup(async () =>
      problemResponse(409, "IDEMPOTENCY_CONFLICT"),
    );
    await expect(
      rejection(idempotencia.repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("traduce 422 CANTIDAD_RECIBIDA_EXCEDE_TRASLADO", async () => {
    const { repository } = setup(async () =>
      problemResponse(422, "CANTIDAD_RECIBIDA_EXCEDE_TRASLADO"),
    );
    await expect(
      rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "CANTIDAD_RECIBIDA_EXCEDE_TRASLADO" });
  });

  it("traduce 401 y 403 del provider", async () => {
    const unauthorized = setup(async () =>
      problemResponse(401, "TOKEN_INVALIDO"),
    );
    await expect(
      rejection(unauthorized.repository.getThresholds()),
    ).resolves.toMatchObject({ code: "NO_AUTENTICADO" });

    const forbidden = setup(async () =>
      problemResponse(403, "SCOPE_INSUFICIENTE"),
    );
    await expect(
      rejection(forbidden.repository.getThresholds()),
    ).resolves.toMatchObject({ code: "SIN_PERMISO" });
  });

  it("marca RESULTADO_INCIERTO si la recepción se confirmó con respuesta ilegible", async () => {
    const { repository } = setup(
      async () =>
        new Response("no-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
  });
});

describe("apiInventoryAdapter — dashboard KPIs (obtenerDashboardInventario)", () => {
  const DASHBOARD_DTO = {
    generatedAt: "2026-10-20T00:00:00.000Z",
    totalSkus: 12,
    totalOnHand: 150,
    totalReserved: 20,
    totalAvailable: 125,
    skusDisponibles: 9,
    skusStockBajo: 2,
    skusAgotados: 1,
    porUbicacion: [
      {
        location_id: "loc-1",
        on_hand: 150,
        reserved: 20,
        available: 125,
        skusDisponibles: 9,
        skusStockBajo: 2,
        skusAgotados: 1,
      },
    ],
  };

  it("mapea KPIs autoritativos de DashboardInventario e informa null en métricas no publicadas", async () => {
    const { repository, calls } = setup(async () => jsonResponse(DASHBOARD_DTO));
    await expect(
      repository.getDashboardKpis({ locationId: "loc-1" }),
    ).resolves.toEqual({
      availableUnits: 125,
      blockedUnits: null,
      totalPhysicalUnits: 150,
      totalVendibleSkus: null,
      skusAvailable: 9,
      skusLowStock: 2,
      skusOutOfStock: 1,
      reservedUnits: 20,
      totalPendingTransfers: null,
      transfersInTransit: null,
      transfersPartiallyReceived: null,
      transfersWithDiscrepancy: null,
    });
    expect(calls[0]?.path).toBe("/api/v1/inventario/dashboard?locationId=loc-1");
  });

  it("rechaza con CONTRATO_BLOQUEADO filtros de texto libre o estado no admitidos por obtenerDashboardInventario", async () => {
    const { repository, request } = setup(async () => jsonResponse(DASHBOARD_DTO));
    await expect(
      rejection(repository.getDashboardKpis({ search: "SKU-A" })),
    ).resolves.toMatchObject({ code: "CONTRATO_BLOQUEADO" });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("apiInventoryAdapter — operaciones sin fuente contractual", () => {
  it("rechaza con CONTRATO_BLOQUEADO las lecturas cuyo modelo no cubre el contrato", async () => {
    const { repository, request } = setup(async () => jsonResponse({}));
    for (const promise of [
      repository.getStockItems(),
      repository.getStockDetail("SKU-A", "loc-1"),
      repository.getDashboardAlerts(),
      repository.getLocationDistribution(),
      repository.getCategories(),
      repository.getBrands(),
      repository.getLocations(),
    ]) {
      const error = await rejection(promise);
      expect(error.code).toBe("CONTRATO_BLOQUEADO");
    }
    expect(request).not.toHaveBeenCalled();
  });
});
