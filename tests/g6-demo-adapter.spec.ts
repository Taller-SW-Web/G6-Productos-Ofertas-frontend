import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  createDemoCatalogApi,
  DemoApiError,
} from "../src/features/catalog/adapters/demoCatalogApi";

test("Deploy: proxies limitados a Azure/G7 y la demo apagada no ocupa rutas", async ({ page }) => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  const external = config.rewrites.filter((rule: { destination: string }) => rule.destination.startsWith("https://"));
  expect(external).toHaveLength(2);
  const destinations = new Map([
    ["/api/v1/:path*", "https://api-gateway.calmgrass-aec0b33c.chilecentral.azurecontainerapps.io/api/v1/:path*"],
    ["/g7/api/v1/:path*", "https://g7-auth-service.onrender.com/api/v1/:path*"],
  ]);
  for (const rule of external) {
    // Only the fixed API prefixes may leave the frontend; no arbitrary destination.
    expect(destinations.get(rule.source)).toBe(rule.destination);
    const policy = config.headers.find((item: { source: string }) => item.source === rule.source);
    expect(policy.headers).toContainEqual({ key: "Cache-Control", value: "private, no-store" });
  }
  expect(config.rewrites.at(-1)).toEqual({ source: "/(.*)", destination: "/index.html" });
  expect(config.buildCommand).toContain("VITE_DATA_MODE=api");
  await page.goto("/demo/g6/productos");
  await expect(page.getByRole("heading", { name: "G6 · Productos y Ofertas" })).toHaveCount(0);
  await expect(page.getByRole("navigation").first()).toBeVisible();
});

test("Pricing simulado: máximo tres consultas activas; cancelar cola no envía HTTP; 500 libera cupo sin retry", async () => {
  const pending: (() => void)[] = [];
  const paths: string[] = [];
  let active = 0; let peak = 0;
  const api = createDemoCatalogApi(async (input) => {
    paths.push(String(input)); active++; peak = Math.max(peak, active);
    await new Promise<void>(resolve => pending.push(resolve));
    active--;
    const id = String(input).split("/").at(-1);
    return id === "fail" ? Response.json({ code: "ERROR_INTERNO" }, { status: 500, headers: { "content-type": "application/problem+json" } })
      : Response.json({ product_id: id, precio_regular: 20, precio_oferta: null, currency: "PEN" });
  });
  const jobs = [api.price("a"), api.price("fail"), api.price("b"), api.price("c"), api.price("d")];
  const queuedController = new AbortController();
  const queued = api.price("never", queuedController.signal);
  const rejected = expect(queued).rejects.toThrow(); queuedController.abort();
  const settled = Promise.allSettled(jobs);
  await expect.poll(() => paths.length).toBe(3);
  pending.splice(0).forEach(resolve => resolve());
  await expect.poll(() => paths.length).toBe(5);
  pending.splice(0).forEach(resolve => resolve());
  expect((await settled).filter(result => result.status === "fulfilled")).toHaveLength(4);
  await rejected;
  expect(peak).toBe(3); expect(paths.some(path => path.endsWith("never"))).toBe(false);
  expect(paths.filter(path => path.endsWith("fail"))).toHaveLength(1);
});

test("adapter unit: uses the published read paths without credentials and maps real DTO fields", async () => {
  const requests: { path: string; options?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, options) => {
    requests.push({ path: String(input), options });
    return Response.json({
      items: [
        {
          product_id: "product",
          name: "Provider fixture",
          sku_base: "EXPLICIT-SKU",
          description: "Description",
          categoria_id: "category",
          images: ["https://example.com/photo.jpg"],
        },
      ],
      pagina: 1,
      tamanio: 20,
      total: 1,
    });
  };
  const result = await createDemoCatalogApi(fetcher).list({
    page: 1,
    state: "BORRADOR",
  });
  expect(result.items[0]).toMatchObject({
    id: "product",
    sku: "EXPLICIT-SKU",
    categoryId: "category",
  });
  const first = requests.at(0);
  if (!first) throw new Error("El adaptador no realizó una consulta.");
  expect(first.path).toContain("/api/v1/productos?");
  expect(first.path).toContain("estado=BORRADOR");
  expect(first.options?.method).toBe("GET");
  expect(first.options?.credentials).toBe("omit");
  expect(new Headers(first.options?.headers).has("authorization")).toBe(false);
});
test("adapter unit: preserves a 503 Problem as a visible failure without retry/fallback", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json(
      { code: "SERVICIO_NO_DISPONIBLE" },
      { status: 503, headers: { "content-type": "application/problem+json" } },
    );
  };
  await expect(
    createDemoCatalogApi(fetcher).categories(),
  ).rejects.toBeInstanceOf(DemoApiError);
  expect(calls).toBe(1);
});
test("adapter unit: rejects SPA HTML, invalid images and fabricated/nonpositive prices", async () => {
  const html: typeof fetch = async () =>
    new Response("<html>SPA fallback</html>", {
      headers: { "content-type": "text/html" },
    });
  await expect(createDemoCatalogApi(html).categories()).rejects.toThrow("JSON");
  for (const amount of [0, -1, "79.00"]) {
    const invalid: typeof fetch = async () =>
      Response.json({
        product_id: "p",
        precio_regular: amount,
        precio_oferta: null,
        currency: "PEN",
      });
    await expect(createDemoCatalogApi(invalid).price("p")).rejects.toThrow(
      "Pricing",
    );
  }
  const usd: typeof fetch = async () =>
    Response.json({
      product_id: "p",
      precio_regular: 79,
      precio_oferta: null,
      currency: "USD",
    });
  await expect(createDemoCatalogApi(usd).price("p")).rejects.toThrow("PEN");
  const valid: typeof fetch = async () =>
    Response.json({
      product_id: "p",
      precio_regular: 79.9,
      precio_oferta: null,
      currency: "PEN",
    });
  expect(await createDemoCatalogApi(valid).price("p")).toEqual({
    regular: 79.9,
    offer: null,
    currency: "PEN",
  });
});
