import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedCatalogTransport } from "../catalog/adapters/authenticatedCatalogTransport";
import { createReadOnlyClient } from "../reads/readOnlyClient";
import { createAuthenticatedTaxonomyGateway } from "../taxonomy/services/taxonomyGatewayRuntime";
import type { G7Session } from "../promotions/adapters/g7Session";

function makeSession(token = "header.payload.signature"): G7Session {
  return {
    getAccessToken: vi.fn().mockResolvedValue(token),
    refreshAccessToken: vi.fn().mockResolvedValue(null),
    invalidateAccessToken: vi.fn(),
  } as unknown as G7Session;
}

describe("Frontend G7-only Bearer enforcement (R2)", () => {
  it("always sends Authorization Bearer in catalog transport even if publicReads is passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const transport = createAuthenticatedCatalogTransport("https://gateway.example.test", makeSession(), {
        publicReads: true,
      });
      await transport.request("/api/v1/productos", {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: new AbortController().signal,
      });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer header.payload.signature");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("always sends Authorization Bearer in readOnlyClient even if publicReadOnly is passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createReadOnlyClient("https://gateway.example.test", makeSession(), fetchMock, {
      publicReadOnly: true,
    });
    await client.read("listarProductos", { canal: "MARKETPLACE" }, new AbortController().signal);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer header.payload.signature");
  });

  it("always sends Authorization Bearer in taxonomyGatewayRuntime even if publicReads is passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const transport = createAuthenticatedTaxonomyGateway(
      "https://gateway.example.test",
      {
        getAccessToken: vi.fn().mockResolvedValue("header.payload.signature"),
        refreshAccessToken: vi.fn().mockResolvedValue(null),
        invalidateAccessToken: vi.fn(),
      },
      fetchMock,
      { publicReads: true },
    );
    await transport.request("/api/v1/categorias/arbol", new AbortController().signal);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer header.payload.signature");
  });
});
