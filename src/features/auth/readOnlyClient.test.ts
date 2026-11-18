import { describe, expect, it, vi } from "vitest";
import { buildReadPath, createReadOnlyClient, isValidDateTime, type ReadSession } from "../reads/readOnlyClient";
import { readOperations } from "../reads/readOperations";
import { resolveGatewayOrigin, resolveG7ApiBase } from "../../app/config/gatewayOrigin";

const origin = "https://frontend.example.test";
function setup(responses: Response[] = [Response.json({ items: [] })]) {
  const session: ReadSession = {
    getAccessToken: vi.fn(async () => "test-access"),
    refreshAccessToken: vi.fn(async () => "test-renewed"),
    invalidateAccessToken: vi.fn(),
  };
  const fetcher = vi.fn<typeof fetch>(async () => responses.shift() ?? Response.json({ items: [] }));
  return { session, fetcher, client: createReadOnlyClient(origin, session, fetcher) };
}
const signal = () => new AbortController().signal;
describe("consultas contractuales de lectura", () => {
  it("registra las 58 lecturas externas de los ocho módulos sin el contexto SKU privado", () => {
    expect(readOperations).toHaveLength(58);
    expect(new Set(readOperations.map(item => item.module)).size).toBe(8);
    expect(readOperations.some(item => item.id === "obtenerContextoSku")).toBe(false);
    expect(() => buildReadPath("crearProducto", {})).toThrow("no está disponible");
  });
  it("valida campos requeridos, paginación y enum antes de enviar", () => {
    expect(() => buildReadPath("obtenerProducto", {})).toThrow("productoId");
    expect(() => buildReadPath("listarProductos", { tamanio: "101" })).toThrow("rango");
    expect(() => buildReadPath("listarProductos", { canal: "INVENTADO" })).toThrow("válido");
  });
  it("valida estrictamente parámetros date-time según RFC 3339 incluyendo zona horaria", () => {
    expect(isValidDateTime("2026-11-12T10:30:00Z")).toBe(true);
    expect(isValidDateTime("2026-11-12T10:30:00.250-05:00")).toBe(true);
    expect(isValidDateTime("2024-02-29T23:59:59+00:00")).toBe(true);
    expect(isValidDateTime("2026-11-12")).toBe(false);
    expect(isValidDateTime("2026-11-12T10:30:00")).toBe(false);
    expect(isValidDateTime("2026-11-12 10:30:00Z")).toBe(false);
    expect(isValidDateTime("2026-02-29T10:30:00Z")).toBe(false);
    expect(isValidDateTime("2026-11-12T24:00:00Z")).toBe(false);
    expect(isValidDateTime("2026-11-12T10:30:00+24:00")).toBe(false);
    expect(isValidDateTime("2026-11-12T10:30:00-00:00")).toBe(false);
    expect(() => buildReadPath("listarAuditoriaPrecios", { desde: "2026-11-12" })).toThrow("zona horaria");
    expect(() => buildReadPath("listarAuditoriaPrecios", { desde: "2026-11-12T10:30:00" })).toThrow("zona horaria");
    expect(() => buildReadPath("obtenerPrecioSku", { sku: "SKU-1", at: "2026-02-29T10:30:00Z" })).toThrow("zona horaria");
    expect(buildReadPath("obtenerPrecioSku", { sku: "SKU-1", at: "2026-11-12T10:30:00-05:00" })).toBe(
      "/api/v1/precios/skus/SKU-1?at=2026-11-12T10%3A30%3A00-05%3A00",
    );
  });
  it("codifica un SKU opaco y rechaza navegación a otra ruta", () => {
    expect(buildReadPath("obtenerPrecioSku", { sku: "SKU/A?x=1" })).toBe("/api/v1/precios/skus/SKU%2FA%3Fx%3D1");
    expect(() => buildReadPath("obtenerPrecioSku", { sku: ".." })).toThrow("identificador");
  });
  it("solo envía GET al origen configurado con la sesión y sin cookies ni redirecciones", async () => {
    const { client, fetcher } = setup();
    expect(await client.read("listarProductos", { pagina: "1" }, signal())).toEqual({ kind: "data", value: { items: [] } });
    expect(fetcher).toHaveBeenCalledWith(origin + "/api/v1/productos?pagina=1", expect.objectContaining({
      method: "GET", credentials: "omit", redirect: "error", cache: "no-store",
      headers: expect.objectContaining({ Authorization: "Bearer test-access" }),
    }));
  });
  it("sin sesión no envía solicitudes al backend", async () => {
    const { session, fetcher, client } = setup();
    vi.mocked(session.getAccessToken).mockResolvedValue(null);
    await expect(client.read("listarProductos", {}, signal())).rejects.toThrow("Inicia sesión");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("en el modo público existente mantiene la sesión de UI y no adjunta bearer al GET", async () => {
    const { session, fetcher } = setup();
    const client = createReadOnlyClient(origin, session, fetcher, { publicReadOnly: true });
    await client.read("listarProductos", { canal: "MARKETPLACE" }, signal());
    expect(session.getAccessToken).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Authorization");
  });
  it("en modo público exige elegir el canal comercial antes de consultar productos", async () => {
    const { session, fetcher } = setup();
    const client = createReadOnlyClient(origin, session, fetcher, { publicReadOnly: true });
    await expect(client.read("listarProductos", {}, signal())).rejects.toThrow("Selecciona el canal");
    expect(fetcher).not.toHaveBeenCalled();
    await client.read("listarProductos", { canal: "MARKETPLACE" }, signal());
    expect(fetcher).toHaveBeenCalledWith(origin + "/api/v1/productos?canal=MARKETPLACE", expect.objectContaining({ method: "GET" }));
  });
  it("una lectura pública denegada no intenta JWT ni cambia la sesión", async () => {
    const { session, fetcher } = setup([Response.json({ code: "TOKEN_INVALIDO" }, { status: 401 })]);
    const client = createReadOnlyClient(origin, session, fetcher, { publicReadOnly: true });
    await expect(client.read("listarProductos", { canal: "MARKETPLACE" }, signal())).rejects.toThrow("no está habilitada");
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
    expect(session.invalidateAccessToken).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("renueva una sola vez un GET rechazado con TOKEN_INVALIDO", async () => {
    const { session, fetcher, client } = setup([Response.json({ code: "TOKEN_INVALIDO" }, { status: 401 }), Response.json({ total: 1 })]);
    expect(await client.read("listarProductos", {}, signal())).toEqual({ kind: "data", value: { total: 1 } });
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("un 403 conserva la sesión y no reintenta ni expone detalles privados", async () => {
    const { session, fetcher, client } = setup([Response.json({ detail: "PRIVATE_DETAIL" }, { status: 403 })]);
    await expect(client.read("listarProductos", {}, signal())).rejects.toThrow("no tiene permiso");
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
    expect(session.invalidateAccessToken).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("un fallo de red o 503 no fabrica una colección vacía", async () => {
    const { client } = setup([Response.json({}, { status: 503 })]);
    await expect(client.read("listarProductos", {}, signal())).rejects.toThrow("HTTP 503");
  });
  it("una consulta cancelada no llega a la red", async () => {
    const { fetcher, client } = setup(); const controller = new AbortController(); controller.abort();
    await expect(client.read("listarProductos", {}, controller.signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rechaza HTML servido accidentalmente por el fallback SPA", async () => {
    const { client } = setup([new Response("<html>SPA</html>", { headers: { "content-type": "text/html" } })]);
    await expect(client.read("listarProductos", {}, signal())).rejects.toThrow("formato esperado");
  });
  it("valida el Content-Type de cada respuesta contra los formatos permitidos por la operación, incluido JSON", async () => {
    const { client: jsonOnCsvClient } = setup([Response.json({ unexpected: true })]);
    await expect(jsonOnCsvClient.read("descargarReporteImportacionPrecios", { batchId: "batch-1" }, signal())).rejects.toThrow("formato esperado");

    const { client: csvOnJsonClient } = setup([new Response("id,nombre\n1,test\n", { headers: { "content-type": "text/csv; charset=utf-8" } })]);
    await expect(csvOnJsonClient.read("listarProductos", { canal: "MARKETPLACE" }, signal())).rejects.toThrow("formato esperado");

    const { client: validCsvClient } = setup([new Response("fila,error\n2,duplicado\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="errores.csv"' } })]);
    const fileResult = await validCsvClient.read("descargarReporteImportacionPrecios", { batchId: "batch-1" }, signal());
    expect(fileResult.kind).toBe("file");
    if (fileResult.kind === "file") expect(fileResult.filename).toBe("errores.csv");
  });
  it("en Vercel utiliza el proxy al mismo origen y mantiene el destino explícito fuera de Vercel", () => {
    const azure = "https://api-gateway.calmgrass-aec0b33c.chilecentral.azurecontainerapps.io";
    expect(resolveGatewayOrigin(azure, { hostname: "fork.vercel.app", origin }, true)).toBe(origin);
    expect(resolveGatewayOrigin(azure, { hostname: "localhost", origin }, false)).toBe(azure);
    expect(resolveGatewayOrigin("https://otro.example.test", { hostname: "fork.vercel.app", origin }, true)).toBe("https://otro.example.test");
    expect(resolveG7ApiBase("https://g7-auth-service.onrender.com/api/v1", { hostname: "fork.vercel.app", origin }, true)).toBe(origin + "/g7/api/v1");
  });
  it("rechaza configuración inválida sin interrumpir la pantalla de acceso", () => {
    for (const value of ["http://gateway.example.test", "invalid", "https://user:secret@example.test"]) {
      expect(resolveGatewayOrigin(value, { hostname: "fork.vercel.app", origin }, true)).toBeUndefined();
      expect(resolveG7ApiBase(value, { hostname: "fork.vercel.app", origin }, true)).toBeUndefined();
    }
  });
});
