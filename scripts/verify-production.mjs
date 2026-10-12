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
          ? /adapter API de Pricing no está configurado/
          : /Integración API no disponible/,
      );
      if (path === "/precios") {
        await page
          .getByRole("button", { name: "Volver a cargar productos y SKU" })
          .click();
        await page.getByRole("alert").waitFor();
        assert.match(
          await page.getByRole("alert").innerText(),
          /adapter API de Pricing no está configurado/,
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
  if (mode === "api")
    assert.equal(
      requests.some((url) =>
        /createDemoPricingRuntime|mock[A-Z]|\/prices-|\/catalogChoices-|\/CouponsPage-|\/CampaignsPage-|\/RecommendationsPage-/.test(
          url,
        ),
      ),
      false,
    );
  assert.deepEqual(errors, []);
  console.log(
    `PASS producción ${mode}: 4 rutas directas, 1440 px, sin errores; ${mode === "api" ? "providers ausentes explícitos, reintento y cero carga de mocks" : "módulos presentes y controles de revisión ausentes"}.`,
  );
} finally {
  await browser.close();
}
