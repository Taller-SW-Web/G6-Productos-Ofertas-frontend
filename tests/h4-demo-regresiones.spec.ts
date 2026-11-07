import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const csv = [
  "operacion,producto_id,catalog_version,sku_base,sku_variante,nombre,descripcion,categoria_id,marca_id,tipo_producto_id,tiene_variantes,precio_regular,atributos_producto,atributos_variante,imagen_url,stock_inicial",
  "ALTA,,,SKU-H4-E2E,,Producto H4,Prueba contractual,44444444-4444-4444-8444-444444444444,55555555-5555-4555-8555-555555555555,66666666-6666-4666-8666-666666666666,false,49.90,[],,,0",
].join("\n") + "\n";
const csvBytes = Buffer.from(csv);
function deterministicBatch(correlation: string, file: Buffer): string {
  const contentHash = createHash("sha256").update(file).digest("hex");
  const hash = createHash("sha256").update(`${correlation}:${contentHash}`).digest("hex");
  const uuid = `${hash.slice(0, 12)}4${hash.slice(13, 16)}8${hash.slice(17, 20)}${hash.slice(20, 32)}`;
  return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
}
function extractCsv(request: import("@playwright/test").Request): Buffer {
  const data = request.postDataBuffer();
  if (!data) throw new Error("El POST multipart no contiene bytes.");
  const contentType = request.headers()["content-type"] ?? "";
  const boundary = /boundary=([^;]+)/i.exec(contentType)?.[1];
  if (!boundary) throw new Error("Falta el boundary multipart.");
  const begin = data.indexOf(Buffer.from('name="archivo"; filename="'));
  const headerEnd = data.indexOf(Buffer.from("\r\n\r\n"), begin);
  const end = data.indexOf(Buffer.from(`\r\n--${boundary}`), headerEnd + 4);
  if (begin < 0 || headerEnd < 0 || end < 0) throw new Error("No se encontró la parte multipart del archivo.");
  return data.subarray(headerEnd + 4, end);
}
function batchDto(batchId: string) {
  return { batch_id: batchId, status: "COMPLETED", total_rows: 1, completed_rows: 0, failed_rows: 1, needs_reconciliation: true,
    rows: [{ row_id: "33333333-3333-4333-8333-333333333333", sku: "SKU-H4-E2E", nombre: "Producto H4", status: "FAILED", applied_domains: ["CATALOGO"], failed_domain: "PRICING", needs_reconciliation: true, code: "PRECIO_INVALIDO", detail: "Rechazo simulado", steps: [{ dominio: "PRICING", status: "FAILED", code: "PRECIO_INVALIDO", detail: "Rechazo simulado" }] }] };
}
async function attachBulkApi(page: Page, mode: "accepted" | "recover"): Promise<{ posts: () => number; batchId: () => string | null; reads: () => number }> {
  let postCount = 0, readCount = 0, id: string | null = null;
  await page.route("http://127.0.0.1:9000/api/v1/carga-masiva/productos/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    expect(request.headers().authorization).toBe("Bearer test.header.signature");
    if (request.method() === "POST" && path.endsWith("/importaciones")) {
      postCount += 1;
      const bytes = extractCsv(request);
      expect(bytes).toEqual(csvBytes);
      const correlation = request.headers()["x-correlation-id"];
      expect(correlation).toMatch(/^[0-9a-f-]{36}$/i);
      id = deterministicBatch(correlation!, bytes);
      if (mode === "recover") return route.abort("failed");
      return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ batch_id: id, status: "QUEUED", template_version: 2, correlation_id: correlation }) });
    }
    if (request.method() === "GET" && id && path.endsWith(`/importaciones/${id}`)) {
      readCount += 1;
      if (mode === "recover" && readCount === 1) return route.fulfill({ status: 404, contentType: "application/problem+json", body: JSON.stringify({ status: 404, code: "LOTE_NO_ENCONTRADO" }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(batchDto(id)) });
    }
    if (request.method() === "GET" && path.endsWith("/reporte")) return route.fulfill({ status: 200, contentType: "text/csv", headers: { "content-disposition": 'attachment; filename="h4-reporte.csv"' }, body: "row_id,code\n33333333-3333-4333-8333-333333333333,PRECIO_INVALIDO\n" });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404, contentType: "application/problem+json", body: JSON.stringify({ status: 404, code: "LOTE_NO_ENCONTRADO" }) });
  });
  return { posts: () => postCount, batchId: () => id, reads: () => readCount };
}
async function openBulkHarness(page: Page) {
  await page.goto(`/tests/harness/bulk-http.html?gateway=${encodeURIComponent("http://127.0.0.1:9000") }#/carga-masiva`);
}
async function selectCsv(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({ name: "upload.csv", mimeType: "text/csv", buffer: csvBytes });
  await page.getByRole("button", { name: "Continuar a revisión", exact: true }).click();
}

test("E2E-01: G7 de prueba recorre Promotions, cupones, filtros y logout", async ({ page }) => {
  const html = await (await page.request.get("/tests/harness/promotions-session.html")).text();
  const calls: string[] = [];
  await page.route("**/*", route => route.request().resourceType() === "document" && new URL(route.request().url()).pathname === "/cupones" ? route.fulfill({ contentType: "text/html", body: html }) : route.fallback());
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname; calls.push(path);
    if (path.startsWith("/g7/")) return route.fulfill({ json: { accessToken: "h4.fake.access", refreshToken: "h4.fake.refresh", tokenType: "Bearer", expiresIn: 900, usuario: { id: "11111111-1111-4111-8111-111111111111", nombreCompleto: "Gestora H4 A", correo: "h4-a@example.invalid", roles: ["GESTOR_COMERCIAL"] } } });
    return route.fulfill({ json: { items: [], meta: { pagina: 1, tamanio: 10, total: 0, totalPaginas: 0 } } });
  });
  await page.goto("/cupones");
  await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).fill("h4-a@example.invalid");
  await page.getByLabel("Contraseña").fill("fake-password-h4");
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page.getByText("Sesión de Gestora H4 A", { exact: true })).toBeVisible();
  await expect.poll(() => calls.some(path => path === "/api/v1/cupones")).toBe(true);
  await expect(page.getByRole("button", { name: "Cerrar sesión", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  expect(calls.filter(path => path === "/api/v1/cupones")).toHaveLength(1);
});

test("E2E-02: Catálogo abre producto y variante con la identidad de la ruta", async ({ page }) => {
  await page.goto("/productos/PROD-RUN-001/variantes");
  await expect(page.getByRole("heading", { name: "Variantes de Camiseta Running Endurance" })).toBeVisible();
  await expect(page.getByText("SKU Base: CAM-RUN")).toBeVisible();
  const detail = page.getByRole("link", { name: /Ver detalle/ }).first();
  await detail.click();
  await expect(page).toHaveURL(/\/productos\/PROD-RUN-001\/variantes\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /Volver a variantes/ }).click();
  await expect(page).toHaveURL(/\/productos\/PROD-RUN-001\/variantes/);
  await expect(page.getByRole("link", { name: /Ver detalle/ })).toHaveCount(3);
});

test("E2E-03: Taxonomy edita Marca y presenta la respuesta confirmada una sola vez", async ({ page }) => {
  await page.goto("/marcas/nike/editar");
  await expect(page.getByRole("heading", { level: 1, name: "Editar marca" })).toBeVisible();
  const description = page.getByLabel("Descripción (opcional)");
  await description.fill("Descripción H4 confirmada");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(/\/marcas\/nike$/);
  await expect(page.getByText("Descripción H4 confirmada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Editar marca" })).toBeVisible();
  await expect(description).toHaveValue("Descripción H4 confirmada");
});

test("E2E-04: Pricing consulta y programa vigencia disponible en modo de revisión", async ({ page }) => {
  await page.goto("/precios/programaciones?target=base&modoRevision=1");
  await expect(page.getByRole("heading", { name: "Programaciones de precio" })).toBeVisible();
  await expect(page.getByText("Mostrando 1 a 2 de 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Programar precio", exact: true }).click();
  await page.getByRole("textbox", { name: "Importe", exact: true }).fill("35.50");
  await page.getByRole("textbox", { name: "Fecha y hora de inicio", exact: true }).fill("2026-12-01T09:00");
  await page.getByRole("textbox", { name: "Fecha y hora de fin (opcional)", exact: true }).fill("2026-12-02T09:00");
  await page.getByRole("button", { name: "Programar precio", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar programación", exact: true }).click();
  await expect(page.getByText("Precio programado", { exact: true })).toBeVisible();
  await expect(page.getByText("Mostrando 1 a 2 de 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar programación", exact: true })).toHaveCount(0);
});

test("E2E-05: Inventory mantiene SKU y formulario de umbral al navegar entre vistas", async ({ page }) => {
  await page.goto("/inventario");
  await expect(page.getByRole("heading", { name: "Control de stock y disponibilidad" })).toBeVisible();
  const sku = page.getByText("ZAP-TRL-40-BLK", { exact: true }).first();
  await expect(sku).toBeVisible();
  await page.getByRole("button", { name: "Ver detalle" }).first().click();
  const drawer = page.getByRole("dialog", { name: /Detalle de saldo/ });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Unidades físicas")).toBeVisible();
  await drawer.getByRole("button", { name: "Cerrar detalle" }).click();
  await page.goto("/inventario/umbrales");
  const threshold = page.getByRole("textbox", { name: "Umbral global de stock bajo" });
  await threshold.fill("12");
  await page.getByRole("button", { name: "Guardar umbral global" }).click();
  await expect(page.getByText("Escritura confirmada")).toBeVisible();
  await expect(page.getByText("Cambio aplicado")).toHaveCount(0);
});

test("E2E-06: Bulk admite CSV, sigue el mismo batchId y descarga reporte simulado", async ({ page }) => {
  const state = await attachBulkApi(page, "accepted");
  await openBulkHarness(page); await selectCsv(page);
  await page.getByRole("button", { name: "Confirmar importación", exact: true }).first().click();
  await expect.poll(() => state.posts()).toBe(1);
  const id = state.batchId(); expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  await expect(page).toHaveURL(new RegExp(`${id}$`));
  await expect(page.getByText("Producto H4")).toBeVisible();
  await page.goto(`/tests/harness/bulk-http.html?gateway=${encodeURIComponent("http://127.0.0.1:9000")}#/carga-masiva/importaciones/${id}/resultado`);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar reporte de errores" }).click();
  expect((await download).suggestedFilename()).toBe("h4-reporte.csv");
  expect(state.posts()).toBe(1);
});

test("E2E-07: Bulk incierto recarga, conserva marcador tras 404 y recupera con GET 200 sin segundo POST", async ({ page }) => {
  const state = await attachBulkApi(page, "recover");
  await openBulkHarness(page); await selectCsv(page);
  await page.getByRole("button", { name: "Confirmar importación", exact: true }).first().click();
  await expect(page.getByText(/GET 404: lote no localizado/)).toBeVisible();
  const beforeReload = await page.evaluate(() => Object.entries(sessionStorage).find(([key]) => key.startsWith("g6:bulk:admission:v1:"))?.[1] ?? null);
  expect(beforeReload).not.toBeNull();
  expect(JSON.parse(beforeReload!)).toMatchObject({ owner: "g7-h4-owner-a", state: "uncertain" });
  await page.reload();
  await page.getByRole("button", { name: "Ir a selección de archivo" }).click();
  await selectCsv(page);
  await expect(page.getByText(/GET 404: lote no localizado/)).toBeVisible();
  const after404 = await page.evaluate(() => Object.entries(sessionStorage).find(([key]) => key.startsWith("g6:bulk:admission:v1:"))?.[1] ?? null);
  expect(JSON.parse(after404!)).toMatchObject({ owner: "g7-h4-owner-a", state: "uncertain" });
  await page.getByRole("button", { name: "Volver a consultar lote" }).click();
  await expect(page).toHaveURL(new RegExp(`${state.batchId()}$`));
  await expect(page.getByText("Producto H4")).toBeVisible();
  expect(state.posts()).toBe(1);
  expect(state.reads()).toBeGreaterThanOrEqual(3);
  const afterRecovery = await page.evaluate(() => Object.entries(sessionStorage).find(([key]) => key.startsWith("g6:bulk:admission:v1:"))?.[1] ?? null);
  expect(JSON.parse(afterRecovery!)).toMatchObject({ owner: "g7-h4-owner-a", state: "accepted" });
  expect(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith("g6:bulk:import-pending:")))).toBe(false);
});

test("E2E-08: identidad B no hereda el intento incierto de A", async ({ page }) => {
  const state = await attachBulkApi(page, "recover");
  await openBulkHarness(page); await selectCsv(page);
  await page.getByRole("button", { name: "Confirmar importación", exact: true }).first().click();
  await expect(page.getByText(/GET 404: lote no localizado/)).toBeVisible();
  const markerA = await page.evaluate(() => Object.entries(sessionStorage).find(([key]) => key.startsWith("g6:bulk:admission:v1:"))?.[1] ?? null);
  expect(JSON.parse(markerA!)).toMatchObject({ owner: "g7-h4-owner-a", state: "uncertain" });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("h4:identity", { detail: { id: "g7-h4-owner-b", nombreCompleto: "Usuario H4 B", correo: "h4-owner-b@example.invalid", roles: ["GESTOR_COMERCIAL"] } })));
  await page.getByRole("link", { name: "Carga masiva" }).first().click();
  await selectCsv(page);
  await expect(page.getByText("No se confirmó el resultado de admisión")).toHaveCount(0);
  expect(state.posts()).toBe(1);
  const original = await page.evaluate(() => Object.entries(sessionStorage).find(([key]) => key.startsWith("g6:bulk:admission:v1:") && key.includes("g7-h4-owner-a"))?.[1] ?? null);
  expect(original).toBe(markerA);
});
