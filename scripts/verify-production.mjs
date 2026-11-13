import assert from "node:assert/strict";
import { chromium } from "playwright";

const mode = process.argv[2];
assert.ok(["mock", "api"].includes(mode), "Uso: node scripts/verify-production.mjs <mock|api> [baseURL]");
const baseURL = process.argv[3] || "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], requests = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => requests.push(request.url()));
// Only the anonymous fail-closed boundary. Passing is NOT release readiness.
// Authenticated operations: npm run test:production:auth (isolated contract).
// Real candidate configuration: npm run verify:release:login.
const paths = [
  "/",
  "/precios",
  "/cupones",
  "/promociones",
  "/recomendaciones",
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
  "/productos",
  "/productos/nuevo",
  "/productos/PROD-RUN-001",
  "/productos/PROD-RUN-001/editar",
  "/productos/PROD-RUN-001/preparacion",
  "/productos/PROD-RUN-001/variantes",
  "/productos/PROD-RUN-001/variantes/nueva",
  "/productos/PROD-RUN-001/variantes/VAR-RUN-BLA-M/preparacion",
  "/categorias",
  "/categorias/nueva",
  "/categorias/calzado/desactivar",
  "/caracteristicas",
  "/caracteristicas/talla/valores",
  "/tipos-producto",
  "/tipos-producto/ropa",
  "/marcas",
  "/marcas/nike/editar",
  "/seo",
  "/seo/cat-ropa",
  "/precios/auditoria",
  "/precios/auditoria/asientos/aud-014-mod-01",
  "/precios/auditoria/asientos/no-existe",
  "/precios/auditoria/exportar/csv",
  "/precios/auditoria/exportar/pdf",
  "/inventario",
  "/inventario/umbrales",
  "/inventario/traslados",
  "/inventario/dashboard",
  "/combos",
  "/combos/nuevo",
  "/combos/combo-001",
  "/combos/combo-001/editar",
  "/combos/combo-001/no-disponible",
  "/carga-masiva",
  "/carga-masiva/importar",
  "/ruta-desconocida",
  "/tests/harness/catalog-adapter.html",
  "/tests/harness/promotions-session.html",
];
try {
  for (const path of paths) {
    await page.goto(baseURL + path);
    await page.getByRole("heading", { name: "Iniciar sesión", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/login", path);
    assert.equal(await page.getByRole("navigation").count(), 0, path);
    assert.equal(await page.getByRole("table").count(), 0, path);
    assert.equal(await page.getByRole("dialog").count(), 0, path);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, path);
  }
  assert.equal(requests.some(url => /\/api\/v1\//.test(url)), false, "No private reads before login");
  if (mode === "api") assert.equal(requests.some(url => /mockCatalogRepository|createDemoPricingRuntime|mockInventoryAdapter/.test(url)), false, "No fixture fallback in API");
  assert.deepEqual(errors, []);
  console.log(`PASS fallo cerrado ${mode}: ${paths.length} rutas protegidas, 1440 px, cero consultas privadas sin sesión. NO demuestra login operativo ni preparación para liberar.`);
} finally {
  await browser.close();
}
