import { afterEach, expect, it, vi } from "vitest";
import { createCatalogHttp } from "../catalog/adapters/catalogHttp";
import { CatalogError } from "../catalog/services/catalogRepository";

afterEach(() => vi.restoreAllMocks());

it("explica SKU duplicado sin perder el código para soporte", async () => {
  const read = createCatalogHttp({ request: async () => Response.json({ code: "SKU_DUPLICADO" }, { status: 409 }) });
  await expect(read("/productos", "POST", {})).rejects.toMatchObject({ kind: "duplicate_sku", message: expect.stringContaining("Ese SKU ya está registrado"), details: { code: "SKU_DUPLICADO", status: "409" } });
});

it("PRO-01 / PRI-04 respeta Retry-After sin reenviar lecturas durante el plazo", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  const send = vi.fn().mockResolvedValueOnce(Response.json({ status: 429 }, {
    status: 429, headers: { "Retry-After": "2", "X-Correlation-Id": "test-correlation" },
  })).mockResolvedValue(Response.json({ items: [] }));
  const read = createCatalogHttp({ request: send });
  await expect(read("/productos")).rejects.toMatchObject({ kind: "server", details: { status: "429", retryAfterMs: "2000" } });
  now.mockReturnValue(2000);
  await expect(read("/productos")).rejects.toThrow("Espera 1 segundo");
  expect(send).toHaveBeenCalledTimes(1);
  now.mockReturnValue(3100);
  await expect(read("/productos")).resolves.toEqual({ items: [] });
  expect(send).toHaveBeenCalledTimes(2);
});

it.each([401, 403, 503])("presenta mensaje amable para %s y conserva diagnóstico estructurado", async status => {
  const read = createCatalogHttp({ request: async () => Response.json({ code: status === 403 ? "SCOPE_INSUFICIENTE" : "TOKEN_INVALIDO" }, {
    status, headers: { "X-Correlation-Id": "test-correlation" },
  }) });
  const error = await read("/productos").catch(failure => failure);
  expect(error).toBeInstanceOf(CatalogError);
  if (!(error instanceof CatalogError)) throw error;
  expect(error.message).not.toMatch(/SCOPE_INSUFICIENTE|TOKEN_INVALIDO|HTTP/);
  expect(error.details).toMatchObject({ status: String(status), correlationId: "test-correlation" });
});
