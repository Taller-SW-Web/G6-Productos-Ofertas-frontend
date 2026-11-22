import { adminPriceDefinition } from "../../../../tests/fixtures/adminPriceDefinition";
import { test, expect, type Page } from "@playwright/test";

// HTTP interceptado de forma explícita. No hay Gateway/DB real en esta suite.
const price = {
  product_id: "http-product",
  precio_regular: 12.3,
  precio_oferta: null,
  currency: "PEN",
  channel_id: null,
  valid_from: "2026-10-01T00:00:00Z",
  valid_until: null,
  price_version: 4,
};

function harnessUrl(path: string) {
  return "/src/features/pricing/testing/pricing-http.html?" + new URLSearchParams({ path });
}

async function mount(page: Page, path = "/precios?target=http-test") {
  await page.goto(harnessUrl(path));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function confirm(page: Page) {
  await page
    .getByRole("textbox", { name: "Nuevo precio regular", exact: true })
    .fill("14.00");
  await page
    .getByRole("textbox", { name: "Motivo del cambio", exact: true })
    .fill("Prueba del adaptador HTTP");
  await page
    .getByRole("radio", { name: "Retirar oferta", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar cambio de precio", exact: true })
    .click();
}

test("API: lectura con mapper real, sin controles mock y lectura antigua ante 503", async ({
  page,
}) => {
  let unavailable = false;
  await page.route("**/api/v1/precios/**", (route) =>
    route.fulfill({
      status: unavailable ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        unavailable ? { code: "SERVICIO_NO_DISPONIBLE" } : price,
      ),
    }),
  );
  await mount(page);
  const summary = page.getByRole("region", {
    name: "Producto HTTP de prueba",
    exact: true,
  });
  await expect(summary).toContainText("S/ 12.30");
  await expect(
    page.getByText("Escenario de guardado", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("consulta-http-1440.png"),
    fullPage: true,
  });
  unavailable = true;
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(
    page.getByText("Última consulta disponible", { exact: true }),
  ).toBeVisible();
  await expect(summary).toContainText("S/ 12.30");
  await expect(
    page.getByRole("link", { name: "Editar precio", exact: true }),
  ).toHaveCount(0);
});

test("API: PATCH confirmado conserva versión y reconsulta al volver a precio vigente", async ({
  page,
}) => {
  let stored = { ...price };
  let patches = 0;
  let reads = 0;
  await page.route("**/api/v1/precios/**", async (route) => {
    if (route.request().method() === "PATCH") {
      patches++;
      expect(route.request().postDataJSON()).toEqual({
        precioRegular: 14,
        precioOferta: null,
        accionPrecioOferta: "ELIMINAR",
        moneda: "PEN",
        motivoCambio: "Prueba del adaptador HTTP",
        priceVersion: 4,
        channelId: null,
      });
      stored = { ...price, precio_regular: 14, price_version: 5 };
    } else reads++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(route.request().url().includes("/administracion/") ? adminPriceDefinition(stored) : stored),
    });
  });
  await mount(page, "/precios/editar?target=http-test");
  await confirm(page);
  await expect(
    page.getByText("Precio actualizado", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Consultar el precio vigente", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Producto HTTP de prueba", exact: true }),
  ).toContainText("S/ 14.00");
  expect(patches).toBe(1);
  await expect(
    page.getByRole("heading", { level: 1, name: "Gestión de precios" }),
  ).toBeVisible();
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
  await page.screenshot({
    path: test.info().outputPath("precio-confirmado-http-1440.png"),
    fullPage: true,
  });
});

test("API: 409 conserva formulario, sin éxito ni segundo PATCH", async ({
  page,
}) => {
  let patches = 0;
  await page.route("**/api/v1/precios/**", async (route) => {
    const write = route.request().method() === "PATCH";
    if (write) patches++;
    await route.fulfill({
      status: write ? 409 : 200,
      contentType: "application/json",
      body: JSON.stringify(write ? { code: "VERSION_CONFLICT" } : adminPriceDefinition(price)),
    });
  });
  await mount(page, "/precios/editar?target=http-test");
  await confirm(page);
  await expect(
    page.getByText("El precio cambió desde tu consulta", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Motivo del cambio", exact: true }),
  ).toHaveValue("Prueba del adaptador HTTP");
  await expect(
    page.getByRole("button", { name: "Guardar cambios", exact: true }),
  ).toBeDisabled();
  expect(patches).toBe(1);
});

test("API: Retail usa la versión exacta del producto y el global heredado solo se consulta", async ({ page }) => {
  let hasRetail = true;
  const retail = { ...price, channel_id: "RETAIL", price_version: 7 };
  const requests: { path: string; method: string }[] = [];
  await page.route("**/api/v1/precios/**", route => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({ path: url.pathname + url.search, method: request.method() });
    if (request.method() === "PATCH") {
      expect(request.postDataJSON()).toMatchObject({ channelId: "RETAIL", priceVersion: 7 });
      return route.fulfill({ json: { ...retail, precio_regular: 14, price_version: 8 } });
    }
    if (url.pathname.includes("/administracion/")) {
      expect(url.searchParams.get("channelId")).toBe("RETAIL");
      return hasRetail
        ? route.fulfill({ json: adminPriceDefinition(retail) })
        : route.fulfill({ status: 404, json: { code: "PRECIO_NO_ENCONTRADO" } });
    }
    return route.fulfill({ json: price });
  });
  await mount(page, "/precios/editar?target=http-test&channel=retail");
  await confirm(page);
  await expect(page.getByText("Precio actualizado", { exact: true })).toBeVisible();
  hasRetail = false;
  await mount(page, "/precios?target=http-test&channel=retail");
  await expect(page.getByText("Fallback al precio global", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar precio", exact: true })).toHaveCount(0);
  await mount(page, "/precios/editar?target=http-test&channel=retail");
  await expect(page.getByText("Sin precio para editar", { exact: true })).toBeVisible();
  expect(requests.filter(item => item.method === "PATCH")).toEqual([{ path: "/api/v1/precios/productos/http-product", method: "PATCH" }]);
});

test("Pricing API no impide auditoría mock cuando se inyecta explícitamente su runtime", async ({
  page,
}) => {
  await mount(page, "/precios/auditoria");
  await expect(page.getByText("Mostrando 1 a 20 de 25")).toBeVisible();
  await expect(page.getByText(/simulad|demostración/i).first()).toBeVisible();
});

test("API: timeout y relectura anterior conservan formulario y bloqueo sin segundo PATCH", async ({ page }) => {
  let patches = 0;
  let stored = { ...price };
  await page.route("**/api/v1/precios/**", async (route) => {
    if (route.request().method() === "PATCH") {
      patches++;
      await route.abort("timedout");
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().url().includes("/administracion/") ? adminPriceDefinition(stored) : stored) });
  });
  await mount(page, "/precios/editar?target=http-test");
  await confirm(page);
  await expect(page.getByText("Resultado desconocido", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Releer precio", exact: true }).click();
  await expect(page.getByText(/La lectura no confirma una versión superior/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Nuevo precio regular", exact: true })).toHaveValue("14.00");
  await expect(page.getByRole("textbox", { name: "Motivo del cambio", exact: true })).toHaveValue("Prueba del adaptador HTTP");
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath("resultado-incierto-http-1440.png"), fullPage: true });
  stored = { ...price, precio_regular: 14, price_version: 5 };
  await page.getByRole("button", { name: "Releer precio", exact: true }).click();
  await expect(page.getByText("Comparar lectura y propuesta", { exact: true })).toBeVisible();
  await expect(page.getByText("Precio actualizado", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toBeDisabled();
  expect(patches).toBe(1);
});

test("API: la galería no muestra controles ni datos de demostración de Pricing", async ({
  page,
}) => {
  await mount(page, "/foundation/pricing");
  await expect(
    page.getByText("Muestras no disponibles", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Nuevo precio regular", exact: true }),
  ).toHaveCount(0);
});

test("API: prevalidación CSV por teclado distingue rechazo total de una admisión parcial", async ({ page }) => {
  let previews = 0;
  let admissions = 0;
  await page.route("**/api/v1/precios/importaciones**", async (route) => {
    if (!route.request().url().endsWith("/prevalidar")) {
      admissions++;
      await route.abort();
      return;
    }
    previews++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data; boundary=");
    expect(route.request().postData()).toContain('name="archivo"; filename="precios.csv"');
    expect(route.request().postData()).toContain("SKU-A");
    await route.fulfill({
      json: {
        valid: false,
        total_rows: 2,
        errors: [{ row_id: "3", sku: "SKU-A", status: "FAILED", code: "VERSION_CONFLICT" }],
      },
    });
  });
  await mount(page, "/precios/importar");
  const prevalidate = page.getByRole("button", { name: "Prevalidar archivo" });
  await expect(prevalidate).toBeDisabled();
  await page.locator('input[type="file"]').setInputFiles({
    name: "precios.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("sku\nSKU-A"),
  });
  await page.getByRole("radio", { name: "Rechazar el lote si hay errores" }).check();
  await prevalidate.focus();
  await expect(prevalidate).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("row").filter({ hasText: "SKU-A" })).toContainText("VERSION_CONFLICT");
  await expect(page.getByRole("button", { name: "Confirmar importación" })).toBeDisabled();
  await page.screenshot({
    path: test.info().outputPath("prevalidacion-http-1440.png"),
    fullPage: true,
  });
  await page.getByRole("radio", { name: "Permitir resultados parciales" }).check();
  await expect(page.getByRole("region", { name: "Revisión de prevalidación" })).toHaveCount(0);
  await prevalidate.click();
  await expect(page.getByRole("button", { name: "Confirmar importación" })).toBeEnabled();
  expect(previews).toBe(2);
  expect(admissions).toBe(0);
});

test("API: conserva la clave tras timeout y recarga, impide duplicados y abre el mismo lote", async ({ page }) => {
  const id = "12345678-1234-4234-8234-123456789abc";
  const path = "/precios/importar";
  const keys: string[] = [];
  await page.route("**/api/v1/precios/importaciones/prevalidar", (route) =>
    route.fulfill({ json: { valid: true, total_rows: 1, errors: [] } }),
  );
  await page.route("**/api/v1/precios/importaciones", async (route) => {
    const key = await route.request().headerValue("idempotency-key");
    if (!key) throw new Error("La admisión debe enviar Idempotency-Key.");
    keys.push(key);
    expect(route.request().postData()).toMatch(/name="allow_partial"\r\n\r\nfalse/);
    if (keys.length === 1) return route.abort("timedout");
    if (keys.length === 2)
      return route.fulfill({ status: 409, json: { code: "IDEMPOTENCY_CONFLICT" } });
    return route.fulfill({ status: 202, json: {
      batch_id: id, status: "QUEUED", allow_partial: false, correlation_id: id,
    } });
  });
  await page.route(`**/api/v1/precios/importaciones/${id}`, (route) =>
    route.fulfill({ json: {
      batch_id: id, status: "COMPLETED", allow_partial: false,
      total_rows: 1, completed_rows: 1, failed_rows: 0, rows: [],
    } }),
  );
  const select = (content: string) => page.locator('input[type="file"]').setInputFiles({
    name: "precios.csv", mimeType: "text/csv", buffer: Buffer.from(content),
  });
  await mount(page, path);
  await select("sku\nSKU-A");
  await page.getByRole("radio", { name: "Rechazar el lote si hay errores" }).check();
  await page.getByRole("button", { name: "Prevalidar archivo" }).click();
  const confirm = page.getByRole("button", { name: "Confirmar importación" });
  await expect(confirm).toBeEnabled();
  await confirm.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByText("El resultado no está confirmado.", { exact: false })).toBeVisible();
  expect(keys).toHaveLength(1);

  await page.route((url) => url.pathname === path, (route) =>
    route.fulfill({ status: 302, headers: { location: harnessUrl(path) } }),
  );
  await page.reload();
  const recover = page.getByRole("button", { name: "Recuperar importación" });
  await expect(recover).toBeDisabled();
  await select("sku\nSKU-DIFERENTE");
  await recover.click();
  await expect(page.getByText("Selecciona el mismo archivo y la misma política de la importación pendiente.")).toBeVisible();
  expect(keys).toHaveLength(1);
  await select("sku\nSKU-A");
  await recover.click();
  await expect(page.getByText("La clave de importación corresponde a otro archivo o política.")).toBeVisible();
  await recover.click();
  await expect(page.getByRole("heading", { name: "Resultado de importación" })).toBeVisible();
  await expect(page.getByText("Completado", { exact: true })).toBeVisible();
  expect(keys[0]).toMatch(/^[\da-f-]{36}$/i);
  expect(keys).toEqual([keys[0], keys[0], keys[0]]);
});

test("API: un lote existente se recupera de 503, vuelve a consultarse al recargar y descarga el CSV", async ({ page }) => {
  const id = "12345678-1234-4234-8234-123456789abc";
  const path = `/precios/importaciones/${id}`;
  let reads = 0;
  await page.route(`**/api/v1/precios/importaciones/${id}`, (route) => {
    reads++;
    if (reads === 2)
      return route.fulfill({ status: 503, json: { code: "SERVICIO_NO_DISPONIBLE" } });
    const terminal = reads > 2;
    return route.fulfill({
      json: {
        batch_id: id,
        status: terminal ? "PARTIAL" : "QUEUED",
        allow_partial: true,
        total_rows: 2,
        completed_rows: terminal ? 1 : 0,
        failed_rows: terminal ? 1 : 0,
        rows: terminal
          ? [{ row_id: "3", sku: "SKU-A", status: "FAILED", code: "VERSION_CONFLICT" }]
          : [],
      },
    });
  });
  await page.route(`**/api/v1/precios/importaciones/${id}/reporte`, (route) =>
    route.fulfill({ contentType: "text/csv", body: "row_id,sku,status,code\n3,SKU-A,FAILED,VERSION_CONFLICT\n" }),
  );
  await mount(page, path);
  const download = page.getByRole("button", { name: "Descargar reporte" });
  await expect(download).toBeDisabled();
  await expect(page.getByText("No se pudo actualizar el lote", { exact: true })).toBeVisible();
  await expect(page.getByText("Completado parcialmente", { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(reads).toBe(3);
  await page.route((url) => url.pathname === path, (route) =>
    route.fulfill({ status: 302, headers: { location: harnessUrl(path) } }),
  );
  await page.reload();
  await expect(download).toBeEnabled();
  const downloaded = page.waitForEvent("download");
  await download.click();
  expect((await downloaded).suggestedFilename()).toBe("reporte-precios.csv");
  await expect(page.getByText("Reporte descargado: reporte-precios.csv.")).toBeVisible();
});
