import { test, expect } from "@playwright/test";

// TAC-P0-08 — escenario obligatorio de la auditoría de Marco.
//
// Se ejecuta con el adaptador HTTP REAL (`createHttpInventoryRepository`)
// montado sobre un transporte de prueba que responde el contrato OpenAPI ya
// validado por las pruebas unitarias. El fallo de presentación ocurre DESPUÉS
// del 200 de confirmación, que es exactamente el caso que el auditor exige
// verificar en el flujo del modal.
test.describe("TAC-P0-08: escritura confirmada y fallo de presentación", () => {
  test("POST 200 confirmado + fallo de presentación no permite una segunda intención", async ({
    page,
  }) => {
    await page.goto(
      "/tests/harness/inventory-http.html?path=/inventario/traslados",
    );

    await expect(
      page.getByRole("heading", {
        name: "Traslados y recepciones de inventario",
      }),
    ).toBeVisible();
    await expect(page.getByText("TR-HTTP-001")).toBeVisible();

    // El resolvedor de presentación fallará después de la confirmación.
    await page.evaluate(() =>
      window.inventoryHttpScenario.setPresentationDown(true),
    );

    await page
      .getByRole("button", { name: "Recepcionar traslado TR-HTTP-001" })
      .click();
    const dialog = page.getByRole("dialog", { name: /Registrar recep/i });
    await expect(dialog).toBeVisible();

    const qty = dialog.getByRole("textbox", { name: /Cantidad recibida/i });
    const note = dialog.getByRole("textbox", { name: /Nota u observaci/i });
    const finalReceipt = dialog.getByRole("checkbox", {
      name: /Marcar como recepción final/i,
    });
    const confirm = dialog.getByRole("button", { name: /Confirmar recep/i });

    await qty.fill("4");
    await note.fill("Recepción parcial verificada");
    await finalReceipt.uncheck();
    await confirm.click();

    // El 200 confirmó la escritura: el aviso es de PRESENTACIÓN, nunca un
    // "no se pudo registrar la recepción".
    await expect(
      dialog.getByText("Recepción registrada — vista pendiente de actualizar"),
    ).toBeVisible();
    await expect(
      dialog.getByText("No se pudo registrar la recepción"),
    ).toHaveCount(0);

    // El formulario queda bloqueado con el snapshot confirmado: no se puede
    // cambiar la cantidad ni la nota desde una vista desactualizada.
    await expect(qty).toBeDisabled();
    await expect(note).toBeDisabled();
    await expect(confirm).toBeDisabled();
    await expect(qty).toHaveValue("4");
    await expect(note).toHaveValue("Recepción parcial verificada");

    // Un intento de reenviar el formulario bloqueado no repite el POST: el
    // adaptador devuelve la confirmación cacheada de la MISMA intención.
    await dialog
      .locator("form")
      .evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await page.waitForTimeout(150);
    expect(
      await page.evaluate(() => window.inventoryHttpScenario.postCount()),
    ).toBe(1);
    expect(
      await page.evaluate(() => window.inventoryHttpScenario.confirmedQuantity()),
    ).toBe(4);

    // Al cerrar, la bandeja conserva el aviso de presentación y la vista sigue
    // desactualizada porque el listado tampoco pudo presentarse.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText("Recepción registrada — vista pendiente de actualizar"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();

    // Solo un listado COMPLETO y presentable actualiza el traslado y habilita
    // una nueva intención legítima.
    await page.evaluate(() =>
      window.inventoryHttpScenario.setPresentationDown(false),
    );
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(page.getByText("TR-HTTP-001")).toBeVisible();

    await page
      .getByRole("button", { name: "Recepcionar traslado TR-HTTP-001" })
      .click();
    const reopened = page.getByRole("dialog", { name: /Registrar recep/i });
    await expect(reopened).toBeVisible();

    const qtyAfterRefresh = reopened.getByRole("textbox", {
      name: /Cantidad recibida/i,
    });
    await expect(qtyAfterRefresh).toBeEnabled();
    // 10 despachadas - 4 ya confirmadas = 6 pendientes.
    await expect(qtyAfterRefresh).toHaveValue("6");

    const firstOperationId = await page.evaluate(() =>
      window.inventoryHttpScenario.lastOperationId(),
    );

    await qtyAfterRefresh.fill("6");
    await reopened.getByRole("button", { name: /Confirmar recep/i }).click();

    await expect(reopened).toBeHidden();
    await expect(page.getByText("Operación completada")).toBeVisible();
    expect(
      await page.evaluate(() => window.inventoryHttpScenario.postCount()),
    ).toBe(2);
    const secondOperationId = await page.evaluate(() =>
      window.inventoryHttpScenario.lastOperationId(),
    );
    expect(secondOperationId).not.toBe(firstOperationId);
    expect(
      await page.evaluate(() => window.inventoryHttpScenario.confirmedQuantity()),
    ).toBe(10);
  });
});
