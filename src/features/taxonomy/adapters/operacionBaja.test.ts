import { describe, expect, it, vi } from "vitest";
import { createHttpBrandRepository, createHttpCategoryRepository } from "./httpTaxonomyAdmin";

describe("DTO de seguimiento de baja", () => {
  it.each([
    ["PENDING_DEACTIVATION", "pendiente"],
    ["COMPLETED", "confirmada"],
    ["REJECTED", "rechazada"],
  ] as const)("categoría: %s con result y code nulos", async (status, esperado) => {
    const requestWithInit = vi.fn().mockResolvedValue(Response.json({ operation_id: "op-1", entity_type: "CATEGORY", entity_id: "cat-1", status, result: null, code: null }));
    const repo = createHttpCategoryRepository({ request: vi.fn(), requestWithInit });
    await expect(repo.consultarEstadoOperacion("op-1")).resolves.toMatchObject({ estado: esperado, operacionId: "op-1" });
    expect(requestWithInit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["PENDING_DEACTIVATION", "pendiente"],
    ["COMPLETED", "exito"],
    ["REJECTED", "rechazada"],
  ] as const)("marca: %s con result y code nulos", async (status, esperado) => {
    const requestWithInit = vi.fn().mockResolvedValue(Response.json({ operation_id: "op-1", entity_type: "BRAND", entity_id: "brand-1", status, result: null, code: null }));
    const repo = createHttpBrandRepository({ request: vi.fn(), requestWithInit });
    await expect(repo.consultarResultadoBaja("op-1")).resolves.toMatchObject({ resultado: esperado, operacionId: "op-1" });
  });

  it("rechaza un DTO de otra operación o entidad", async () => {
    const requestWithInit = vi.fn().mockResolvedValue(Response.json({ operation_id: "otra", entity_type: "BRAND", status: "COMPLETED", result: null, code: null }));
    const repo = createHttpCategoryRepository({ request: vi.fn(), requestWithInit });
    await expect(repo.consultarEstadoOperacion("op-1")).rejects.toThrow(/inválida/);
  });

  it("no trata CLEAR como estado terminal", async () => {
    const requestWithInit = vi.fn().mockResolvedValue(Response.json({ operation_id: "op-1", entity_type: "CATEGORY", status: "CLEAR", result: "CLEAR", code: null }));
    const repo = createHttpCategoryRepository({ request: vi.fn(), requestWithInit });
    await expect(repo.consultarEstadoOperacion("op-1")).rejects.toThrow(/inválida/);
  });
});
