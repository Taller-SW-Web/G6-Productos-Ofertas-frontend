import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";

const resolver = "/api/v1/productos/administracion/skus/resolver";
const invalid = () => Response.json({ code: "TOKEN_INVALIDO" }, { status: 401 });
const ok = () => Response.json({ items: [] });

function setup(overrides: {
  refresh?: () => Promise<string | null>;
  fetcher?: typeof fetch;
  version?: () => number;
} = {}) {
  const getAccessToken = vi.fn(async () => "token-expirado");
  const refreshAccessToken = vi.fn(overrides.refresh ?? (async () => "token-vigente"));
  const invalidateAccessToken = vi.fn();
  let defaultCalls = 0;
  const fetcher = vi.fn<typeof fetch>(overrides.fetcher ?? (async () => defaultCalls++ === 0 ? invalid() : ok()));
  const client = createAuthenticatedGatewayClient("https://gateway.example", {
    getAccessToken, refreshAccessToken, invalidateAccessToken,
    getSessionVersion: overrides.version ?? (() => 1),
  }, fetcher);
  return { client, getAccessToken, refreshAccessToken, invalidateAccessToken, fetcher };
}

describe("AuthenticatedGatewayClient para consulta POST de SKU", () => {
  it.each(["JWT expirado", "token revocado"])("renueva y repite una vez el resolver ante %s", async () => {
    const { client, fetcher, refreshAccessToken } = setup();
    await expect(client.request(resolver, { method: "POST_READ", body: JSON.stringify({ skus: ["001"] }) })).resolves.toMatchObject({ status: 200 });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "POST"]);
    expect(fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get("Authorization"))).toEqual(["Bearer token-expirado", "Bearer token-vigente"]);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ skus: ["001"] }));
  });

  it("no reintenta el POST ante 403", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: "SCOPE_INSUFICIENTE" }, { status: 403 }));
    const { client, refreshAccessToken, invalidateAccessToken } = setup({ fetcher });
    await expect(client.request(resolver, { method: "POST_READ", body: "{}" })).resolves.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(invalidateAccessToken).not.toHaveBeenCalled();
  });

  it("si G7 no puede renovar, no reenvía y cierra el token inválido", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(invalid());
    const { client, refreshAccessToken, invalidateAccessToken } = setup({ fetcher, refresh: async () => null });
    await expect(client.request(resolver, { method: "POST_READ", body: "{}" })).resolves.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(invalidateAccessToken).toHaveBeenCalledWith("token-expirado");
  });

  it("protege la versión de sesión si cambia el usuario mientras renueva", async () => {
    let generation = 1;
    let finishRefresh!: (token: string | null) => void;
    const refresh = vi.fn(() => new Promise<string | null>(resolve => { finishRefresh = resolve; }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(invalid());
    const { client } = setup({ refresh, fetcher, version: () => generation });
    const operation = client.request(resolver, { method: "POST_READ", body: "{}" });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    generation++;
    finishRefresh("token-usuario-anterior");
    await expect(operation).rejects.toThrow("La sesión cambió durante la operación.");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("comparte el refresh concurrente y conserva un replay por consulta", async () => {
    let shared: Promise<string | null> | undefined;
    const refreshWork = vi.fn(async () => "token-vigente");
    const refresh = vi.fn(() => shared ??= refreshWork().finally(() => { shared = undefined; }));
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => new Headers(init?.headers).get("Authorization") === "Bearer token-expirado" ? invalid() : ok());
    const { client } = setup({ refresh, fetcher });
    await Promise.all(Array.from({ length: 5 }, () => client.request(resolver, { method: "POST_READ", body: "{\"skus\":[\"001\"]}" })));
    expect(refreshWork).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(10);
  });

  it.each(["POST", "PATCH"] as const)("no amplía el replay de escritura %s", async method => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(invalid());
    const { client, refreshAccessToken } = setup({ fetcher });
    await expect(client.request(resolver, { method, body: "{}" })).resolves.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("rechaza POST_READ en cualquier ruta distinta sin llamar al Gateway", async () => {
    const { client, fetcher } = setup();
    await expect(client.request("/api/v1/productos", { method: "POST_READ", body: "{}" })).rejects.toThrow("solo está habilitado");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
