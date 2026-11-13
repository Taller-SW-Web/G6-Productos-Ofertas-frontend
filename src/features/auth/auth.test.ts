import { afterEach, describe, expect, it, vi } from "vitest";
import { loginDestination } from "../../app/routes/loginDestination";
import { AuthSessionContext } from "../../app/config/AuthSessionContext";
import { PromotionSessionContext } from "../../app/config/PromotionSessionContext";
import { createOptionalAuthSession } from "../../app/config/authSessionRuntime";
import { createPromotionSessionRuntime } from "../promotions/services/promotionSessionRuntime";
import { createAuthenticatedCatalogTransport } from "../catalog/adapters/authenticatedCatalogTransport";
import { canAdminister } from "./authorization";

afterEach(() => vi.restoreAllMocks());
describe("una sola sesión transversal", () => {
  it("conserva el mismo contexto y la misma instancia en Promociones", () => {
    expect(PromotionSessionContext).toBe(AuthSessionContext);
    const session = createOptionalAuthSession("https://g7.example.test/api/v1")!;
    expect(createPromotionSessionRuntime("https://gateway.example.test", "https://g7.example.test/api/v1", session).session).toBe(session);
  });
  it.each([undefined, "", "invalid", "http://remote.test", "https://user:secret@g7.test"])("configuración %s falla cerrada", base => {
    expect(createOptionalAuthSession(base)).toBeNull();
  });
});
describe("retorno a rutas registradas", () => {
  it.each([undefined, null, {}, "https://evil.test", "//evil.test", "/\\evil.test", "/login", "/demo/g6/productos", "/no-existe", "/%2f%2fevil.test"])("rechaza %s", value => {
    expect(loginDestination(value)).toBe("/precios");
  });
  it.each(["/productos", "/productos/nuevo", "/combos?vista=lista", "/precios/auditoria"])("conserva %s", value => {
    expect(loginDestination(value)).toBe(value);
  });
});
const dto = (version = 1) => ({
  accessToken: `eyJhbGciOiJSUzI1NiJ9.payload.signature${version}`,
  refreshToken: `isolated-refresh-${version}`, tokenType: "Bearer", expiresIn: 900,
  usuario: { id: "11111111-1111-4111-8111-111111111111", nombreCompleto: "Prueba", correo: "test@example.test", roles: ["GESTOR_COMERCIAL"] },
});

describe.each(["Catálogo", "Promociones"])("%s después de renovar", feature => {
  it.each([
    { name: "401 desconocido", status: 401, body: { code: "DESCONOCIDO" }, retainsSession: true },
    { name: "401 ilegible", status: 401, body: "<html>", retainsSession: true },
    { name: "403", status: 403, body: { code: "SCOPE_INSUFICIENTE" }, retainsSession: true },
    { name: "401 TOKEN_INVALIDO", status: 401, body: { code: "TOKEN_INVALIDO" }, retainsSession: false },
  ])("A03/A05 clasifica el segundo $name", async ({ status, body, retainsSession }) => {
    const authorization: (string | null)[] = [];
    let refreshes = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/auth/login")) return Response.json(dto());
      if (path.endsWith("/auth/refresh")) {
        refreshes++;
        return Response.json(dto(2));
      }
      authorization.push(new Headers(init?.headers).get("Authorization"));
      if (authorization.length === 1) return Response.json({ code: "TOKEN_INVALIDO" }, { status: 401 });
      return typeof body === "string" ? new Response(body, { status }) : Response.json(body, { status });
    });
    const session = createOptionalAuthSession("https://g7.example.test/api/v1")!;
    await session.login("test@example.test", "password");
    const origin = "https://gateway.example.test";
    const signal = new AbortController().signal;
    if (feature === "Catálogo") {
      const transport = createAuthenticatedCatalogTransport(origin, session);
      const response = await transport.request("/api/v1/productos", { method: "GET", signal, headers: {} });
      expect(response.status).toBe(status);
      expect(await response.text()).toBe(typeof body === "string" ? body : JSON.stringify(body));
    } else {
      const { services } = createPromotionSessionRuntime(origin, "https://g7.example.test/api/v1", session);
      await expect(services.coupons.list({ status: "all", page: 1, pageSize: 10 }, signal)).rejects.toMatchObject({
        kind: status === 403 ? "forbidden" : "session",
      });
    }
    expect(refreshes).toBe(1);
    expect(authorization).toEqual([`Bearer ${dto().accessToken}`, `Bearer ${dto(2).accessToken}`]);
    expect(session.snapshot().user !== null).toBe(retainsSession);
  });
});

it("R4-05 inicia revocación antes de notificar logout y limpia sin esperar respuesta", async () => {
  let started = false, startedWhenCleared = false;
  let finish: (value: Response) => void = () => {};
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    if (String(input).endsWith("/auth/login")) return Response.json(dto());
    started = true;
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  const session = createOptionalAuthSession("https://g7.example.test/api/v1")!;
  await session.login("test@example.test", "password");
  session.subscribe(() => { if (!session.snapshot().user) startedWhenCleared = started; });
  const logout = session.logout();
  expect(session.snapshot().user).toBeNull();
  finish(new Response(null, { status: 500 }));
  await logout;
  expect(startedWhenCleared).toBe(true);
  expect(session.snapshot().user).toBeNull();
});
describe("Catálogo consume la sesión existente sin repetir escrituras", () => {
  it.each([null, { code: "DESCONOCIDO" }, "respuesta ilegible"])("401 desconocido conserva sesión: %s", async body => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async input => String(input).endsWith("/auth/login") ? Response.json(dto()) : typeof body === "string" ? new Response(body, { status: 401, headers: { "Content-Type": "text/html" } }) : Response.json(body, { status: 401 }));
    const session = createOptionalAuthSession("https://g7.example.test")!;
    await session.login("test@example.test", "password");
    await createAuthenticatedCatalogTransport("https://gateway.example.test", session).request("/api/v1/productos", { method: "GET", signal: new AbortController().signal, headers: {} });
    expect(session.snapshot().user).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["GET", "POST", "PATCH"] as const)("401 en %s", async method => {
    let reads = 0;
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith("/auth/login")) return Response.json(dto());
      if (path.endsWith("/auth/refresh")) return Response.json(dto(2));
      reads++;
      return reads === 1 ? Response.json({ code: "TOKEN_INVALIDO" }, { status: 401 }) : Response.json({ items: [] });
    });
    const session = createOptionalAuthSession("https://g7.example.test/api/v1")!;
    await session.login("test@example.test", "password");
    const transport = createAuthenticatedCatalogTransport("https://gateway.example.test", session);
    const response = await transport.request("/api/v1/productos", { method, signal: new AbortController().signal, headers: {} });
    expect(reads).toBe(method === "GET" ? 2 : 1);
    expect(response.status).toBe(method === "GET" ? 200 : 401);
    expect(session.snapshot().user !== null).toBe(method === "GET");
    const requests = fetcher.mock.calls.filter(([url]) => String(url).includes("gateway"));
    expect(requests[0]?.[1]?.headers).toMatchObject({ Authorization: `Bearer ${dto().accessToken}` });
  });
  it("403 conserva sesión y no renueva ni repite", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async input => String(input).endsWith("/auth/login") ? Response.json(dto()) : Response.json({ code: "SCOPE_INSUFICIENTE" }, { status: 403 }));
    const session = createOptionalAuthSession("https://g7.example.test")!;
    await session.login("test@example.test", "password");
    const response = await createAuthenticatedCatalogTransport("https://gateway.example.test", session).request("/api/v1/productos", { method: "GET", signal: new AbortController().signal, headers: {} });
    expect(response.status).toBe(403);
    expect(session.snapshot().user).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("política comercial publicada", () => {
  it.each([[], ["CLIENTE"], ["ADMIN_SISTEMA"], ["VENDEDOR"]].map(roles => ({ roles })))("deniega roles $roles", ({ roles }) => {
    expect(canAdminister({ ...dto().usuario, roles })).toBe(false);
  });
  it("admite GESTOR_COMERCIAL y reevalúa cambios de rol", () => {
    expect(canAdminister(dto().usuario)).toBe(true);
    expect(canAdminister({ ...dto().usuario, roles: ["CLIENTE"] })).toBe(false);
    expect(canAdminister(null)).toBe(false);
  });
});
