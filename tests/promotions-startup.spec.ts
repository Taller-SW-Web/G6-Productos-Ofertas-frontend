import { expect, test } from "@playwright/test";
import { createOptionalPromotionSessionRuntime } from "../src/features/promotions/services/promotionSessionRuntime";

test("la composición opcional conserva HTTPS y rechaza credenciales/configuración inválida", () => {
  for (const [gateway, security] of [
    ["http://gateway.example.test", "https://g7.example.test/api/v1"],
    ["https://gateway.example.test", "http://g7.example.test/api/v1"],
    ["https://user:secret@gateway.example.test", "https://g7.example.test/api/v1"],
    ["invalid", "https://g7.example.test/api/v1"],
  ]) expect(createOptionalPromotionSessionRuntime(gateway!, security!)).toBeNull();
  const runtime = createOptionalPromotionSessionRuntime("https://gateway.example.test", "https://g7.example.test/api/v1");
  expect(runtime?.session.snapshot().user).toBeNull();
  expect(runtime?.services.coupons).toBeDefined();
});

for (const [name, mode, gateway, security, integrated] of [
  ["ambas válidas", "api", "https://gateway.example.test", "https://g7.example.test/api/v1", true],
  ["solo Gateway", "api", "https://gateway.example.test", undefined, false],
  ["solo G7", "api", undefined, "https://g7.example.test/api/v1", false],
  ["ninguna", "api", undefined, undefined, false],
  ["ambas con HTTP inseguro", "api", "http://gateway.example.test", "http://g7.example.test/api/v1", false],
  ["mock con configuración parcial", "mock", "https://gateway.example.test", undefined, false],
  ["mock con ambas", "mock", "https://gateway.example.test", "https://g7.example.test/api/v1", false],
] as const) {
  test(`arranque real: ${name} conserva módulos independientes`, async ({ page }) => {
    const errors: string[] = [], calls: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (request.url().includes("/api/v1")) calls.push(request.url()); });
    await page.route("**/src/main.tsx*", async route => {
      const response = await route.fetch();
      let body = await response.text();
      for (const [variable, value] of [["VITE_DATA_MODE", mode], ["VITE_GATEWAY_ORIGIN", gateway], ["VITE_G7_API_BASE", security]] as const) {
        const pattern = new RegExp(`import\\.meta\\.env\\.${variable}`, "g");
        expect(body).toMatch(pattern);
        body = body.replace(pattern, value === undefined ? "undefined" : JSON.stringify(value));
      }
      await route.fulfill({ response, body });
    });
    await page.goto("/precios");
    await expect(page.getByRole("navigation", { name: "Navegación de la aplicación" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const [label, path] of [["Gestión de productos", "/productos"], ["Gestión de combos", "/combos"]]) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toHaveCount(0);
      if (mode === "mock") await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    }
    await page.getByRole("link", { name: "Cupones de descuento", exact: true }).click();
    await expect(page).toHaveURL(/\/cupones$/);
    if (mode === "mock") await expect(page.getByRole("heading", { name: "Cupones de descuento", exact: true })).toBeVisible();
    else if (integrated) await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    else {
      await expect(page.getByRole("alert", { name: "Función no disponible", exact: true })).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
    }
    expect(calls).toEqual([]);
    expect(errors).toEqual([]);
  });
}
