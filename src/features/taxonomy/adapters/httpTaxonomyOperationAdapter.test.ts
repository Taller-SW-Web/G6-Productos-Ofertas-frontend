import { describe, it, expect, vi } from "vitest";
import { getTaxonomyOperation } from "./httpTaxonomyOperationAdapter";
import type { TaxonomyGatewayTransport } from "./httpProductTypeAdapter";

describe("consulta de operaciones", () => {
  it.each(["PENDING_DEACTIVATION", "COMPLETED", "REJECTED"])("acepta %s y campos nulos", async status => {
    const request = vi.fn().mockResolvedValue(Response.json({ operation_id: "op", status, result: null, code: null }));
    const operation = await getTaxonomyOperation({ request } as TaxonomyGatewayTransport, "op", new AbortController().signal);
    expect(operation).toMatchObject({ operationId: "op", status, result: null, code: null });
    expect(request.mock.calls[0]?.[0]).toBe("/api/v1/taxonomia/operaciones/op");
  });
  it("rechaza una respuesta de otra operación", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ operation_id: "otro", status: "COMPLETED", result: null, code: null }));
    await expect(getTaxonomyOperation({ request } as TaxonomyGatewayTransport, "op", new AbortController().signal)).rejects.toThrow("inválida");
  });
});
