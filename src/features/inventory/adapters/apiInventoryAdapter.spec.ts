import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryError } from "../services/inventoryErrors";
import {
  createTransferReceptionFormSession,
  getUncertainTransferReception,
  resetUncertainTransferReceptions,
} from "../services/transferReceptionAttempt";
import type {
  ReceiveTransferPayload,
  TransferFiltersQuery,
} from "../services/inventoryTypes";
import {
  createHttpInventoryRepository,
  type InventoryHttpRequest,
  type InventoryHttpTransport,
} from "./apiInventoryAdapter";
import type { TransferPresentationResolver } from "../services/inventoryMappers";

beforeEach(() => {
  resetUncertainTransferReceptions();
});

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
  resolver?: TransferPresentationResolver;
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
  const resolver = options.withoutResolver
    ? undefined
    : (options.resolver ?? (async () => PRESENTATION));
  const repository = createHttpInventoryRepository({
    transport,
    ...(resolver ? { resolveTransferPresentation: resolver } : {}),
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

  it('omite el literal "all" de la UI en lugar de enviarlo al contrato', async () => {
    const { repository, calls } = setup(async () =>
      jsonResponse({ items: [], pagina: 1, tamanio: 100, total: 0 }),
    );
    await expect(
      repository.getTransfers({ status: "all", targetLocationId: "all" }),
    ).resolves.toEqual([]);
    expect(calls[0]?.path).toBe(
      "/api/v1/inventario/traslados?pagina=1&tamanio=100",
    );
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

  it("marca resultado incierto ante 5xx y permite reintentar con la misma solicitud inmutable", async () => {
    let attempt = 0;
    const { repository, request } = setup(async () => {
      attempt += 1;
      return attempt === 1
        ? problemResponse(503, "SERVICIO_NO_DISPONIBLE")
        : jsonResponse(RECEPCION_OK);
    });
    await expect(
      rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(repository.getTransferWriteRecord("t-1")?.state).toBe("UNCERTAIN");
    // Misma Idempotency-Key e idéntico payload: el reintento recupera la confirmación.
    await expect(
      repository.receiveTransfer(RECEPCION_PAYLOAD),
    ).resolves.toMatchObject({ id: "t-1", quantityReceived: 4 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(repository.getTransferWriteRecord("t-1")?.state).toBe("RECONCILED");
  });

  it("TAC-P0-02: GET /traslados no libera una operación incierta ni habilita otro operationId sin conciliación concluyente", async () => {
    let receiving = true;
    const { repository, request } = setup(async (path) => {
      if (path.includes("/recepciones")) {
        return receiving
          ? problemResponse(503, "SERVICIO_NO_DISPONIBLE")
          : jsonResponse(RECEPCION_OK);
      }
      return jsonResponse({
        items: [traslado()],
        pagina: 1,
        tamanio: 100,
        total: 1,
      });
    });
    await expect(
      rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
    expect(repository.getTransferWriteRecord("t-1")?.state).toBe("UNCERTAIN");

    const otherIdentity: ReceiveTransferPayload = {
      ...RECEPCION_PAYLOAD,
      operationId: "22222222-2222-4222-8222-222222222222",
    };
    await expect(
      rejection(repository.receiveTransfer(otherIdentity)),
    ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
    expect(request).toHaveBeenCalledTimes(1);

    // La lectura del listado general NO incluye operation_id: el estado sigue UNCERTAIN
    // y se marca como UNVERIFIABLE_BY_LIST_CONTRACT.
    await expect(repository.getTransfers()).resolves.toHaveLength(1);
    expect(repository.getTransferWriteRecord("t-1")).toMatchObject({
      state: "UNCERTAIN",
      reconciliation: "UNVERIFIABLE_BY_LIST_CONTRACT",
    });

    // Un intento con otro operationId sigue bloqueado tras el GET.
    receiving = false;
    await expect(
      rejection(repository.receiveTransfer(otherIdentity)),
    ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
    expect(request).toHaveBeenCalledTimes(2);

    // Solo el reintento idéntico con el mismo operationId y el mismo payload
    // recupera el resultado durable del servidor y reconcilia el estado.
    await expect(
      repository.receiveTransfer(RECEPCION_PAYLOAD),
    ).resolves.toMatchObject({ id: "t-1", quantityReceived: 4 });
    expect(request).toHaveBeenCalledTimes(3);
    expect(repository.getTransferWriteRecord("t-1")).toMatchObject({
      state: "RECONCILED",
      reconciliation: "CONFIRMED_BY_IDEMPOTENT_RETRY",
    });
  });

  it("TAC-P0-01 / TAC-P0-02: rechaza alterar timestamp, nota, cantidad, disposición o cierre final mientras la operación es incierta", async () => {
    const { repository, request } = setup(async () =>
      problemResponse(503, "SERVICIO_NO_DISPONIBLE"),
    );
    const initial: ReceiveTransferPayload = {
      ...RECEPCION_PAYLOAD,
      note: "Caja sellada",
    };
    await expect(
      rejection(repository.receiveTransfer(initial)),
    ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
    expect(request).toHaveBeenCalledTimes(1);

    for (const mutated of [
      { ...initial, receivedAt: "2026-10-03T00:00:05.000Z" },
      { ...initial, note: "Nota modificada" },
      { ...initial, quantityReceived: 3 },
      { ...initial, disposition: "CONFIRMAR_MERMA" as const },
      { ...initial, finalReceipt: true },
    ]) {
      await expect(
        rejection(repository.receiveTransfer(mutated)),
      ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
    }
    // Ninguna mutación salió a la red.
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("TAC-P0-01 / TAC-P0-02 (flujo formulario + adaptador + fingerprint backend): commit exitoso con pérdida de respuesta, cierre/reapertura de modal y recuperación idempotente sin segunda recepción", async () => {
    // Simula el cálculo real de fingerprint del backend (`traslados.service.ts`)
    // sobre traslado_id, received_quantity, disposition, final_receipt,
    // received_at, note e intention, más la tabla durable `inventory_operations`.
    const durableOperations = new Map<
      string,
      { fingerprint: string; response: Record<string, unknown> }
    >();
    let persistedReceptionsCount = 0;
    let loseHttpResponseOnce = true;

    const { repository, calls } = setup(async (path, req) => {
      if (path.endsWith("/inventario/traslados?pagina=1&tamanio=100")) {
        return jsonResponse({
          items: [
            traslado({
              quantity_received: persistedReceptionsCount > 0 ? 4 : 0,
              estado:
                persistedReceptionsCount > 0 ? "RECIBIDO_PARCIAL" : "EN_TRANSITO",
            }),
          ],
          pagina: 1,
          tamanio: 100,
          total: 1,
        });
      }

      const idempotencyKey = req.headers?.["Idempotency-Key"] ?? "";
      const dto = JSON.parse(req.body ?? "{}") as {
        operation_id: string;
        received_quantity: number;
        disposition: string;
        final_receipt: boolean;
        received_at: string;
        note?: string;
      };
      const fingerprint = JSON.stringify({
        traslado_id: "t-1",
        received_quantity: dto.received_quantity,
        disposition: dto.disposition,
        final_receipt: dto.final_receipt,
        received_at: dto.received_at,
        note: dto.note ?? null,
        intention: "recepcion_traslado",
      });

      const existing = durableOperations.get(idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return problemResponse(409, "IDEMPOTENCY_CONFLICT");
        }
        return jsonResponse(existing.response);
      }

      // 1.er envío: PostgreSQL confirma la operación y persiste el resultado,
      // pero la respuesta HTTP se pierde antes de llegar al navegador.
      persistedReceptionsCount += 1;
      const storedResponse = {
        ...RECEPCION_OK,
        operation_id: dto.operation_id,
        received_quantity: dto.received_quantity,
      };
      durableOperations.set(idempotencyKey, {
        fingerprint,
        response: storedResponse,
      });

      if (loseHttpResponseOnce) {
        loseHttpResponseOnce = false;
        throw new TypeError("network connection lost after commit");
      }
      return jsonResponse(storedResponse);
    });

    let clockTick = 0;
    const timestamps = [
      "2026-10-20T18:00:00.000Z",
      "2026-10-20T18:01:00.000Z",
      "2026-10-20T18:02:00.000Z",
    ];
    let idTick = 0;
    const ids = [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ];

    // Sesión 1 del modal (apertura inicial)
    const modalSession1 = createTransferReceptionFormSession("t-1", {
      createId: () => ids[idTick++]!,
      now: () => timestamps[clockTick++]!,
    });

    const firstAttemptPayload = modalSession1.prepareSubmission({
      quantityReceived: 4,
      disposition: "REINGRESAR_DISPONIBLE",
      finalReceipt: false,
      note: "  Entrega parcial verificada  ",
    });

    const firstError = await rejection(
      repository.receiveTransfer(firstAttemptPayload),
    );
    expect(firstError.code).toBe("RESULTADO_INCIERTO");
    modalSession1.recordFailure(firstAttemptPayload, firstError);

    // La recepción sí se persistió en el backend, pero el cliente quedó en UNCERTAIN.
    expect(persistedReceptionsCount).toBe(1);
    expect(getUncertainTransferReception("t-1")).toEqual(firstAttemptPayload);

    // Caso 4: intento de cambiar cantidad o nota durante la operación incierta.
    expect(() =>
      modalSession1.prepareSubmission({
        quantityReceived: 5,
        disposition: "REINGRESAR_DISPONIBLE",
        finalReceipt: false,
        note: "Entrega parcial verificada",
      }),
    ).toThrowError(InventoryError);
    expect(() =>
      modalSession1.prepareSubmission({
        quantityReceived: 4,
        disposition: "REINGRESAR_DISPONIBLE",
        finalReceipt: false,
        note: "Otra nota distinta",
      }),
    ).toThrowError(InventoryError);

    // Caso 6: el usuario cierra el modal y recarga la bandeja (`GET /traslados`);
    // la lectura general NO libera la operación incierta.
    await expect(repository.getTransfers()).resolves.toHaveLength(1);
    expect(repository.getTransferWriteRecord("t-1")?.state).toBe("UNCERTAIN");

    // Caso 5: el usuario vuelve a abrir el modal para `t-1` (nueva instancia de
    // sesión con reloj en T2 y generador listo para otro UUID).
    const modalSession2 = createTransferReceptionFormSession("t-1", {
      createId: () => ids[idTick++]!,
      now: () => timestamps[clockTick++]!,
    });
    expect(modalSession2.getUncertainPayload()).toEqual(firstAttemptPayload);

    // Caso 3: reintento desde el modal reabierto. Reutiliza EXACTAMENTE el
    // mismo operationId, receivedAt y note (idéntico JSON e Idempotency-Key).
    const retryPayload = modalSession2.prepareSubmission({
      quantityReceived: 4,
      disposition: "REINGRESAR_DISPONIBLE",
      finalReceipt: false,
      note: "Entrega parcial verificada",
    });
    expect(retryPayload).toEqual(firstAttemptPayload);

    const recovered = await repository.receiveTransfer(retryPayload);
    modalSession2.recordSuccess(retryPayload);

    expect(recovered).toMatchObject({
      id: "t-1",
      status: "RECIBIDO_PARCIAL",
      quantityReceived: 4,
    });
    // No se registró una segunda recepción en el backend.
    expect(persistedReceptionsCount).toBe(1);
    expect(getUncertainTransferReception("t-1")).toBeNull();
    expect(repository.getTransferWriteRecord("t-1")?.state).toBe("RECONCILED");

    const postCalls = calls.filter((c) => c.request.method === "POST");
    expect(postCalls).toHaveLength(2);
    expect(postCalls[0]?.request.headers?.["Idempotency-Key"]).toBe(
      postCalls[1]?.request.headers?.["Idempotency-Key"],
    );
    expect(postCalls[0]?.request.body).toBe(postCalls[1]?.request.body);
  });

  it("TAC-P0-01: tras un rechazo definitivo (4xx), cambiar cantidad, disposición, cierre final o nota genera una operación nueva con distinto operationId y timestamp", async () => {
    const { repository } = setup(async () =>
      problemResponse(422, "CANTIDAD_RECIBIDA_EXCEDE_TRASLADO"),
    );

    let idIndex = 0;
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    let timeIndex = 0;
    const times = [
      "2026-10-20T19:00:00.000Z",
      "2026-10-20T19:00:10.000Z",
      "2026-10-20T19:00:20.000Z",
    ];

    const session = createTransferReceptionFormSession("t-1", {
      createId: () => ids[idIndex++]!,
      now: () => times[timeIndex++]!,
    });

    const first = session.prepareSubmission({
      quantityReceived: 10,
      disposition: "REINGRESAR_DISPONIBLE",
      finalReceipt: true,
      note: "Nota A",
    });
    const err = await rejection(repository.receiveTransfer(first));
    expect(err.code).toBe("CANTIDAD_RECIBIDA_EXCEDE_TRASLADO");
    session.recordFailure(first, err);

    // Como fue 422 definitivo, el traslado NO quedó bloqueado en UNCERTAIN.
    expect(repository.getTransferWriteRecord("t-1")).toBeNull();

    // Si reintenta sin tocar ningún campo (misma nota, cantidad, etc.), conserva snapshot.
    const sameRetry = session.prepareSubmission({
      quantityReceived: 10,
      disposition: "REINGRESAR_DISPONIBLE",
      finalReceipt: true,
      note: "Nota A",
    });
    expect(sameRetry.operationId).toBe(first.operationId);
    expect(sameRetry.receivedAt).toBe(first.receivedAt);

    // Si cambia SOLO la nota, NO se presenta como reintento de la misma operación.
    const changedNote = session.prepareSubmission({
      quantityReceived: 10,
      disposition: "REINGRESAR_DISPONIBLE",
      finalReceipt: true,
      note: "Nota B corregida",
    });
    expect(changedNote.operationId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(changedNote.receivedAt).toBe("2026-10-20T19:00:10.000Z");
  });

  it("Caso 8: rechazos 401, 403, 409 y 422 en receiveTransfer no dejan bloqueo incierto ni mutaciones adicionales", async () => {
    for (const [status, code, expected] of [
      [401, "TOKEN_INVALIDO", "NO_AUTENTICADO"],
      [403, "SCOPE_INSUFICIENTE", "SIN_PERMISO"],
      [409, "TRASLADO_NO_RECIBIBLE", "TRASLADO_NO_RECIBIBLE"],
      [409, "IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_CONFLICT"],
      [422, "CANTIDAD_RECIBIDA_EXCEDE_TRASLADO", "CANTIDAD_RECIBIDA_EXCEDE_TRASLADO"],
    ] as const) {
      const { repository, calls } = setup(async () =>
        problemResponse(status, code),
      );
      await expect(
        rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
      ).resolves.toMatchObject({ code: expected });
      expect(calls).toHaveLength(1);
      expect(repository.getTransferWriteRecord("t-1")).toBeNull();
      expect(getUncertainTransferReception("t-1")).toBeNull();
    }
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

  it("TAC-P0-05: registra la confirmación antes del enriquecimiento; un resolvedor caído no reabre la operación ni repite el POST", async () => {
    const { repository, calls } = setup(async () => jsonResponse(RECEPCION_OK), {
      resolver: async () => {
        throw new InventoryError("CONTRATO_BLOQUEADO", "resolvedor de presentación caído");
      },
    });
    await expect(
      rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "CONTRATO_BLOQUEADO" });

    // La mutación ya está confirmada y reconciliada, pese al fallo del resolvedor.
    expect(repository.getTransferWriteRecord("t-1")?.state).toBe("RECONCILED");
    expect(getUncertainTransferReception("t-1")).toBeNull();

    // El reintento con la misma identidad NO repite el POST (devuelve el cache).
    await expect(
      rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "CONTRATO_BLOQUEADO" });
    expect(calls).toHaveLength(1);
  });

  it("TAC-P0-05: HTTP 200 con DTO de confirmación incompatible preserva UNCERTAIN (no libera la operación)", async () => {
    // Falta `operation_id` y `traslado`: el DTO no permite determinar el resultado.
    const { repository, calls } = setup(async () =>
      jsonResponse({ receipt_id: "r-1", disposition: "REINGRESAR_DISPONIBLE", received_quantity: 4, completed_at: "2026-10-03T00:00:00.000Z" }),
    );
    await expect(
      rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "RESPUESTA_INCOMPATIBLE" });
    expect(repository.getTransferWriteRecord("t-1")?.state).toBe("UNCERTAIN");
    expect(getUncertainTransferReception("t-1")).not.toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("TAC-P1-07: en UNCERTAIN, ningún error del reintento (400/401/403/404/409/422/5xx/red/DTO inválido) libera el bloqueo", async () => {
    const retryOutcomes: (() => Promise<Response> | Response)[] = [
      () => problemResponse(400, "VALIDACION"),
      () => problemResponse(401, "TOKEN_INVALIDO"),
      () => problemResponse(403, "SCOPE_INSUFICIENTE"),
      () => problemResponse(404, "TRASLADO_NO_ENCONTRADO"),
      () => problemResponse(409, "IDEMPOTENCY_CONFLICT"),
      () => problemResponse(422, "CANTIDAD_RECIBIDA_EXCEDE_TRASLADO"),
      () => problemResponse(503, "SERVICIO_NO_DISPONIBLE"),
      () => {
        throw new TypeError("network lost");
      },
      () =>
        new Response("no-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      () =>
        jsonResponse({
          receipt_id: "r-1",
          disposition: "REINGRESAR_DISPONIBLE",
          received_quantity: 4,
          completed_at: "2026-10-03T00:00:00.000Z",
        }),
    ];

    for (const outcome of retryOutcomes) {
      let attempt = 0;
      const { repository } = setup(async () => {
        attempt += 1;
        if (attempt === 1) return problemResponse(503, "SERVICIO_NO_DISPONIBLE");
        return outcome();
      });

      // Primer intento queda UNCERTAIN.
      await expect(
        rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
      ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
      expect(repository.getTransferWriteRecord("t-1")?.state).toBe("UNCERTAIN");

      // Reintento con la MISMA solicitud inmutable: cualquier desenlace conserva UNCERTAIN.
      const retryError = await rejection(
        repository.receiveTransfer(RECEPCION_PAYLOAD),
      );
      expect(retryError).toBeInstanceOf(InventoryError);
      expect(repository.getTransferWriteRecord("t-1")?.state).toBe("UNCERTAIN");
      expect(getUncertainTransferReception("t-1")).not.toBeNull();
    }
  });

  it("TAC-P1-07: estando en UNCERTAIN, solo un 200 con DTO válido transiciona a RECONCILED", async () => {
    let attempt = 0;
    const { repository, calls } = setup(async () => {
      attempt += 1;
      if (attempt === 1) return problemResponse(503, "SERVICIO_NO_DISPONIBLE");
      return jsonResponse(RECEPCION_OK);
    });
    await expect(
      rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
    expect(repository.getTransferWriteRecord("t-1")?.state).toBe("UNCERTAIN");

    await expect(
      repository.receiveTransfer(RECEPCION_PAYLOAD),
    ).resolves.toMatchObject({ id: "t-1", quantityReceived: 4 });
    expect(repository.getTransferWriteRecord("t-1")).toMatchObject({
      state: "RECONCILED",
      reconciliation: "CONFIRMED_BY_IDEMPOTENT_RETRY",
    });
    expect(calls).toHaveLength(2);
  });

  it("TAC-P0-06: el registro incierto es solo en memoria y se pierde al reiniciar la sesión (limitación documentada, BLOQUEADO_ESPECÍFICO)", async () => {
    const { repository } = setup(async () =>
      problemResponse(503, "SERVICIO_NO_DISPONIBLE"),
    );
    await expect(
      rejection(repository.receiveTransfer(RECEPCION_PAYLOAD)),
    ).resolves.toMatchObject({ code: "RESULTADO_INCIERTO" });
    expect(getUncertainTransferReception("t-1")).not.toBeNull();

    // Simula una recarga completa del navegador: el Map en memoria se vacía.
    resetUncertainTransferReceptions();
    expect(getUncertainTransferReception("t-1")).toBeNull();

    // Una nueva sesión del formulario ya no restaura la operación incierta.
    // (Este es el hueco exacto que Marco marca como BLOQUEADO_ESPECÍFICO: la
    // solución requiere acuerdo previo y no se implementa aquí.)
    const newSession = createTransferReceptionFormSession("t-1");
    expect(newSession.getUncertainPayload()).toBeNull();
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
    await expect(
      rejection(repository.getDashboardKpis({ status: "AGOTADO" })),
    ).resolves.toMatchObject({ code: "CONTRATO_BLOQUEADO" });
    expect(request).not.toHaveBeenCalled();
  });

  it('omite el literal "all" y consulta el agregado sin parámetros', async () => {
    const { repository, calls } = setup(async () => jsonResponse(DASHBOARD_DTO));
    await expect(
      repository.getDashboardKpis({
        search: "",
        category: "all",
        brand: "all",
        locationId: "all",
        status: "all",
      }),
    ).resolves.toMatchObject({ availableUnits: 125 });
    expect(calls[0]?.path).toBe("/api/v1/inventario/dashboard");
  });

  it("mapea porUbicacion y expone null en nombre y bloqueo no publicados", async () => {
    const { repository, calls } = setup(async () => jsonResponse(DASHBOARD_DTO));
    await expect(
      repository.getLocationDistribution({ locationId: "loc-1" }),
    ).resolves.toEqual([
      {
        locationId: "loc-1",
        locationName: null,
        onHandTotal: 150,
        reservedTotal: 20,
        blockedTotal: null,
        availableTotal: 125,
        skusAvailableCount: 9,
        skusLowStockCount: 2,
        skusOutOfStockCount: 1,
      },
    ]);
    expect(calls[0]?.path).toBe(
      "/api/v1/inventario/dashboard?locationId=loc-1",
    );
  });

  it("rechaza la distribución si el filtro no es verificable por contrato", async () => {
    const { repository, request } = setup(async () => jsonResponse(DASHBOARD_DTO));
    await expect(
      rejection(repository.getLocationDistribution({ search: "SKU-A" })),
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
