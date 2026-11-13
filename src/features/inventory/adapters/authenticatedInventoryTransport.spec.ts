import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedInventoryTransport } from "./authenticatedInventoryTransport";
import type { G7Session } from "../../promotions/adapters/g7Session";

function createMockSession(token = "valid-token"): G7Session {
  return {
    login: vi.fn(),
    logout: vi.fn(),
    submitOtp: vi.fn(),
    resendOtp: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    snapshot: vi.fn(() => ({
      user: { id: "user-1", nombreCompleto: "Test User", correo: "test@example.com", roles: ["admin"] },
      mfa: false,
      busy: false,
      notice: "",
      expiresAt: Date.now() + 3600000,
    })),
    getAccessToken: vi.fn(async () => token),
    refreshAccessToken: vi.fn(async () => "refreshed-token"),
    invalidateAccessToken: vi.fn(),
  } as unknown as G7Session;
}

describe("authenticatedInventoryTransport", () => {
  it("rechaza orígenes inválidos con credenciales o rutas", () => {
    expect(() =>
      createAuthenticatedInventoryTransport("http://user:pass@localhost:3000", null),
    ).toThrow("VITE_GATEWAY_ORIGIN");

    expect(() =>
      createAuthenticatedInventoryTransport("https://gateway.example.com/api", null),
    ).toThrow("VITE_GATEWAY_ORIGIN");

    expect(() =>
      createAuthenticatedInventoryTransport("ftp://localhost:3000", null),
    ).toThrow("VITE_GATEWAY_ORIGIN");
  });

  it("permite llamadas sin sesión (modo demo sin auth)", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    const transport = createAuthenticatedInventoryTransport("http://localhost:3000", null, fetcher);

    const res = await transport.request("/api/v1/inventario/dashboard", { method: "GET" });
    expect(res.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/inventario/dashboard",
      expect.objectContaining({
        method: "GET",
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }),
    );
  });

  it("adjunta Bearer token cuando la sesión está presente", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    const session = createMockSession("jwt-abc-123");
    const transport = createAuthenticatedInventoryTransport("http://localhost:3000", session, fetcher);

    const res = await transport.request("/api/v1/inventario/umbrales", { method: "GET" });
    expect(res.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/inventario/umbrales",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer jwt-abc-123",
        }),
      }),
    );
  });

  it("renueva y reintenta ante 401 TOKEN_INVALIDO en GET", async () => {
    let callCount = 0;
    const fetcher = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ code: "TOKEN_INVALIDO" }), { status: 401 });
      }
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    });

    const session = createMockSession("initial-token");
    const transport = createAuthenticatedInventoryTransport("http://localhost:3000", session, fetcher);

    const res = await transport.request("/api/v1/inventario/umbrales", { method: "GET" });
    expect(res.status).toBe(200);
    expect(session.refreshAccessToken).toHaveBeenCalledWith("initial-token", expect.anything());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("no reintenta automáticamente escrituras (POST/PUT) ante 401 para evitar dobles efectos", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ code: "TOKEN_INVALIDO" }), { status: 401 }),
    );
    const session = createMockSession("initial-token");
    const transport = createAuthenticatedInventoryTransport("http://localhost:3000", session, fetcher);

    const res = await transport.request("/api/v1/inventario/umbrales/global", {
      method: "PUT",
      body: JSON.stringify({ umbral_minimo: 10 }),
    });
    expect(res.status).toBe(401);
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
    expect(session.invalidateAccessToken).toHaveBeenCalledWith("initial-token");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

