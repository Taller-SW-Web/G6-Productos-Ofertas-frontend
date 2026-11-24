import { createAuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
import { withAdminPriceDefinition } from "../../../../tests/fixtures/adminPriceDefinition";
import { createMemoryStorage } from "../../../../tests/fixtures/h4Controlled";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PricingFailure, type PriceChange } from "../services/pricingModels";
import type { PriceTarget } from "../services/pricingRepository";
import {
  createHttpPricingRepository,
  type HttpPricingRepositoryDependencies,
  type PricingHttpRequest,
} from "./httpPricingRepository";
import { requestMoney } from "./httpPricingMapper";

beforeEach(() => { vi.stubGlobal("sessionStorage", createMemoryStorage()); });
afterEach(() => { vi.unstubAllGlobals(); });

const product: PriceTarget = {
  id: "product-target",
  label: "Producto A",
  productId: "product-a",
  kind: "product",
  referenceSku: "SKU-A",
};
const variant: Extract<PriceTarget, { kind: "variant" }> = {
  id: "variant-target",
  label: "Producto A · Azul",
  productId: "product-a",
  kind: "variant",
  sku: "SKU/A",
  productTargetId: "product-target",
};
const targets = [product, variant];

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function skuPrice(overrides: Record<string, unknown> = {}) {
  return {
    sku: variant.sku,
    precio_regular: 12.5,
    precio_oferta: null,
    currency: "COP",
    channel_id: null,
    valid_from: "2026-10-01T00:00:00.000Z",
    valid_until: null,
    price_version: 4,
    vigencia_id: "validity-4",
    origen: "SKU_OVERRIDE",
    ...overrides,
  };
}

function productPrice(overrides: Record<string, unknown> = {}) {
  return {
    product_id: product.productId,
    precio_regular: 12.5,
    precio_oferta: null,
    currency: "COP",
    channel_id: null,
    valid_from: "2026-10-01T00:00:00.000Z",
    valid_until: null,
    price_version: 3,
    ...overrides,
  };
}

function setup(
  respond: (path: string, request: PricingHttpRequest) => Promise<Response> =
    async () => jsonResponse(skuPrice()),
  options: {
    targets?: PriceTarget[];
    onUpdated?: HttpPricingRepositoryDependencies["onUpdated"];
  } = {},
) {
  const calls: { path: string; request: PricingHttpRequest }[] = [];
  const request = vi.fn(async (path: string, init: PricingHttpRequest) => {
    calls.push({ path, request: init });
    return withAdminPriceDefinition(path, await respond(path, init));
  });
  const repository = createHttpPricingRepository({
    transport: { request },
    listCatalogTargets: async (signal) => {
      signal.throwIfAborted();
      return options.targets ?? targets;
    },
    onUpdated: options.onUpdated,
  });
  return { repository, request, calls };
}

function firstCall(calls: { path: string; request: PricingHttpRequest }[]) {
  const call = calls[0];
  if (!call) throw new Error("La solicitud HTTP esperada no ocurrió.");
  return call;
}

function change(overrides: Partial<PriceChange> = {}): PriceChange {
  return {
    target: { targetId: variant.id, channel: "global" },
    version: 4,
    draft: {
      regular: "13.20",
      offer: "10.00",
      offerAction: "ELIMINAR",
      currency: "COP",
      reason: "Corrección comercial",
    },
    ...overrides,
  };
}

describe("createHttpPricingRepository", () => {
  it("falla cerrado si no recibe selección autoritativa de Catálogo", async () => {
    const request = vi.fn();
    const repository = createHttpPricingRepository({
      transport: { request },
    });

    await expect(repository.listTargets(new AbortController().signal)).rejects.toMatchObject({
      kind: "blocked_contract",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("consulta el precio base del producto y deja vacío el desglose no disponible", async () => {
    const { repository, calls } = setup(async () => jsonResponse(productPrice()));
    const result = await repository.read(
      { targetId: product.id, channel: "global" },
      new AbortController().signal,
    );

    expect(firstCall(calls).path).toBe("/api/v1/precios/productos/product-a");
    expect(firstCall(calls).request.method).toBe("GET");
    expect(result).toMatchObject({
      price: {
        id: product.id,
        regular: "12.5",
        offer: null,
        currency: "COP",
        channel: "global",
        version: 3,
        validUntil: null,
      },
      breakdown: [],
    });
  });

  it("consulta un SKU por su identidad real y canal contractual", async () => {
    const { repository, calls } = setup(async () =>
      jsonResponse(skuPrice({ channel_id: "RETAIL" })),
    );
    const result = await repository.read(
      { targetId: variant.id, channel: "retail" },
      new AbortController().signal,
    );

    expect(firstCall(calls).path).toBe("/api/v1/precios/skus/SKU%2FA?canal=RETAIL");
    expect(result?.price).toMatchObject({
      id: variant.id,
      sku: variant.sku,
      channel: "retail",
      origin: "sku",
      inherited: false,
      validityId: "validity-4",
    });
  });

  it("usa el SKU de referencia para histórico y conserva la vigencia recibida", async () => {
    const { repository, calls } = setup(async () =>
      jsonResponse(
        skuPrice({ sku: "SKU-A", origen: "PRODUCTO", vigencia_id: "validity-old" }),
      ),
    );
    const result = await repository.readHistorical(
      { targetId: product.id, channel: "global" },
      "2026-10-05T12:00:00.000Z",
      new AbortController().signal,
    );

    expect(firstCall(calls).path).toContain("/api/v1/precios/skus/SKU-A?");
    expect(firstCall(calls).path).toContain("at=2026-10-05T12%3A00%3A00.000Z");
    expect(firstCall(calls).path).not.toContain("productos/");
    expect(result).toMatchObject({
      validityId: "validity-old",
      price: { id: product.id, sku: "SKU-A", origin: "product", inherited: false },
    });
  });

  it("lee la variante exacta al preparar una edición, no la definición padre", async () => {
    const { repository, calls } = setup();
    await repository.readEditable(
      { targetId: variant.id, channel: "global" },
      new AbortController().signal,
    );

    expect(firstCall(calls).path).toBe("/api/v1/precios/administracion/skus/SKU%2FA");
  });

  it("conserva el precio heredado para consulta y rechaza editar sin definición exacta", async () => {
    const { repository, calls } = setup(async path => path.includes("/administracion/")
      ? jsonResponse({ code: "PRECIO_NO_ENCONTRADO" }, 404)
      : jsonResponse(skuPrice({ origen: "PRODUCTO" })));
    const signal = new AbortController().signal;
    const target = { targetId: variant.id, channel: "global" as const };
    await expect(repository.read(target, signal)).resolves.toMatchObject({ price: { inherited: true } });
    await expect(repository.readEditable(target, signal)).resolves.toBeNull();
    await expect(repository.update(change(), signal)).rejects.toMatchObject({ kind: "conflict" });
    expect(calls.map(call => call.request.method)).toEqual(["GET", "GET"]);
  });

  it("envía PATCH con PrecioUpdateRequest y no reenvía la mutación", async () => {
    let responses = 0;
    const { repository, request, calls } = setup(async () =>
      jsonResponse(
        responses++ === 0
          ? skuPrice()
          : skuPrice({ precio_regular: 13.2, price_version: 5 }),
      ),
    );
    await repository.readEditable(
      { targetId: variant.id, channel: "global" },
      new AbortController().signal,
    );
    const saved = await repository.update(change(), new AbortController().signal);
    const patchCall = calls.at(-1);
    if (!patchCall) throw new Error("No se envió PATCH.");
    const sent = JSON.parse(String(patchCall.request.body ?? "{}"));

    expect(patchCall.request.method).toBe("PATCH");
    expect(patchCall.path).toBe("/api/v1/precios/skus/SKU%2FA");
    expect(sent).toEqual({
      precioRegular: 13.2,
      accionPrecioOferta: "ELIMINAR",
      moneda: "COP",
      motivoCambio: "Corrección comercial",
      priceVersion: 4,
      channelId: null,
      precioOferta: null,
    });
    expect(saved.version).toBe(5);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("notifica la auditoría demo solo después de confirmar PATCH y no pierde el precio si falla", async () => {
    let responses = 0;
    const onUpdated = vi.fn(() => {
      throw new Error("registro simulado no disponible");
    });
    const { repository, request } = setup(
      async () =>
        jsonResponse(
          responses++ === 0
            ? skuPrice()
            : skuPrice({ precio_regular: 13.2, price_version: 5 }),
        ),
      { onUpdated },
    );
    const signal = new AbortController().signal;
    await repository.readEditable({ targetId: variant.id, channel: "global" }, signal);
    const saved = await repository.update(change(), signal);

    expect(saved.version).toBe(5);
    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(onUpdated).toHaveBeenCalledWith(
      variant,
      expect.objectContaining({ regular: "12.5", version: 4 }),
      expect.objectContaining({ regular: "13.2", version: 5 }),
      "Corrección comercial",
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("consulta la versión propia del SKU y envía el canal canónico RETAIL en el PATCH", async () => {
    const { repository, calls } = setup(async (_path, request) =>
      jsonResponse(
        skuPrice({
          channel_id: "RETAIL",
          ...(request.method === "PATCH"
            ? { precio_regular: 13.2, price_version: 5 }
            : {}),
        }),
      ),
    );
    const retailTarget = { targetId: variant.id, channel: "retail" as const };
    const signal = new AbortController().signal;
    const before = await repository.readEditable(retailTarget, signal);
    expect(before).toMatchObject({ channel: "retail", version: 4 });
    await expect(
      repository.update(change({ target: retailTarget }), signal),
    ).resolves.toMatchObject({ channel: "retail", version: 5 });
    expect(calls.map(({ request }) => request.method)).toEqual(["GET", "PATCH"]);
    expect(firstCall(calls).path).toBe("/api/v1/precios/administracion/skus/SKU%2FA?channelId=RETAIL");
    expect(JSON.parse(String(firstCall(calls.slice(1)).request.body ?? "{}"))).toMatchObject({
      channelId: "RETAIL",
      priceVersion: 4,
    });
  });

  it("lee y envía Retail textual con la versión exacta del producto; un 409 no se reintenta", async () => {
    const { repository, calls } = setup(async (path, init) => init.method === "PATCH"
      ? jsonResponse({ code: "VERSION_CONFLICT" }, 409)
      : jsonResponse(productPrice({ channel_id: path.endsWith("channelId=RETAIL") ? "RETAIL" : null, price_version: 7 })));
    const signal = new AbortController().signal;
    const retailTarget = { targetId: product.id, channel: "retail" as const };
    await expect(repository.readEditable({ targetId: product.id, channel: "global" }, signal))
      .resolves.toMatchObject({ channel: "global", version: 7 });
    await expect(repository.readEditable(retailTarget, signal))
      .resolves.toMatchObject({ channel: "retail", version: 7, inherited: false });
    await expect(repository.update(change({ target: retailTarget, version: 7 }), signal))
      .rejects.toMatchObject({ kind: "conflict" });
    expect(calls.map(call => call.path)).toEqual([
      "/api/v1/precios/administracion/productos/product-a",
      "/api/v1/precios/administracion/productos/product-a?channelId=RETAIL",
      "/api/v1/precios/productos/product-a",
    ]);
    expect(JSON.parse(String(calls[2]!.request.body))).toMatchObject({ channelId: "RETAIL", priceVersion: 7 });
  });

  it.each([null, "MARKETPLACE"])(
    "deja el PATCH Retail sin confirmar cuando la respuesta indica canal %s",
    async (channelId) => {
      const onUpdated = vi.fn();
      const { repository, calls } = setup(
        async (_path, request) =>
          jsonResponse(
            request.method === "PATCH"
              ? skuPrice({
                  channel_id: channelId,
                  precio_regular: 13.2,
                  price_version: 5,
                })
              : skuPrice({ channel_id: "RETAIL" }),
          ),
        { onUpdated },
      );
      const target = { targetId: variant.id, channel: "retail" as const };
      const signal = new AbortController().signal;
      const update = change({ target });
      await repository.readEditable(target, signal);

      await expect(repository.update(update, signal)).rejects.toMatchObject({
        kind: "unknown",
        message: expect.stringContaining("La respuesta no confirma el cambio"),
      });
      await expect(repository.update(update, signal)).rejects.toMatchObject({
        kind: "unknown",
      });
      expect(calls.map(({ request }) => request.method)).toEqual(["GET", "PATCH"]);
      expect(onUpdated).not.toHaveBeenCalled();
    },
  );

  it("clasifica errores HTTP y solo interpreta los 404 contractuales como ausencia", async () => {
    for (const [status, code, kind] of [
      [400, "VALIDACION", "error"],
      [401, "TOKEN_INVALIDO", "unauthorized"],
      [403, "SCOPE_INSUFICIENTE", "forbidden"],
      [409, "VERSION_CONFLICT", "conflict"],
      [409, "VIGENCIA_SUPERPUESTA", "overlap"],
      [422, "PRECIO_INVALIDO", "error"],
      [500, "ERROR_INTERNO", "error"],
      [503, "SERVICIO_NO_DISPONIBLE", "error"],
    ] as const) {
      const { repository } = setup(async () =>
        jsonResponse({ status, code }, status),
      );
      await expect(
        repository.read(
          { targetId: variant.id, channel: "global" },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ kind });
    }

    const absent = setup(async () =>
      jsonResponse({ status: 404, code: "PRECIO_NO_ENCONTRADO" }, 404),
    );
    await expect(
      absent.repository.read(
        { targetId: variant.id, channel: "global" },
        new AbortController().signal,
      ),
    ).resolves.toBeNull();

    const missingSku = setup(async () =>
      jsonResponse({ status: 404, code: "SKU_NO_ENCONTRADO" }, 404),
    );
    await expect(
      missingSku.repository.read(
        { targetId: variant.id, channel: "global" },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(PricingFailure);
  });

  it("valida programación y meta de paginación sin perder versión ni alcance", async () => {
    const { repository, calls } = setup(async () =>
      jsonResponse({
        items: [
          {
            programacionId: "schedule-1",
            sku: variant.sku,
            tipoPrecio: "REGULAR",
            importe: 14,
            moneda: "COP",
            channelId: null,
            validFrom: "2026-11-01T00:00:00.000Z",
            validUntil: null,
            estado: "SCHEDULED",
            priceVersion: 5,
          },
        ],
        meta: { pagina: 2, tamanio: 20, total: 21, totalPaginas: 2 },
      }),
    );
    const page = await repository.listSchedules(
      variant.id,
      2,
      new AbortController().signal,
    );

    expect(firstCall(calls).path).toBe(
      "/api/v1/precios/skus/SKU%2FA/programaciones?pagina=2&tamanio=20",
    );
    expect(page).toMatchObject({
      page: 2,
      pageSize: 20,
      total: 21,
      items: [
        {
          targetId: variant.id,
          amount: "14",
          channel: "global",
          version: 5,
        },
      ],
    });
  });

  it("envía POST de programación con campos oficiales y sin versión", async () => {
    const { repository, calls } = setup(async (_path, init) =>
      init.method === "GET"
        ? jsonResponse({ items: [], meta: { pagina: 1, tamanio: 20, total: 0, totalPaginas: 0 } })
        : jsonResponse({
        programacionId: "schedule-2",
        sku: variant.sku,
        tipoPrecio: "OFERTA",
        importe: 10,
        moneda: "COP",
        channelId: "RETAIL",
        validFrom: "2026-10-20T15:00:00.000Z",
        validUntil: null,
        estado: "SCHEDULED",
        priceVersion: 5,
      }, 201),
    );
    await repository.schedule(
      variant.id,
      {
        kind: "OFERTA",
        amount: "10.00",
        currency: "COP",
        channel: "retail",
        start: "2026-10-20T10:00",
        end: "",
        reason: "Oferta de temporada",
      },
      new AbortController().signal,
    );
    expect(calls.map(({ request }) => request.method)).toEqual(["GET", "POST"]);
    const body = JSON.parse(String(calls[1]?.request.body ?? "{}"));
    expect(body).toEqual({
      tipoPrecio: "OFERTA",
      importe: 10,
      moneda: "COP",
      channelId: "RETAIL",
      validFrom: "2026-10-20T15:00:00.000Z",
      validUntil: null,
      motivoCambio: "Oferta de temporada",
    });
    expect(body).not.toHaveProperty("priceVersion");
  });

  it("envía el archivo en multipart y devuelve los errores publicados por fila", async () => {
    const { repository, calls } = setup(async () =>
      jsonResponse({
        valid: false,
        total_rows: 2,
        errors: [{ row_id: "3", sku: "SKU-A", status: "FAILED", code: "VERSION_CONFLICT" }],
      }),
    );
    const file = new File(["sample"], "sample.csv", { type: "text/csv" });
    const signal = new AbortController().signal;
    await expect(repository.prevalidate({ file, allowPartial: true }, signal)).resolves.toEqual({
      valid: false,
      total: 2,
      errors: [{ id: "3", sku: "SKU-A", status: "FAILED", code: "VERSION_CONFLICT", detail: null }],
    });
    const call = firstCall(calls);
    expect(call.path).toBe("/api/v1/precios/importaciones/prevalidar");
    expect(call.request).toMatchObject({ method: "POST", signal });
    expect(call.request.headers).toBeUndefined();
    expect(call.request.body).toBeInstanceOf(FormData);
    if (!(call.request.body instanceof FormData)) throw new Error("Se esperaba multipart.");
    expect([...call.request.body.entries()]).toEqual([["archivo", file]]);
    expect(calls).toHaveLength(1);
  });

  it.each([
    [401, "TOKEN_INVALIDO", "unauthorized"],
    [403, "SCOPE_INSUFICIENTE", "forbidden"],
    [413, "ARCHIVO_EXCEDE_LIMITE", "error"],
    [422, "PLANTILLA_INCOMPATIBLE", "error"],
    [503, "SERVICIO_NO_DISPONIBLE", "error"],
  ])("propaga el rechazo de prevalidación HTTP %s sin sustituirlo por datos locales", async (status, code, kind) => {
    const { repository, request } = setup(async () => jsonResponse({ code }, status));
    await expect(
      repository.prevalidate(
        { file: new File(["sample"], "sample.csv"), allowPartial: false },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("envía multipart autenticado y conserva la intención cuando Gateway rechaza la sesión", async () => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("navigator", {
      locks: { request: async (name: string, _options: LockOptions, handle: LockGrantedCallback<unknown>) =>
        handle({ name, mode: "exclusive" }) },
    });
    const session = {
      getAccessToken: vi.fn(async () => "expired-token"),
      refreshAccessToken: vi.fn(async () => "refreshed-token"),
      invalidateAccessToken: vi.fn(),
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException("Solicitud expirada", "TimeoutError"))
      .mockImplementation(async () => jsonResponse({ code: "TOKEN_INVALIDO" }, 401));
    const repository = createHttpPricingRepository({
      transport: createAuthenticatedGatewayClient("https://gateway.example", session, fetcher),
      scopeId: () => "actor",
      canManagePricing: () => true,
      listCatalogTargets: async () => [],
    });
    const input = { file: new File(["sku\nSKU-A\n"], "precios.csv"), allowPartial: false };
    const admission = repository.importAdmission!;
    const signal = new AbortController().signal;
    await expect(admission.submit(input, signal)).rejects.toMatchObject({ kind: "unknown" });
    const pending = admission.recovery()?.pending;
    if (!pending) throw new Error("Se esperaba una intención recuperable.");
    expect(pending.key).toMatch(/^[0-9a-f-]{36}$/);
    fetcher.mockClear();

    await expect(admission.submit(input, signal, pending.key))
      .rejects.toMatchObject({ kind: "unauthorized" });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://gateway.example/api/v1/precios/importaciones");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer expired-token");
    expect(headers.get("Idempotency-Key")).toBe(pending.key);
    expect(headers.has("Content-Type")).toBe(false);
    expect(init?.body).toBeInstanceOf(FormData);
    if (!(init?.body instanceof FormData)) throw new Error("Se esperaba multipart.");
    expect([...init.body.entries()]).toEqual([["archivo", input.file], ["allow_partial", "false"]]);
    expect(session.invalidateAccessToken).toHaveBeenCalledWith("expired-token");
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
    expect(admission.recovery()?.pending).toEqual(pending);
  });

  it.each([
    { valid: true, total_rows: "1", errors: [] },
    { valid: false, total_rows: 1, errors: [] },
    { valid: false, total_rows: 1, errors: [{ row_id: "2", status: "PENDING" }] },
  ])("rechaza una prevalidación incompatible con el contrato", async (dto) => {
    const { repository } = setup(async () => jsonResponse(dto));
    await expect(repository.prevalidate(
      { file: new File(["sample"], "sample.csv"), allowPartial: false },
      new AbortController().signal,
    )).rejects.toThrow("respuesta incompatible");
  });

  it("mapea lotes reales y obtiene el CSV desde el endpoint de reporte", async () => {
    const batch = setup(async () =>
      jsonResponse({
        batch_id: "batch-1",
        status: "PARTIAL",
        allow_partial: true,
        total_rows: 2,
        completed_rows: 1,
        failed_rows: 1,
        rows: [
          {
            row_id: "row-1",
            sku: "SKU-A",
            status: "COMPLETED",
            code: null,
          },
          { row_id: "row-2", sku: null, status: "FAILED", code: "PRECIO_INVALIDO" },
        ],
      }),
    );
    const result = await batch.repository.readBatch(
      "batch-1",
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      id: "batch-1",
      status: "PARTIAL",
      total: 2,
      completed: 1,
      failed: 1,
      rows: [
        { id: "row-1", sku: "SKU-A", status: "COMPLETED" },
        { id: "row-2", sku: null, status: "FAILED", code: "PRECIO_INVALIDO" },
      ],
    });

    const report = setup(async () =>
      new Response("sku,status\nSKU-A,COMPLETED\n", {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8" },
      }),
    );
    const file = await report.repository.report(
      "batch-1",
      new AbortController().signal,
    );
    expect(firstCall(report.calls).path).toBe(
      "/api/v1/precios/importaciones/batch-1/reporte",
    );
    expect(await file.data.text()).toContain("SKU-A,COMPLETED");
    expect(file.filename).toBe("reporte-precios.csv");
  });

  it("propaga AbortSignal y no reintenta escrituras de resultado incierto", async () => {
    const controller = new AbortController();
    const read = setup(async (_path, request) => {
      expect(request.signal).toBe(controller.signal);
      return jsonResponse(productPrice());
    });
    await read.repository.read(
      { targetId: product.id, channel: "global" },
      controller.signal,
    );

    let requests = 0;
    const onUpdated = vi.fn();
    const write = setup(async () => {
      if (requests++ === 0) return jsonResponse(skuPrice());
      throw new Error("timeout");
    }, { onUpdated });
    const signal = new AbortController().signal;
    await write.repository.readEditable(
      { targetId: variant.id, channel: "global" },
      signal,
    );
    await expect(
      write.repository.update(change(), signal),
    ).rejects.toMatchObject({ kind: "unknown" });
    await expect(
      write.repository.update(change(), signal),
    ).rejects.toMatchObject({ kind: "unknown" });
    expect(write.request).toHaveBeenCalledTimes(2);
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("rechaza importes que no caben en el contrato sin redondearlos", () => {
    expect(requestMoney("12.30")).toBe(12.3);
    expect(() => requestMoney("12.345")).toThrow(PricingFailure);
    expect(() => requestMoney("10000000000.00")).toThrow(PricingFailure);
  });
});
