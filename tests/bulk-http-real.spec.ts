import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const browserOrigin = process.env.BULK_REAL_BROWSER_ORIGIN;
const jwt = process.env.BULK_REAL_JWT;
const ownerBJwt = process.env.BULK_REAL_OWNER_B_JWT;
const forbiddenJwt = process.env.BULK_REAL_FORBIDDEN_JWT;
const csvPath = process.env.BULK_REAL_CSV_PATH;
const retryCsvPath = process.env.BULK_REAL_RETRY_CSV_PATH;
const manifestJson = process.env.BULK_REAL_MANIFEST_JSON;
const manifestReleaseId = process.env.BULK_REAL_MANIFEST_RELEASE_ID;
const manifestSha256 = process.env.BULK_REAL_MANIFEST_SHA256;
const root = "/api/v1/carga-masiva/productos";

function buildInitPayload() {
  return {
    accessToken: jwt!,
    ownerBToken: ownerBJwt!,
    forbiddenToken: forbiddenJwt!,
    apiOrigin: browserOrigin!,
    manifest: manifestJson && manifestReleaseId && manifestSha256
      ? { manifestJson, authorizedReleaseId: manifestReleaseId, authorizedManifestSha256: manifestSha256 }
      : undefined,
  };
}

test.describe("MK-001 Bulk E2E navegador real (Gateway + Bulk + Catalog + PostgreSQL 17 + Storage)", () => {
  test("plantillas CSV/XLSX, validación, admisión sin doble clic, refresh, polling, resultado y exportaciones reales", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(browserOrigin).toBe(baseURL);
    expect(jwt).toMatch(/^eyJ/);
    expect(ownerBJwt).toMatch(/^eyJ/);
    expect(forbiddenJwt).toMatch(/^eyJ/);
    expect(csvPath, "el orquestador Backend debe preparar CSV válido desde Catalog descartable").toBeTruthy();

    await page.addInitScript((payload) => {
      window.__G6_BULK_E2E_JWT__ = payload.accessToken;
      window.__G6_BULK_E2E_OWNER_B_JWT__ = payload.ownerBToken;
      window.__G6_BULK_E2E_FORBIDDEN_JWT__ = payload.forbiddenToken;
      window.__G6_BULK_E2E_API_ORIGIN__ = payload.apiOrigin;
      if (payload.manifest) window.__G6_BULK_E2E_MANIFEST__ = payload.manifest;
    }, buildInitPayload());

    const requests: string[] = [];
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== browserOrigin) externalRequests.push(request.url());
      if (url.pathname.startsWith(root)) requests.push(`${request.method()} ${url.pathname}`);
    });

    await page.goto("/tests/harness/bulk-http-real.html#/carga-masiva/descargas");
    await expect(page.getByRole("heading", { name: "Descargas y exportación masiva" })).toBeVisible();

    // Keyboard & accessibility check at 1440px
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.keyboard.press("Tab");
    const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(activeTag).not.toBe("BODY");

    // 1. Descarga de plantillas CSV y XLSX
    for (const format of ["CSV", "XLSX"] as const) {
      if (format === "XLSX") await page.getByLabel("XLSX", { exact: true }).check();
      const responsePromise = page.waitForResponse((response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === `${root}/plantilla` &&
        new URL(response.url()).searchParams.get("formato") === format);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: format === "CSV" ? "Descargar CSV de ejemplo" : "Descargar XLSX" }).click();
      const [response, download] = await Promise.all([responsePromise, downloadPromise]);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain(format === "CSV" ? "text/csv" : "spreadsheetml.sheet");
      expect(download.suggestedFilename().toLowerCase()).toContain(format.toLowerCase());
      const target = await download.path();
      expect(target).toBeTruthy();
      const bytes = await readFile(target!);
      expect(bytes.length).toBeGreaterThan(20);
      if (format === "XLSX") expect(bytes.subarray(0, 2).toString("hex")).toBe("504b");
      else expect(bytes.toString("utf8")).toContain("sku");
      expect(createHash("sha256").update(bytes).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
    }

    // 2. Selección inválida bloqueada + selección válida + revisión
    await page.goto("/tests/harness/bulk-http-real.html#/carga-masiva");
    const picker = page.locator('input[type="file"]');
    await picker.setInputFiles({ name: "invalido.txt", mimeType: "text/plain", buffer: Buffer.from("no es csv", "utf8") });
    await expect(page.getByRole("button", { name: "Continuar a revisión" })).toBeDisabled();

    const file = await readFile(csvPath!);
    await picker.setInputFiles({ name: "bulk-browser-real.csv", mimeType: "text/csv", buffer: file });
    await expect(page.getByRole("button", { name: "Continuar a revisión" })).toBeEnabled();
    await page.getByRole("button", { name: "Continuar a revisión" }).click();
    await expect(page.getByRole("heading", { name: "Revisión de archivo" })).toBeVisible();
    await expect(page.getByText(/filas detectadas/i)).toBeVisible();

    // 3. Confirmación con doble clic bloqueado -> 1 solo POST -> 202 + batchId
    const admissionResponse = page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === `${root}/importaciones`);
    const confirm = page.getByRole("button", { name: "Confirmar importación" }).first();
    await confirm.dblclick();
    const response = await admissionResponse;
    expect(response.status()).toBe(202);
    const admission = await response.json() as { batch_id: string; status: string; correlation_id: string };
    expect(admission.batch_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(admission.status).toBe("QUEUED");
    await expect(page).toHaveURL(new RegExp(`/carga-masiva/importaciones/${admission.batch_id}$`));
    await expect.poll(() => requests.filter((request) => request === `POST ${root}/importaciones`).length).toBe(1);

    // 4. Recuperación tras refresh + polling automático + resultado terminal
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/carga-masiva/importaciones/${admission.batch_id}$`));
    await expect(page.getByRole("link", { name: /Ver resultado final/i }).first()).toBeVisible({ timeout: 60_000 });
    const stateReads = requests.filter((request) => request === `GET ${root}/importaciones/${admission.batch_id}`);
    expect(stateReads.length).toBeGreaterThan(0);

    const terminal = page.waitForResponse((candidate) =>
      candidate.request().method() === "GET" && new URL(candidate.url()).pathname === `${root}/importaciones/${admission.batch_id}`);
    await page.getByRole("link", { name: /Ver resultado final/i }).first().click();
    expect((await terminal).status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Resultado de importación/i })).toBeVisible();
    await expect(page.locator("main")).toContainText(/CATALOGO|Catálogo/i);

    // 5. Exportaciones reales CSV y XLSX
    await page.goto("/tests/harness/bulk-http-real.html#/carga-masiva/descargas");
    for (const exportFormat of ["CSV", "XLSX"] as const) {
      await page.getByLabel(exportFormat === "CSV" ? "CSV (Valores separados por comas)" : "XLSX (Libro de Excel)").check();
      const createExportResponse = page.waitForResponse((res) =>
        res.request().method() === "POST" && new URL(res.url()).pathname === `${root}/exportaciones`);
      await page.getByRole("button", { name: "Solicitar exportación" }).click();
      expect((await createExportResponse).status()).toBe(202);

      const downloadButtonName = exportFormat === "CSV"
        ? "Descargar archivo CSV consolidado"
        : "Descargar archivo XLSX consolidado";
      const downloadBtn = page.getByRole("button", { name: downloadButtonName });
      for (let attempt = 0; attempt < 20; attempt++) {
        if (await downloadBtn.isVisible().catch(() => false) && await downloadBtn.isEnabled().catch(() => false)) break;
        const refreshBtn = page.getByRole("button", { name: "Actualizar estado" });
        if (await refreshBtn.isVisible().catch(() => false)) await refreshBtn.click();
        await page.waitForTimeout(500);
      }
      await expect(downloadBtn).toBeEnabled({ timeout: 30_000 });
      const dlPromise = page.waitForEvent("download");
      await downloadBtn.click();
      const dl = await dlPromise;
      const dlPath = await dl.path();
      expect(dlPath).toBeTruthy();
      const dlBytes = await readFile(dlPath!);
      expect(dlBytes.length).toBeGreaterThan(20);
      if (exportFormat === "XLSX") expect(dlBytes.subarray(0, 2).toString("hex")).toBe("504b");
      else expect(dlBytes.toString("utf8")).toContain("sku");
    }

    expect(externalRequests, "Prohibido contactar orígenes externos no autorizados").toEqual([]);
  });

  test("conciliación de admisión ambigua, rechazo transitorio Catalog, reanudación selectiva, recarga, reporte real y aislamiento 401/403/404", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(retryCsvPath, "el orquestador Backend debe preparar CSV de retry Catalog").toBeTruthy();

    await page.addInitScript((payload) => {
      window.__G6_BULK_E2E_JWT__ = payload.accessToken;
      window.__G6_BULK_E2E_OWNER_B_JWT__ = payload.ownerBToken;
      window.__G6_BULK_E2E_FORBIDDEN_JWT__ = payload.forbiddenToken;
      window.__G6_BULK_E2E_API_ORIGIN__ = payload.apiOrigin;
      if (payload.manifest) window.__G6_BULK_E2E_MANIFEST__ = payload.manifest;
    }, buildInitPayload());

    const postImports: string[] = [];
    const postResumes: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname === `${root}/importaciones`) postImports.push(url.pathname);
      if (request.method() === "POST" && url.pathname.endsWith("/reanudar")) postResumes.push(url.pathname);
    });

    const retryFile = await readFile(retryCsvPath!);
    await page.goto("/tests/harness/bulk-http-real.html#/carga-masiva");
    await page.locator('input[type="file"]').setInputFiles({ name: "bulk-ambiguous-retry.csv", mimeType: "text/csv", buffer: retryFile });
    await page.getByRole("button", { name: "Continuar a revisión" }).click();
    await expect(page.getByRole("heading", { name: "Revisión de archivo" })).toBeVisible();

    // El proxy Backend inyecta fallo HTTP 504 DESPUÉS de que Bulk confirme el primer POST de bulk-ambiguous-retry.csv
    const reconcilePromise = page.waitForResponse((res) =>
      res.request().method() === "GET" && new URL(res.url()).pathname.startsWith(`${root}/importaciones/por-correlacion/`));
    await page.getByRole("button", { name: "Confirmar importación" }).first().click();

    // Conciliación automática o manual tras admisión ambigua, sin enviar segundo POST
    const reconcileBtn = page.getByRole("button", { name: "Volver a conciliar" });
    if (await reconcileBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reconcileBtn.click();
    }
    const reconcileRes = await reconcilePromise;
    expect(reconcileRes.status()).toBe(200);
    const reconciledBatch = await reconcileRes.json() as { batch_id: string };
    const batchId = reconciledBatch.batch_id;
    await expect(page).toHaveURL(new RegExp(`/carga-masiva/importaciones/${batchId}`), { timeout: 30_000 });
    expect(postImports, "No debe enviarse un segundo POST tras admisión ambigua").toHaveLength(1);

    // Esperar a que termine el primer intento con fallo transitorio en Catalog
    await expect(page.getByRole("link", { name: /Ver resultado final/i }).first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole("link", { name: /Ver resultado final/i }).first().click();
    await expect(page.getByRole("heading", { name: /Resultado de importación/i })).toBeVisible();

    // Verificar elegibilidad calculada por Backend y reanudación exclusiva de Catalog
    const resumeBtn = page.getByRole("button", { name: "Reanudar operaciones pendientes" });
    await expect(resumeBtn).toBeVisible({ timeout: 20_000 });
    await expect(resumeBtn).toBeEnabled();
    await resumeBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: /Reanudar|Confirmar/i }).click();
    await expect.poll(() => postResumes.length).toBe(1);

    // Persistencia de intención de retry durante recarga + resultado V2 terminal
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/carga-masiva/importaciones/${batchId}/resultado`));
    await expect(page.locator("main")).toContainText(/COMPLETED|Completado|sin errores/i, { timeout: 60_000 });
    expect(postResumes).toHaveLength(1);

    // Descarga de reporte auténtico
    const reportBtn = page.getByRole("button", { name: "Descargar reporte de errores" });
    if (await reportBtn.isVisible().catch(() => false) && await reportBtn.isEnabled().catch(() => false)) {
      const reportResPromise = page.waitForResponse((res) =>
        res.request().method() === "GET" && new URL(res.url()).pathname === `${root}/importaciones/${batchId}/reporte`);
      const reportDlPromise = page.waitForEvent("download");
      await reportBtn.click();
      const [reportRes, reportDl] = await Promise.all([reportResPromise, reportDlPromise]);
      expect(reportRes.status()).toBe(200);
      const reportPath = await reportDl.path();
      expect((await readFile(reportPath!)).length).toBeGreaterThan(10);
    }

    // Aislamiento de propietario ajeno (owner-b -> 404) y errores 401/403
    await page.evaluate(() => window.__G6_BULK_E2E_SET_IDENTITY__?.("owner-b"));
    const otherOwnerResponse = page.waitForResponse((res) =>
      res.request().method() === "GET" && new URL(res.url()).pathname === `${root}/importaciones/${batchId}`);
    await page.goto(`/tests/harness/bulk-http-real.html#/carga-masiva/importaciones/${batchId}/resultado`);
    expect((await otherOwnerResponse).status()).toBe(404);
    await expect(page.getByText(/Lote no encontrado/i)).toBeVisible();

    await page.evaluate(() => window.__G6_BULK_E2E_SET_IDENTITY__?.("forbidden"));
    const forbiddenResponse = page.waitForResponse((res) =>
      res.request().method() === "GET" && new URL(res.url()).pathname === `${root}/importaciones/${batchId}`);
    await page.reload();
    expect([401, 403]).toContain((await forbiddenResponse).status());

    await page.evaluate(() => window.__G6_BULK_E2E_SET_IDENTITY__?.("anonymous"));
    await page.reload();
    await expect(page.getByText(/Inicia sesión|no se pudo|401|autoriz/i)).toBeVisible();
  });
});
