import { expect, test } from "@playwright/test";

for (const status of [401, 403, 503]) {
  test(`INT08-${status}: muestra el error del contrato y no rellena el listado`, async ({ page }) => {
    await page.route("https://gateway.test/api/v1/**", route => route.fulfill({
      status,
      contentType: "application/problem+json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ code: status === 401 ? "TOKEN_INVALIDO" : status === 403 ? "SCOPE_INSUFICIENTE" : "SERVICIO_NO_DISPONIBLE" }),
    }));
    await page.goto("/tests/harness/catalog-http.html?path=/productos");
    await expect(page.getByRole("heading", { name: "Gestión de productos" })).toBeVisible();
    await expect(page.getByText(new RegExp(`${status},`)).first()).toBeVisible();
    await expect(page.getByText("Camiseta Running Endurance", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: "CAM-RUN" })).toHaveCount(0);
  });
}
