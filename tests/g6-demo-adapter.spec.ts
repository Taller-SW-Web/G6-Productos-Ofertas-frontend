import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  createDemoCatalogApi,
  DemoApiError,
} from "../src/features/catalog/adapters/demoCatalogApi";

test("Deploy: proxies limitados a Azure/G7, comando corto y la demo apagada no ocupa rutas", async ({ page }) => {
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
  expect(config.buildCommand).toBe("node scripts/build-vercel.mjs");
  expect(config.buildCommand.length).toBeLessThanOrEqual(256);
  await page.goto("/demo/g6/productos");
  await expect(page.getByRole("heading", { name: "G6 · Productos y Ofertas" })).toHaveCount(0);
  await expect(page.getByRole("navigation").first()).toBeVisible();
});

test("la demo pública exige canal, lo conserva al volver del detalle y omite filtros administrativos", async ({ page }) => {
  const listUrls: string[] = [];
  const detailUrls: string[] = [];
  await page.route("**/src/app/routes/AppRoutes.tsx*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll(
      "import.meta.env.VITE_G6_READ_DEMO",
      '"true"',
    );
    await route.fulfill({ response, body });
  });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/categorias") {
      await route.fulfill({ json: { categories: [] } });
      return;
    }
    if (url.pathname === "/api/v1/productos") {
      listUrls.push(url.href);
      await route.fulfill({
        json: {
          items: [{
            product_id: "visible-item",
            name: "Producto visible",
            sku_base: "SKU-1",
            description: "",
            categoria_id: "category",
            images: [],
          }],
          pagina: 1,
          tamanio: 20,
          total: 1,
        },
      });
      return;
    }
    if (url.pathname === "/api/v1/productos/visible-item") {
      detailUrls.push(url.href);
      await route.fulfill({
        json: {
          product_id: "visible-item",
          name: "Producto visible",
          sku_base: "SKU-1",
          description: "",
          categoria_id: "category",
          images: [],
        },
      });
      return;
    }
    if (url.pathname.startsWith("/api/v1/precios/productos/")) {
      const productId = url.pathname.split("/").at(-1);
      await route.fulfill({
        json: {
          product_id: productId,
          precio_regular: 20,
          precio_oferta: null,
          currency: "PEN",
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { code: "NO_ENCONTRADO" } });
  });

  await page.goto("/demo/g6/productos");
  await expect(page.getByRole("combobox", { name: "Canal comercial" })).toBeVisible();
  await expect(page.getByLabel("Estado del catálogo")).toHaveCount(0);
  await expect.poll(() => listUrls.length).toBe(0);
  await page.getByRole("combobox", { name: "Canal comercial" }).click();
  await page.getByRole("option", { name: "Chatbot" }).click();
  await expect(page.getByRole("link", { name: "Producto visible" })).toBeVisible();
  await expect.poll(() => listUrls.length).toBeGreaterThan(0);
  for (const url of listUrls) {
    const query = new URL(url).searchParams;
    expect(query.get("canal")).toBe("CHATBOT");
    expect(query.has("estado")).toBe(false);
  }

  await page.getByRole("link", { name: "Producto visible" }).click();
  await expect(page).toHaveURL(/\/demo\/g6\/productos\/visible-item\?canal=CHATBOT/);
  await expect(page.getByRole("heading", { name: "Producto visible" })).toBeVisible();
  expect(detailUrls.length).toBeGreaterThan(0);
  expect(new URL(detailUrls[0]!).searchParams.get("canal")).toBe("CHATBOT");
  await page.getByRole("link", { name: "Volver a productos" }).click();
  await expect(page).toHaveURL(/\/demo\/g6\/productos\?canal=CHATBOT/);
  await page.getByRole("link", { name: "Consultar categorías" }).click();
  await expect(page).toHaveURL(/\/demo\/g6\/categorias\?canal=CHATBOT/);
  await page.getByRole("link", { name: "Productos", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/g6\/productos\?canal=CHATBOT/);
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
    channel: "CHATBOT",
  });
  expect(result.items[0]).toMatchObject({
    id: "product",
    sku: "EXPLICIT-SKU",
    categoryId: "category",
  });
  const first = requests.at(0);
  if (!first) throw new Error("El adaptador no realizó una consulta.");
  expect(first.path).toContain("/api/v1/productos?");
  expect(first.path).toContain("canal=CHATBOT");
  expect(first.path).not.toContain("estado=");
  expect(first.options?.method).toBe("GET");
  expect(first.options?.credentials).toBe("omit");
  expect(new Headers(first.options?.headers).has("authorization")).toBe(false);
});
test("adapter unit: requires an explicit channel for list and detail", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requests.push(String(input));
    if (String(input).includes("/productos/item?"))
      return Response.json({
        product_id: "item",
        name: "Item",
        sku_base: null,
        description: null,
        categoria_id: "category",
        images: [],
      });
    return Response.json({ items: [], pagina: 1, tamanio: 20, total: 0 });
  };
  const api = createDemoCatalogApi(fetcher);
  await api.list({ page: 1, channel: "RETAIL" });
  await api.detail("item", "RETAIL");
  expect(requests.every((url) => url.includes("canal=RETAIL"))).toBe(true);
  expect(requests.every((url) => !url.includes("estado="))).toBe(true);
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
