import assert from "node:assert/strict";
import { chromium } from "playwright";

const mode = process.argv[2];
assert.ok(["mock", "api"].includes(mode), "Uso: node scripts/verify-production.mjs <mock|api> [baseURL]");
const baseURL = process.argv[3] || "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
const errors = [];
const requests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => requests.push(request.url()));
try {
  // Loop grueso: rutas de listado y entrada de cada mÃ³dulo, simulando en DEV los
  // estados loading/forbidden que el navegador no puede reproducir por URL.
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
      const mensaje = await alert.innerText();
      if (path === "/precios") {
        // Bloqueo especÃ­fico del adapter de Pricing sin provider configurado y
        // persistencia del error tras reintento y tras recarga de la pÃ¡gina.
        assert.match(mensaje, /adapter API de Pricing no estÃ¡ configurado/);
        const reintento = page.getByRole("button", {
          name: /Volver a cargar productos y SKU/,
        });
        assert.equal(await reintento.count(), 1);
        await reintento.click();
        await alert.waitFor();
        assert.match(
          await alert.innerText(),
          /adapter API de Pricing no estÃ¡ configurado/,
        );
        assert.equal(await page.getByRole("table").count(), 0);
        await page.reload();
        await alert.waitFor();
        assert.match(
          await alert.innerText(),
          /adapter API de Pricing no estÃ¡ configurado/,
        );
      } else {
        // Bloqueo especÃ­fico del gate de Promotions (cupones, promociones y
        // recomendaciones) en modo API.
        assert.match(mensaje, /IntegraciÃ³n API no disponible/);
      }
      assert.equal(await page.getByRole("table").count(), 0);
      assert.equal(await page.locator("main form").count(), 0);
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByText("Datos de demostraciÃ³n", { exact: true }).count(), 0);
    } else {
      await page.getByRole("heading", { level: 1 }).waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
      assert.equal(await page.locator("main form").count(), 0);
      assert.equal(await page.getByRole("combobox", { name: /Escenario/ }).count(), 0);
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
        /IntegraciÃ³n API no disponible/,
      );
      assert.equal(await page.locator("main form").count(), 0);
      assert.equal(await page.getByRole("table").count(), 0);
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByText("Datos de demostraciÃ³n", { exact: true }).count(), 0);
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
  // TaxonomÃ­a (MK-008 a MK-012), estrictamente ADITIVO sobre los loops anteriores:
  // las secciones y rutas internas representativas no alteran ningÃºn check previo.
  // En modo mock cada ruta debe estar operativa y con aviso de demostraciÃ³n; en
  // modo api el gate debe bloquear con el mensaje exacto y sin formularios,
  // tablas, diÃ¡logos ni aviso de demo (prohibido el fallback silencioso).
  const taxonomyPaths = [
    { path: "/categorias", table: true, form: false },
    { path: "/categorias/nueva", table: false, form: true },
    { path: "/categorias/calzado/desactivar", table: false, form: false },
    { path: "/caracteristicas", table: true, form: false },
    { path: "/caracteristicas/talla/valores", table: true, form: false },
    { path: "/tipos-producto", table: true, form: false },
    { path: "/tipos-producto/ropa", table: true, form: false },
    { path: "/marcas", table: true, form: false },
    { path: "/marcas/nike/editar", table: false, form: true },
    { path: "/seo", table: true, form: false },
    { path: "/seo/cat-ropa", table: false, form: true },
  ];
  for (const { path, table, form } of taxonomyPaths) {
    await page.goto(baseURL + path + "?modoRevision=1&escenario=loading");
    if (mode === "api") {
      const alert = page.getByRole("alert");
      await alert.waitFor();
      assert.match(
        await alert.innerText(),
        /IntegraciÃ³n con API real no disponible actualmente para el mÃ³dulo de TaxonomÃ­a/,
      );
      assert.equal(await page.getByRole("table").count(), 0);
      assert.equal(await page.locator("main form").count(), 0);
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByText("Datos de demostraciÃ³n", { exact: true }).count(), 0);
    } else {
      await page.getByRole("heading", { level: 1 }).waitFor();
      if (table) await page.getByRole("table").waitFor();
      if (form) await page.locator("main form").waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
      assert.equal(await page.getByText("Datos de demostraciÃ³n", { exact: true }).count(), 1);
      assert.equal(await page.getByRole("combobox", { name: /Escenario/ }).count(), 0);
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
  }
  // Modo mock: los listados comerciales deben renderizar sus tablas. El bucle
  // grueso usaba escenario=loading (estado pendiente), asÃ­ que se re-consultan
  // con escenario=default para verificar la existencia real de las tablas.
  if (mode === "mock") {
    for (const path of [
      "/precios",
      "/cupones",
      "/promociones",
      "/recomendaciones",
    ]) {
      await page.goto(baseURL + path + "?modoRevision=1&escenario=default");
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.getByRole("table").waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
    }
  }
  if (mode === "api")
    assert.equal(
      requests.some((url) =>
        // Adapters de revisiÃ³n, pÃ¡ginas Promotions no bloqueadas y mocks de
        // TaxonomÃ­a ni en URLs de DEV (/features/taxonomy/) ni en bundles
        // compilados de dist/assets/ (chunks derivados de las pÃ¡ginas y el
        // servicio de taxonomÃ­a).
        /createDemoPricingRuntime|mock[A-Z]|\/prices-|\/catalogChoices-|\/promotionServices-|\/PromotionDataNotice-|\/(?:Coupon|Campaign|Recommendation)[^/]*Page-|\/features\/taxonomy\/|\/assets\/[^/]*(?:Category(?:Tree|Create|Edit|Detail|Deactivate)|Characteristic|ProductType|Brand|Seo(?:List|Config)|SEO|taxonomyServices)[^/]*\.(?:js|css)/.test(
          url,
        ),
      ),
      false,
    );
  assert.deepEqual(errors, []);
  const totalViews = 4 + 16 + taxonomyPaths.length + (mode === "mock" ? 4 : 0);
  console.log(
    `PASS producciÃ³n ${mode}: ${totalViews} vistas de Promotions, Pricing S01 y TaxonomÃ­a, 1440 px, sin errores; ${mode === "api" ? "providers ausentes explÃ­citos, reintento y persistencia del error de Pricing, taxonomÃ­a bloqueada y cero carga de mocks/bundles" : "mÃ³dulos presentes, tablas comerciales verificadas y controles de revisiÃ³n ausentes"}.`,
  );
} finally {
  await browser.close();
}
