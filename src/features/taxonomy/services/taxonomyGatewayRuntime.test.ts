import { describe, expect, it, vi } from "vitest";
import {
  createAuthenticatedTaxonomyGateway,
  TaxonomyGatewayError,
  TaxonomySessionRequiredError,
  type TaxonomySession,
} from "./taxonomyGatewayRuntime";

function session(overrides: Partial<TaxonomySession> = {}): TaxonomySession {
  return {
    getAccessToken: vi.fn().mockResolvedValue("old-token"),
    refreshAccessToken: vi.fn().mockResolvedValue("new-token"),
    invalidateAccessToken: vi.fn(),
    ...overrides,
  };
}

describe("transporte autenticado de Taxonomía", () => {
  it.each([401, 403])("R4-03 preserva sesión ante segundo HTTP %i desconocido", async status => {
    const auth = session();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "TOKEN_INVALIDO" }, { status: 401 }))
      .mockResolvedValueOnce(new Response("ilegible", { status }));
    await expect(createAuthenticatedTaxonomyGateway("https://gateway.example", auth, fetcher).request("/api/v1/tipos-producto", new AbortController().signal)).rejects.toMatchObject({ status });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(auth.invalidateAccessToken).not.toHaveBeenCalled();
  });
  it("R4-03 invalida explícitamente el token renovado rechazado por TOKEN_INVALIDO", async () => {
    const invalidateAccessToken = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ code: "TOKEN_INVALIDO" }, { status: 401 }));
    const auth = { ...session(), invalidateAccessToken };
    await expect(createAuthenticatedTaxonomyGateway("https://gateway.example", auth, fetcher).request("/api/v1/tipos-producto", new AbortController().signal)).rejects.toBeInstanceOf(TaxonomyGatewayError);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(invalidateAccessToken).toHaveBeenCalledExactlyOnceWith("new-token");
  });
  it("falla cerrado cuando no existe sesión", async () => {
    const fetcher = vi.fn();
    const gateway = createAuthenticatedTaxonomyGateway(
      "https://gateway.example",
      session({ getAccessToken: vi.fn().mockResolvedValue(null) }),
      fetcher,
    );
    await expect(
      gateway.request("/api/v1/tipos-producto", new AbortController().signal),
    ).rejects.toBeInstanceOf(TaxonomySessionRequiredError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("renueva una sola vez y repite solo el GET con TOKEN_INVALIDO", async () => {
    const refresh = vi.fn().mockResolvedValue("new-token");
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "TOKEN_INVALIDO" }), { status: 401 }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const signal = new AbortController().signal;
    const gateway = createAuthenticatedTaxonomyGateway(
      "https://gateway.example",
      session({ refreshAccessToken: refresh }),
      fetcher,
    );
    await gateway.request("/api/v1/tipos-producto", signal, "correlation-id");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer old-token",
      "X-Correlation-Id": "correlation-id",
    });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer new-token",
      "X-Correlation-Id": "correlation-id",
    });
  });

  it.each([
    ["401 desconocido", new Response("{}", { status: 401 })],
    ["403", new Response(JSON.stringify({ code: "SCOPE_INSUFICIENTE" }), { status: 403 })],
  ])("no renueva ni reintenta ante %s", async (_name, response) => {
    const refresh = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response as Response);
    const gateway = createAuthenticatedTaxonomyGateway(
      "https://gateway.example",
      session({ refreshAccessToken: refresh }),
      fetcher,
    );
    await expect(
      gateway.request("/api/v1/tipos-producto", new AbortController().signal),
    ).rejects.toBeInstanceOf(TaxonomyGatewayError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("no repite cuando la renovación de G7 falla", async () => {
    const refresh = vi.fn().mockResolvedValue(null);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ code: "TOKEN_INVALIDO" }), { status: 401 }),
      );
    const gateway = createAuthenticatedTaxonomyGateway(
      "https://gateway.example",
      session({ refreshAccessToken: refresh }),
      fetcher,
    );
    await expect(
      gateway.request("/api/v1/tipos-producto", new AbortController().signal),
    ).rejects.toMatchObject({ status: 401, code: "TOKEN_INVALIDO" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
