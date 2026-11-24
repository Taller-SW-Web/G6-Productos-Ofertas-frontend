import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const browserOrigin = process.env.BULK_REAL_BROWSER_ORIGIN;
const jwt = process.env.BULK_REAL_JWT;
const forbiddenJwt = process.env.BULK_REAL_FORBIDDEN_JWT;
const csvPath = process.env.BULK_REAL_CSV_PATH;
const root = "/api/v1/carga-masiva/productos";

test("Chromium usa Gateway y Bulk reales para plantillas, admisión y resultado terminal", async ({ page, baseURL }) => {
  expect(browserOrigin).toBe(baseURL);
  expect(jwt).toMatch(/^eyJ/);
  expect(forbiddenJwt).toMatch(/^eyJ/);
  expect(csvPath, "el orquestador Backend debe preparar CSV válido desde Catalog descartable").toBeTruthy();
  await page.addInitScript(({ accessToken, forbiddenToken, apiOrigin }) => {
    window.__G6_BULK_E2E_JWT__ = accessToken;
    window.__G6_BULK_E2E_FORBIDDEN_JWT__ = forbiddenToken;
    window.__G6_BULK_E2E_API_ORIGIN__ = apiOrigin;
  }, { accessToken: jwt!, forbiddenToken: forbiddenJwt!, apiOrigin: browserOrigin! });

  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith(root)) requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await page.goto("/tests/harness/bulk-http-real.html#/carga-masiva/descargas");

  for (const format of ["CSV", "XLSX"] as const) {
    if (format === "XLSX") await page.getByLabel("XLSX").check();
    const responsePromise = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname === `${root}/plantilla` && new URL(response.url()).searchParams.get("formato") === format);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: format === "CSV" ? "Descargar CSV de ejemplo" : "Descargar XLSX" }).click();
    const [response, download] = await Promise.all([responsePromise, downloadPromise]);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(format === "CSV" ? "text/csv" : "spreadsheetml.sheet");
    expect(response.headers()["content-disposition"]).toMatch(/filename=/i);
    const target = await download.path();
    expect(target).toBeTruthy();
    const bytes = await readFile(target!);
    expect(bytes.length).toBeGreaterThan(20);
    if (format === "XLSX") expect(bytes.subarray(0, 2).toString("hex")).toBe("504b");
    else expect(bytes.toString("utf8")).toContain("sku");
    expect(createHash("sha256").update(bytes).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
  }

  const file = await readFile(csvPath!);
  await page.goto("/tests/harness/bulk-http-real.html#/carga-masiva");
  const picker = page.locator('input[type="file"]');
  await picker.setInputFiles({ name: "bulk-browser-real.csv", mimeType: "text/csv", buffer: file });
  await expect(page.getByRole("button", { name: "Continuar a revisión" })).toBeEnabled();
  await page.getByRole("button", { name: "Continuar a revisión" }).click();
  await expect(page.getByRole("heading", { name: "Revisión de archivo" })).toBeVisible();
  await expect(page.getByText(/filas detectadas/i)).toBeVisible();

  const admissionResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `${root}/importaciones`);
  const confirm = page.getByRole("button", { name: "Confirmar importación" }).first();
  await confirm.dblclick();
  const response = await admissionResponse;
  expect(response.status()).toBe(202);
  const admission = await response.json() as { batch_id: string; status: string; correlation_id: string };
  expect(admission.batch_id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(admission.status).toBe("QUEUED");
  await expect(page).toHaveURL(new RegExp(`/carga-masiva/importaciones/${admission.batch_id}$`));
  await expect.poll(() => requests.filter((request) => request === `POST ${root}/importaciones`).length).toBe(1);

  await expect(page.getByRole("link", { name: /Ver resultado final/i })).toBeVisible({ timeout: 60_000 });
  const stateReads = requests.filter((request) => request === `GET ${root}/importaciones/${admission.batch_id}`);
  expect(stateReads.length).toBeGreaterThan(0);
  const terminal = page.waitForResponse((candidate) => candidate.request().method() === "GET" && new URL(candidate.url()).pathname === `${root}/importaciones/${admission.batch_id}`);
  await page.getByRole("link", { name: /Ver resultado final/i }).click();
  expect((await terminal).status()).toBe(200);
  await expect(page.getByRole("heading", { name: /Resultado de importación/i })).toBeVisible();
  await expect(page.locator("main")).toContainText(/CATALOGO|Catálogo/i);
});
