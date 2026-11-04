import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpProductTypeAdapter } from "./httpProductTypeAdapter";

const row = (
  tipoProductoId: string,
  estado = "ACTIVO",
): Record<string, unknown> => ({
  tipoProductoId,
  nombre: `Tipo ${tipoProductoId}`,
  estado,
  schemaVersion: 2,
});

const response = (
  items: unknown[],
  pagina: number,
  total: number,
  totalPaginas = Math.ceil(total / 100),
) =>
  new Response(
    JSON.stringify({
      items,
      meta: { pagina, tamanio: 100, total, totalPaginas },
    }),
    { status: 200 },
  );

afterEach(() => vi.useRealTimers());

describe("listado HTTP de tipos de producto", () => {
  it("recorre todas las páginas con el tamaño contractual y una correlación estable", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      row(`uno-${index}`),
    );
    const calls: Array<[string, AbortSignal, string]> = [];
    const request = vi.fn(
      async (path: string, signal: AbortSignal, correlationId: string) => {
        calls.push([path, signal, correlationId]);
        return calls.length === 1
          ? response(firstPage, 1, 101, 2)
          : response([row("dos")], 2, 101, 2);
      },
    );
    const result = await createHttpProductTypeAdapter({ request }).list();

    expect(request).toHaveBeenCalledTimes(2);
    expect(calls.map(([path]) => path)).toEqual([
      "/api/v1/tipos-producto?pagina=1&tamanio=100",
      "/api/v1/tipos-producto?pagina=2&tamanio=100",
    ]);
    const [firstCall, secondCall] = calls;
    if (!firstCall || !secondCall)
      throw new Error("La prueba requiere las dos peticiones paginadas.");
    expect(firstCall[1]).toBeInstanceOf(AbortSignal);
    expect(firstCall[2]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(secondCall[2]).toBe(firstCall[2]);
    expect(result.items).toHaveLength(101);
    expect(result.items.at(-1)?.tipoProductoId).toBe("dos");
    expect(result.limite).toBeNull();
    expect(result.items[0]).toMatchObject({
      caracteristicasAsignadas: null,
      limiteCaracteristicas: null,
    });
  });

  it("acepta una lista vacía contractual", async () => {
    const adapter = createHttpProductTypeAdapter({
      request: async () => response([], 1, 0, 0),
    });
    await expect(adapter.list()).resolves.toEqual({ items: [], limite: null });
  });

  it.each([
    ["ACTIVO", "Activo"],
    ["INACTIVO", "Inactivo"],
  ])("mapea estado contractual %s", async (input, expected) => {
    const adapter = createHttpProductTypeAdapter({
      request: async () => response([row("estado", input)], 1, 1, 1),
    });
    const result = await adapter.list();
    expect(result.items[0]?.estado).toBe(expected);
  });

  it("rechaza PENDING_DEACTIVATION porque no pertenece a TipoProductoAdmin.estado", async () => {
    const adapter = createHttpProductTypeAdapter({
      request: async () => response([row("pendiente", "PENDING_DEACTIVATION")], 1, 1, 1),
    });
    await expect(adapter.list()).rejects.toThrow(
      "Respuesta de Taxonomía inválida.",
    );
  });

  it.each([
    { items: [], meta: { pagina: 1, tamanio: 100, total: 1, totalPaginas: 1 } },
    {
      items: [row("mal", "BORRADOR")],
      meta: { pagina: 1, tamanio: 100, total: 1, totalPaginas: 1 },
    },
    {
      items: [row("mal")],
      meta: { pagina: 2, tamanio: 100, total: 1, totalPaginas: 1 },
    },
    {
      items: [row("mal")],
      meta: { pagina: 1, tamanio: 200, total: 1, totalPaginas: 1 },
    },
  ])("rechaza DTO o metadata inválidos", async (body) => {
    const adapter = createHttpProductTypeAdapter({
      request: async () =>
        new Response(JSON.stringify(body), { status: 200 }),
    });
    await expect(adapter.list()).rejects.toThrow("Respuesta de Taxonomía inválida.");
  });

  it("rechaza JSON ilegible y metadata cambiante entre páginas", async () => {
    const invalidJson = createHttpProductTypeAdapter({
      request: async () => new Response("no es json", { status: 200 }),
    });
    await expect(invalidJson.list()).rejects.toThrow(
      "Respuesta de Taxonomía inválida.",
    );

    const changingMeta = createHttpProductTypeAdapter({
      request: vi
        .fn()
        .mockResolvedValueOnce(response([row("uno")], 1, 101, 2))
        .mockResolvedValueOnce(response([row("dos")], 2, 102, 2)),
    });
    await expect(changingMeta.list()).rejects.toThrow(
      "Respuesta de Taxonomía inválida.",
    );
  });

  it.each([401, 403, 500, 503])(
    "propaga HTTP %s sin usar fixtures",
    async (status) => {
      const request = vi.fn(async () => new Response(null, { status }));
      const adapter = createHttpProductTypeAdapter({ request });
      await expect(adapter.list()).rejects.toThrow(`HTTP ${status}`);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it("muestra un fallo de red sanitizado y mantiene bloqueadas otras operaciones API", async () => {
    const adapter = createHttpProductTypeAdapter({
      request: async () => {
        throw new TypeError("detalle privado de red");
      },
    });
    await expect(adapter.list()).rejects.toThrow(
      "No se pudo conectar con el servicio de Taxonomía.",
    );
    await expect(adapter.desactivar("id")).rejects.toThrow("no está disponible");
  });

  it("propaga cancelación del consumidor", async () => {
    const controller = new AbortController();
    const request = vi.fn(
      (_path: string, signal: AbortSignal) =>
        new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("cancelada", "AbortError")),
            { once: true },
          );
        }),
    );
    const pending = createHttpProductTypeAdapter({ request }).list(
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("falla visiblemente al vencer el timeout de red", async () => {
    const request = vi.fn(
      (_path: string, signal: AbortSignal) =>
        new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(signal.reason),
            { once: true },
          );
        }),
    );
    const pending = createHttpProductTypeAdapter({ request }, 1).list();
    await expect(pending).rejects.toThrow("excedió el tiempo de espera");
  });
});
