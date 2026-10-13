import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const mode = process.argv[2];
assert.ok(
  mode === "mock" || mode === "api",
  "Indica el modo del build servido: mock o api.",
);
const baseURL = process.argv[3] ?? "http://127.0.0.1:5174";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  for (const path of [
    "/precios",
    "/cupones",
    "/promociones",
    "/recomendaciones",
  ]) {
    await page.goto(baseURL + path + "?modoRevision=1&escenario=loading");
    if (mode === "api") {
      const alert = page.getByRole("alert");
      await alert.waitFor();
      const message = await alert.innerText();
      assert.match(
        message,
        path === "/precios"
          ? /adapter API de Pricing no est├í configurado/
          : /Integraci├│n API no disponible/,
      );
      if (path === "/precios") {
        await page
          .getByRole("button", { name: "Volver a cargar productos y SKU" })
          .click();
        await page.getByRole("alert").waitFor();
        assert.match(
          await page.getByRole("alert").innerText(),
          /adapter API de Pricing no est├í configurado/,
        );
      }
      assert.equal(await page.getByRole("table").count(), 0);
    } else {
      await page.getByRole("table").waitFor();
      assert.ok(await page.getByRole("heading", { level: 1 }).isVisible());
      assert.equal(
        await page.getByRole("combobox", { name: /Escenario/ }).count(),
        0,
      );
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  // Cover nested editors, selectors and state dialogs as well as the four lists.
  for (const path of [
    "/cupones/nuevo",
    "/cupones/run10/editar",
    "/cupones/run10",
    "/cupones/run10/limites",
    "/cupones/run10/estado",
    "/promociones/nueva",
    "/promociones/carrera/editar",
    "/promociones/nueva/alcance",
    "/promociones/carrera",
    "/promociones/carrera/estado",
    "/recomendaciones/nueva/venta-cruzada",
    "/recomendaciones/mejora-rendimiento/editar",
    "/recomendaciones/nueva/upselling",
    "/recomendaciones/nueva/venta-cruzada/productos",
    "/recomendaciones/mejora-rendimiento",
    "/recomendaciones/mejora-rendimiento/estado",
  ]) {
    await page.goto(baseURL + path + "?modoRevision=1&escenario=forbidden");
    if (mode === "api") {
      await page.getByRole("alert").waitFor();
      assert.match(
        await page.getByRole("alert").innerText(),
        /Integraci├│n API no disponible/,
      );
      assert.equal(await page.locator("main form").count(), 0);
      assert.equal(await page.getByRole("table").count(), 0);
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByText("Datos de demostraci├│n", { exact: true }).count(), 0);
    } else {
      await page.getByRole("heading", { level: 1 }).waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
      if (path.endsWith("/estado")) await page.getByRole("dialog").waitFor();
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
  }
  // Verificaciones de las cuatro rutas de Inventario (MK-015 y MK-016)
  // Cada pantalla se verifica por sus elementos funcionales propios, admitiendo estados vac├¡os leg├¡timos.
  const inventoryChecks = [
    {
      path: "/inventario",
      mockCheck: async (p) => {
        await p.getByRole("heading", { level: 1 }).waitFor();
        await p.getByRole("table").first().waitFor();
        assert.ok(await p.getByRole("heading", { level: 1 }).isVisible());
        assert.ok((await p.getByRole("table").count()) >= 1);
      },
    },
    {
      path: "/inventario/umbrales",
      mockCheck: async (p) => {
        await p.getByRole("heading", { level: 1 }).waitFor();
        assert.ok(await p.getByRole("heading", { level: 1 }).isVisible());
        const form = p.locator("main form, [role='form']").first();
        const hasForm = (await form.count()) > 0;
        const hasInput = (await p.getByRole("spinbutton").count()) > 0 ||
          (await p.getByRole("textbox").count()) > 0;
        assert.ok(hasForm || hasInput, "Umbrales: debe tener formulario de umbral global");
      },
    },
    {
      path: "/inventario/traslados",
      mockCheck: async (p) => {
        await p.getByRole("heading", { level: 1 }).waitFor();
        assert.ok(await p.getByRole("heading", { level: 1 }).isVisible());
        const hasTable = (await p.getByRole("table").count()) > 0;
        const hasEmpty = (await p.getByText("No hay traslados", { exact: false }).count()) > 0;
        assert.ok(hasTable || hasEmpty, "Traslados: debe tener tabla o mensaje de lista vac├¡a");
      },
    },
    {
      path: "/inventario/dashboard",
      mockCheck: async (p) => {
        await p.getByRole("heading", { level: 1 }).waitFor();
        assert.ok(await p.getByRole("heading", { level: 1 }).isVisible());
        const hasKpi = (await p.getByText("Total unidades f├¡sicas", { exact: false }).count()) > 0 ||
          (await p.getByText("Unidades disponibles", { exact: false }).count()) > 0 ||
          (await p.getByRole("table").count()) > 0;
        assert.ok(hasKpi, "Dashboard: debe mostrar KPIs o tabla de distribuci├│n");
      },
    },
  ];

  for (const { path, mockCheck } of inventoryChecks) {
    await page.goto(baseURL + path + "?modoRevision=1&escenario=loading");
    if (mode === "api") {
      const alert = page.getByRole("alert");
      await alert.waitFor();
      const message = await alert.innerText();
      assert.match(message, /Integraci├│n API no disponible/);
      assert.equal(await page.getByRole("table").count(), 0);
      assert.equal(await page.locator("main form").count(), 0);
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByText("Total unidades f├¡sicas").count(), 0);
      assert.equal(await page.getByText("Unidades disponibles").count(), 0);
      assert.equal(await page.getByText("Alertas operativas de inventario").count(), 0);
    } else {
      await mockCheck(page);
      assert.equal(
        await page.getByRole("combobox", { name: /Escenario/ }).count(),
        0,
      );
      assert.equal(await page.getByText("Integraci├│n API no disponible").count(), 0);
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  if (mode === "api")
    assert.equal(
      requests.some((url) =>
        /createDemoPricingRuntime|mock[A-Z]|mockInventory|inventoryFixtures|\/prices-|\/catalogChoices-|\/promotionServices-|\/PromotionDataNotice-|\/(?:Coupon|Campaign|Recommendation|StockControl|Thresholds|Transfers|InventoryDashboard)[^/]*Page-/.test(
          url,
        ),
      ),
      false,
    );
  assert.deepEqual(errors, []);
  console.log(
    `PASS producci├│n ${mode}: 23 vistas (Promotions, Pricing S01 e Inventario), 1440 px, sin errores; ${mode === "api" ? "providers ausentes expl├¡citos, reintento y cero carga de mocks" : "m├│dulos presentes y controles de revisi├│n ausentes"}.`,
  );
} finally {
  await browser.close();
}
