import { describe, expect, it, vi } from "vitest";
import { solicitarBajaHttp } from "./httpTaxonomyDeactivationAdapter";
import type { TaxonomyGatewayTransport } from "./httpProductTypeAdapter";

describe("solicitud de baja", () => {
  it.each(["categorias", "marcas"] as const)("envía %s y conserva el identificador de admisión", async entity => {
    const request = vi.fn().mockResolvedValue(Response.json({operation_id:"op"}, {status:202}));
    expect(await solicitarBajaHttp({request} as TaxonomyGatewayTransport, entity,"id",new AbortController().signal)).toBe("op");
    expect(request).toHaveBeenCalledWith(`/api/v1/${entity}/id/desactivar`,expect.any(AbortSignal),undefined,{method:"POST"});
  });
  it("no trata una respuesta diferente a 202 como admisión", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({operation_id:"op"}));
    await expect(solicitarBajaHttp({request} as TaxonomyGatewayTransport,"marcas","id",new AbortController().signal)).rejects.toThrow("inesperada");
  });
});
