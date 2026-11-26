import { expect, it, vi } from "vitest";
import { createHttpProductTypeAdminAdapter } from "./httpProductTypeAdminAdapter";

it.each([undefined, null, "false"])("rechaza obligatoriedad inválida %s sin inventar false", async (obligatoria) => {
  const requestWithInit = vi.fn()
    .mockResolvedValueOnce(Response.json({ tipoProductoId: "tipo-1" }))
    .mockResolvedValueOnce(Response.json({
      tipoProducto: { tipoProductoId: "tipo-1", nombre: "Tipo", estado: "ACTIVO" },
      schemaVersion: 1,
      caracteristicas: [{ caracteristicaId: "atributo-1", obligatoria, estado: "ACTIVO", schemaVersion: 1 }],
    }));
  const repo = createHttpProductTypeAdminAdapter({ request: vi.fn(), requestWithInit });
  await expect(repo.obtener("tipo-1")).rejects.toThrow(/inválida/);
});
