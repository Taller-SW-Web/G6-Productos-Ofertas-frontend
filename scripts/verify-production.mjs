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
        /Integración API no disponible/,
      );
      assert.equal(await page.locator("main form").count(), 0);
      assert.equal(await page.getByRole("table").count(), 0);
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByText("Datos de demostración", { exact: true }).count(), 0);
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
  if (mode === "api")
    assert.equal(
      requests.some((url) =>
        /createDemoPricingRuntime|mock[A-Z]|\/prices-|\/catalogChoices-|\/promotionServices-|\/PromotionDataNotice-|\/(?:Coupon|Campaign|Recommendation)[^/]*Page-/.test(
          url,
        ),
      ),
      false,
    );
  assert.deepEqual(errors, []);
  console.log(
    `PASS producción ${mode}: 19 vistas de Promotions y Pricing S01, 1440 px, sin errores; ${mode === "api" ? "providers ausentes explícitos, reintento y cero carga de mocks" : "módulos presentes y controles de revisión ausentes"}.`,
  );
} finally {
  await browser.close();
}
