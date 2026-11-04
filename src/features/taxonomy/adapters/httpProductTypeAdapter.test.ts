import { describe, expect, it, vi } from "vitest";
import { createHttpProductTypeAdapter } from "./httpProductTypeAdapter";

describe("listado HTTP de tipos de producto", () => {
  it("mapea páginas reales sin inventar conteos ni límites", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                tipoProductoId: "id",
                nombre: "Calzado",
                estado: "ACTIVO",
                schemaVersion: 2,
              },
            ],
            meta: { totalPaginas: 1 },
          }),
          { status: 200 },
        ),
      );
    const result = await createHttpProductTypeAdapter({ request }).list();
    expect(request).toHaveBeenCalledWith(
      "/api/v1/tipos-producto?pagina=1&tamanio=200",
      expect.any(AbortSignal),
    );
    expect(result.items).toEqual([
      {
        tipoProductoId: "id",
        nombre: "Calzado",
        estado: "Activo",
        schemaVersion: 2,
        caracteristicasAsignadas: null,
        limiteCaracteristicas: null,
      },
    ]);
  });
  it.each([401, 403, 500])(
    "propaga el fallo HTTP %s sin mock",
    async (status) => {
      const adapter = createHttpProductTypeAdapter({
        request: async () => new Response(null, { status }),
      });
      await expect(adapter.list()).rejects.toThrow(`HTTP ${status}`);
    },
  );
  it("propaga fallo de red y falla cerrada en operaciones no implementadas", async () => {
    const adapter = createHttpProductTypeAdapter({
      request: async () => {
        throw new Error("Sin red");
      },
    });
    await expect(adapter.list()).rejects.toThrow("Sin red");
    await expect(adapter.desactivar("id")).rejects.toThrow(
      "no está disponible",
    );
  });
});
