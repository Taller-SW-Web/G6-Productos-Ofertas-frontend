import { test, expect } from "@playwright/test";
import { mockBulkRepository } from "../src/features/bulk/adapters/mockBulkRepository";

test.describe("MK-001 — Carga y exportación masiva de productos (Regresión C01-C24)", () => {
  test.beforeEach(async ({ page }) => {
    mockBulkRepository.resetMockState?.();
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // C01: Consultar 5 veces batch-queued no muta el estado (idempotencia)
  test("C01: Multiple queries to batch-queued return immutable state without side-effects", async () => {
    const q1 = await mockBulkRepository.getImport("batch-queued");
    const q2 = await mockBulkRepository.getImport("batch-queued");
    const q3 = await mockBulkRepository.getImport("batch-queued");
    const q4 = await mockBulkRepository.getImport("batch-queued");
    const q5 = await mockBulkRepository.getImport("batch-queued");

    expect(q1?.status).toBe("QUEUED");
    expect(q2?.status).toBe("QUEUED");
    expect(q3?.status).toBe("QUEUED");
    expect(q4?.status).toBe("QUEUED");
    expect(q5?.status).toBe("QUEUED");
    expect(q5?.completed_rows).toBe(0);
    expect(q5?.failed_rows).toBe(0);
  });

  // C02: Crear importación nueva -> primer estado QUEUED
  test("C02: New import starts in QUEUED and reads remain QUEUED until explicitly advanced", async () => {
    const file = new File(["sku,nombre\nNK-1,Prod 1\n"], "nuevo.csv", { type: "text/csv" });
    const batch = await mockBulkRepository.createImport(file);
    expect(batch.status).toBe("QUEUED");
    expect(batch.completed_rows).toBe(0);

    const read = await mockBulkRepository.getImport(batch.batch_id);
    expect(read?.status).toBe("QUEUED");
  });

  // C03: Avanzar simulación -> transición explícita
  test("C03: Advance simulation explicitly transitions QUEUED -> PROCESSING -> COMPLETED", async () => {
    const file = new File(["sku,nombre\nNK-1,Prod 1\n"], "nuevo.csv", { type: "text/csv" });
    const batch = await mockBulkRepository.createImport(file);

    const step1 = await mockBulkRepository.advanceMockImport?.(batch.batch_id);
    expect(step1?.status).toBe("PROCESSING");

    const step2 = await mockBulkRepository.advanceMockImport?.(batch.batch_id);
    expect(step2?.status).toBe("COMPLETED");
  });

  // C04 & C05: Reanudar batch-partial conserva mismo ID y contadores
  test("C04 & C05: Resume batch-partial preserves same batch_id and confirmed completed rows", async () => {
    const resumed = await mockBulkRepository.resumeImport("batch-partial");
    expect(resumed.batch_id).toBe("batch-partial");
    expect(resumed.status).toBe("QUEUED");
    expect(resumed.completed_rows).toBe(114);
    expect(resumed.failed_rows).toBe(6);

    const query = await mockBulkRepository.getImport("batch-partial");
    expect(query?.status).toBe("QUEUED");
    expect(query?.completed_rows).toBe(114);
  });

  // C06: Reanudar lote sin pendientes produce rechazo controlado
  test("C06: Resume batch without pending/reconciliation items is rejected", async () => {
    await expect(mockBulkRepository.resumeImport("batch-completed")).rejects.toThrow(
      /no contiene operaciones pendientes ni requiere reconciliación/,
    );
  });

  // C07: Descargar reporte parcial contiene filas correspondientes
  test("C07: Download partial report contains 6 failed rows with correct error codes", async () => {
    const report = await mockBulkRepository.getImportReport("batch-partial");
    expect(report).not.toBeNull();
    const text = await report!.blob.text();
    expect(text).toContain("UBICACION_NO_ENCONTRADA");
    expect(text).toContain("PRECIO_INVALIDO");
    expect(text).toContain("SKU_DUPLICADO");
  });

  // C08: Descargar reporte Inventario contiene errores de inventario exclusivamente
  test("C08: Download inventory-failed report contains only inventory domain errors", async () => {
    const report = await mockBulkRepository.getImportReport("batch-inventory-failed");
    expect(report).not.toBeNull();
    const text = await report!.blob.text();
    expect(text).toContain("NK-RN-002-44");
    expect(text).toContain("INVENTARIO");
    expect(text).not.toContain("PRICING");
  });

  // C09: Descargar reporte Pricing contiene errores de pricing exclusivamente
  test("C09: Download pricing-failed report contains only pricing domain errors", async () => {
    const report = await mockBulkRepository.getImportReport("batch-pricing-failed");
    expect(report).not.toBeNull();
    const text = await report!.blob.text();
    expect(text).toContain("PRECIO_INVALIDO");
    expect(text).toContain("PRICING");
    expect(text).not.toContain("INVENTARIO");
  });

  // C10 & C11: Solicitar y descargar CSV
  test("C10 & C11: Request CSV export and download completed file", async () => {
    const file = await mockBulkRepository.getExportFile("export-completed");
    expect(file).not.toBeNull();
    expect(file?.fileName).toContain(".csv");
    const content = await file!.blob.text();
    expect(content).toContain("NK-RN-001-42");
  });

  // C12 & C13: XLSX export does not claim false download in demo
  test("C12 & C13: XLSX export does not return pseudo-csv file and download is null", async () => {
    const file = await mockBulkRepository.getExportFile("export-processing");
    expect(file).toBeNull();
  });

  // C14: Consultar exportación no produce transición
  test("C14: Querying export job is idempotent and does not mutate status", async () => {
    const q1 = await mockBulkRepository.getExport("export-queued");
    const q2 = await mockBulkRepository.getExport("export-queued");
    expect(q1?.status).toBe("QUEUED");
    expect(q2?.status).toBe("QUEUED");
  });

  // C15: Seleccionar A y luego B muestra solo B
  test("C15: S01 quickly selecting A then B applies only review B", async ({ page }) => {
    await page.goto("/carga-masiva");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "archivo_a.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("sku,nombre\nSKU-A,Producto A\n"),
    });
    await fileInput.setInputFiles({
      name: "archivo_b.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("sku,nombre\nSKU-B,Producto B\n"),
    });

    await expect(page.getByText("archivo_b.csv", { exact: false }).first()).toBeVisible();
    await page.getByRole("button", { name: "Continuar a revisión", exact: true }).click();
    await expect(page).toHaveURL("/carga-masiva/revisar");
    await expect(page.getByText("archivo_b.csv", { exact: false }).first()).toBeVisible();
  });

  // C16: Limpiar archivo invalida estado
  test("C16: Clear file invalidates selection and disables continue", async ({ page }) => {
    await page.goto("/carga-masiva");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "prueba.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("sku,nombre\nSKU-1,Prod 1\n"),
    });
    const clearBtn = page.getByRole("button", { name: "Limpiar selección", exact: true });
    await clearBtn.click();
    await expect(page.getByRole("button", { name: "Continuar a revisión", exact: true })).toBeDisabled();
  });

  // C17: CSV con comillas y saltos de línea se parsea correctamente
  test("C17: CSV with quoted fields and linebreaks parses without error", async ({ page }) => {
    await page.goto("/carga-masiva");
    const fileInput = page.locator('input[type="file"]');
    const complexCsv = 'sku,nombre,descripcion\nSKU-1,"Zapatilla, Pro","Descripcion\nmultilinea"\n';
    await fileInput.setInputFiles({
      name: "complejo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(complexCsv),
    });
    await expect(page.getByRole("button", { name: "Continuar a revisión", exact: true })).toBeEnabled();
  });

  // C18: CSV malformado muestra error estructural
  test("C18: Malformed CSV with unclosed quotes displays structural error", async ({ page }) => {
    await page.goto("/carga-masiva");
    const fileInput = page.locator('input[type="file"]');
    const malformedCsv = 'sku,nombre\n"SKU-UNCLOSED,Prod\n';
    await fileInput.setInputFiles({
      name: "malformado.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(malformedCsv),
    });
    await expect(page.getByText("comillas sin cerrar", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar a revisión", exact: true })).toBeDisabled();
  });

  // C19: S02 sin archivo muestra EmptyState con retorno seguro
  test("C19: Direct navigation to S02 without file shows recovery state", async ({ page }) => {
    await page.goto("/carga-masiva/revisar");
    await expect(page.getByText("Ningún archivo seleccionado", { exact: true })).toBeVisible();
    const returnLink = page.getByRole("link", { name: "Ir a selección de archivo", exact: true });
    await returnLink.click();
    await expect(page).toHaveURL("/carga-masiva");
  });

  // C20: Doble confirmación en S02 no crea dos lotes
  test("C20: S02 double click on confirm import generates only one batch", async ({ page }) => {
    // 1. Verify in browser that multiple rapid clicks do not dispatch multiple batch creations
    await page.goto("/carga-masiva");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "lote_c20.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("sku,nombre\nSKU-1,Prod 1\n"),
    });
    await page.getByRole("button", { name: "Continuar a revisión", exact: true }).click();
    await expect(page).toHaveURL("/carga-masiva/revisar");

    // Install spy directly on bulkService in the browser runtime
    await page.evaluate(() => {
      const win = window as unknown as {
        __bulkService?: { createImport: (...args: unknown[]) => unknown };
        __createImportCalls?: number;
      };
      win.__createImportCalls = 0;
      if (win.__bulkService) {
        const original = win.__bulkService.createImport.bind(win.__bulkService);
        win.__bulkService.createImport = async (...args: unknown[]) => {
          win.__createImportCalls = (win.__createImportCalls ?? 0) + 1;
          return original(...args);
        };
      }
    });

    // Locate the two confirmation buttons present on S02 (header and bottom)
    const headerConfirmBtn = page.getByRole("button", { name: "Confirmar importación", exact: true }).first();
    const bottomConfirmBtn = page.getByRole("button", { name: "Confirmar importación", exact: true }).nth(1);

    // Simulate concurrent rapid attempts on confirmation buttons
    await Promise.all([
      headerConfirmBtn.dispatchEvent("click"),
      bottomConfirmBtn.dispatchEvent("click"),
    ]);
    await expect(page).toHaveURL(/\/carga-masiva\/importaciones\/lote-/);

    // Assert that bulkService.createImport was called exactly once in the browser
    const browserCalls = await page.evaluate(() => {
      const win = window as unknown as { __createImportCalls?: number };
      return win.__createImportCalls ?? 0;
    });
    expect(browserCalls).toBe(1);
  });

  // C21: Lote desconocido muestra estado no encontrado controlado
  test("C21: Unknown batch ID shows graceful not found state", async ({ page }) => {
    await page.goto("/carga-masiva/importaciones/lote-inexistente-999");
    await expect(page.getByText("No se encontró el lote con identificador lote-inexistente-999", { exact: false })).toBeVisible();
  });

  // C22: /precios permanece intacto
  test("C22: Existing /precios page continues working normally", async ({ page }) => {
    await page.goto("/precios");
    await expect(page.getByRole("heading", { name: "Gestión de precios", exact: true })).toBeVisible();
  });

  // C23: Navegación de Bulk y retorno entre vistas
  test("C23: Bulk downloads page header provides return link to /carga-masiva", async ({ page }) => {
    await page.goto("/carga-masiva/descargas");
    await expect(page.getByRole("heading", { name: "Descargas y exportación masiva" })).toBeVisible();
    const backBtn = page.getByRole("link", { name: "Volver a carga de archivo", exact: true });
    await backBtn.click();
    await expect(page).toHaveURL("/carga-masiva");
    await expect(page.getByRole("heading", { name: "Carga masiva de productos" })).toBeVisible();
  });

  // C24: Exportación fallida no habilita descarga
  test("C24: Failed export job displays error alert and disables download button", async ({ page }) => {
    await page.goto("/carga-masiva/descargas?export_id=export-failed");
    await expect(page.getByRole("heading", { name: "Descargas y exportación masiva" })).toBeVisible();
    await expect(page.getByText("Fallo de exportación")).toBeVisible();
    await expect(page.getByText("Error interno al consolidar snapshot de inventario para exportación")).toBeVisible();
    const downloadBtn = page.getByRole("button", { name: "Descargar archivo CSV consolidado", exact: true });
    await expect(downloadBtn).toBeDisabled();
  });

  // R04: Archivo con 3 filas no genera 120 filas ficticias
  test("R04: File with 3 data rows sets total_rows to 3", async () => {
    const file = new File(["sku,nombre\nSKU-1,P1\nSKU-2,P2\nSKU-3,P3\n"], "tres_filas.csv", { type: "text/csv" });
    const batch = await mockBulkRepository.createImport(file);
    expect(batch.total_rows).toBe(3);
  });

  // R16: Identificadores consecutivos sin colisiones
  test("R16: Consecutive IDs are unique and do not collide", async () => {
    const file = new File(["sku,nombre\nSKU-1,P1\n"], "item.csv", { type: "text/csv" });
    const b1 = await mockBulkRepository.createImport(file);
    const b2 = await mockBulkRepository.createImport(file);
    expect(b1.batch_id).not.toBe(b2.batch_id);

    const e1 = await mockBulkRepository.createExport("CSV");
    const e2 = await mockBulkRepository.createExport("CSV");
    expect(e1.export_id).not.toBe(e2.export_id);
  });

  // R20: Nueva carga limpia el estado de selección anterior
  test("R20: Nueva carga masiva resets file selection context", async ({ page }) => {
    await page.goto("/carga-masiva");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "previo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("sku,nombre\nSKU-1,Prod 1\n"),
    });
    await page.getByRole("button", { name: "Continuar a revisión", exact: true }).click();
    await expect(page).toHaveURL("/carga-masiva/revisar");

    await page.getByRole("button", { name: "Confirmar importación", exact: true }).first().click();
    await expect(page).toHaveURL(/\/carga-masiva\/importaciones\//);

    // Click "Nueva carga masiva"
    await page.getByRole("link", { name: "Nueva carga masiva", exact: true }).first().click();
    await expect(page).toHaveURL("/carga-masiva");
    await expect(page.getByRole("button", { name: "Continuar a revisión", exact: true })).toBeDisabled();
  });

  // R22 & R24: / redirige a /precios y menú comercial no contiene Demostraciones
  test("R22 & R24: Root redirects to /precios and commercial nav excludes Demostraciones", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/precios");
    const nav = page.getByRole("navigation", { name: "Navegación de la aplicación" });
    await expect(nav.getByText("Demostraciones")).toHaveCount(0);
    await expect(nav.getByText("PRECIOS", { exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Consultar precios" })).toBeVisible();
  });

  // H02 & H03: Validaciones de estructura de archivos locales (CSV y XLSX)
  test("H02 & H03: Valid CSV produces valid structure with detected rows and columns", async () => {
    const { checkLocalFile } = await import("../src/features/bulk/utils/localFileCheck");
    const file = new File(["sku,nombre,precio\nSKU-1,Prod 1,10.0\nSKU-2,Prod 2,20.0\n"], "valido.csv", { type: "text/csv" });
    const res = await checkLocalFile(file);
    expect(res.valid).toBe(true);
    expect(res.format).toBe("CSV");
    expect(res.detectedRows).toBe(2);
    expect(res.detectedColumns).toEqual(["sku", "nombre", "precio"]);
    expect(res.errors).toHaveLength(0);
    expect(res.unverifiedAspects.length).toBeGreaterThan(0);
  });

  test("H02 & H03: Malformed CSV with mismatched columns reports error", async () => {
    const { checkLocalFile } = await import("../src/features/bulk/utils/localFileCheck");
    const file = new File(["sku,nombre,precio\nSKU-1,Prod 1\n"], "invalido.csv", { type: "text/csv" });
    const res = await checkLocalFile(file);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("campos, mientras que el encabezado define");
  });

  test("H02 & H03: Empty file (0 bytes) is rejected", async () => {
    const { checkLocalFile } = await import("../src/features/bulk/utils/localFileCheck");
    const file = new File([], "vacio.csv", { type: "text/csv" });
    const res = await checkLocalFile(file);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("está vacío (0 bytes)");
  });

  test("H02 & H03 & H15: Genuine minimal OOXML XLSX workbook is preliminarily valid", async () => {
    const { checkLocalFile } = await import("../src/features/bulk/utils/localFileCheck");
    const { getGenuineMinimalXlsxArrayBuffer } = await import("./fixtures/genuineXlsxFixture");
    const buffer = getGenuineMinimalXlsxArrayBuffer();

    const file = new File([buffer], "catalogo_genuino.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const res = await checkLocalFile(file);
    expect(res.valid).toBe(true);
    expect(res.format).toBe("XLSX");
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.unverifiedAspects.length).toBeGreaterThan(0);
  });

  test("H15: ZIP file without OOXML entries is rejected as invalid XLSX", async () => {
    const { checkLocalFile } = await import("../src/features/bulk/utils/localFileCheck");
    // Standard valid ZIP containing only a text file 'nota.txt' (no [Content_Types].xml or xl/)
    // Local header (30B) + name (8B) + data (4B) + CD (46B) + name (8B) + EOCD (22B) = 118 bytes
    const textData = Buffer.from("test");
    const fileName = Buffer.from("nota.txt");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt32LE(textData.length, 18);
    localHeader.writeUInt32LE(textData.length, 22);

    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(fileName.length, 28);
    cdHeader.writeUInt32LE(textData.length, 20);
    cdHeader.writeUInt32LE(textData.length, 24);
    cdHeader.writeUInt32LE(0, 42); // offset 0

    const cdStart = 30 + fileName.length + textData.length;
    const cdSize = 46 + fileName.length;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
    eocd.writeUInt16LE(1, 8); // entries
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);

    const zipBuffer = Buffer.concat([localHeader, fileName, textData, cdHeader, fileName, eocd]);

    const file = new File([zipBuffer], "notas.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const res = await checkLocalFile(file);
    expect(res.valid).toBe(false);
    expect(res.format).toBe("XLSX");
    expect(res.errors[0]).toContain("no presenta las entradas canónicas de una hoja de cálculo OOXML");
  });

  test("H15: Forged/fake ZIP signatures with corrupt internal directory are rejected", async () => {
    const { checkLocalFile } = await import("../src/features/bulk/utils/localFileCheck");
    // 64 bytes with forged PK\x03\x04 and PK\x05\x06 signatures but corrupt directory offsets
    const buffer = new Uint8Array(64);
    buffer[0] = 0x50; // 'P'
    buffer[1] = 0x4b; // 'K'
    buffer[2] = 0x03;
    buffer[3] = 0x04;
    // Forged EOCD signature at tail
    buffer[42] = 0x50;
    buffer[43] = 0x4b;
    buffer[44] = 0x05;
    buffer[45] = 0x06;

    const file = new File([Buffer.from(buffer)], "falsificado.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const res = await checkLocalFile(file);
    expect(res.valid).toBe(false);
    expect(res.format).toBe("XLSX");
    expect(res.errors.length).toBeGreaterThan(0);
  });

  test("H02 & H03: Truncated XLSX without EOCD record is rejected", async () => {
    const { checkLocalFile } = await import("../src/features/bulk/utils/localFileCheck");
    // 64 bytes with local header PK\x03\x04 but without EOCD record
    const buffer = new Uint8Array(64);
    buffer[0] = 0x50;
    buffer[1] = 0x4b;
    buffer[2] = 0x03;
    buffer[3] = 0x04;
    const file = new File([Buffer.from(buffer)], "truncado.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const res = await checkLocalFile(file);
    expect(res.valid).toBe(false);
    expect(res.format).toBe("XLSX");
    expect(res.errors[0]).toContain("registro de fin de directorio central ZIP no encontrado");
  });

  test("H02 & H03: Corrupt XLSX without PK ZIP container header is rejected", async () => {
    const { checkLocalFile } = await import("../src/features/bulk/utils/localFileCheck");
    // 64 bytes with zeroed header
    const buffer = new Uint8Array(64);
    buffer[0] = 0x00; // Not PK
    buffer[1] = 0x00;
    const file = new File([Buffer.from(buffer)], "corrupto.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const res = await checkLocalFile(file);
    expect(res.valid).toBe(false);
    expect(res.format).toBe("XLSX");
    expect(res.errors[0]).toContain("firma ZIP/PK local header no detectada");
  });

  // H13: XLSX import without verified row count remains in PROCESSING and shows explicit notice
  test("H13: XLSX batch without verified count displays explicit unconfirmed notice and safe recovery", async ({ page }) => {
    const { getGenuineMinimalXlsxBuffer } = await import("./fixtures/genuineXlsxFixture");
    const buffer = getGenuineMinimalXlsxBuffer();

    await page.goto("/carga-masiva");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "catalogo_h13.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(buffer),
    });

    await page.getByRole("button", { name: "Continuar a revisión", exact: true }).click();
    await expect(page).toHaveURL("/carga-masiva/revisar");
    await page.getByRole("button", { name: "Confirmar importación", exact: true }).first().click();

    // S03 tracking view
    await expect(page).toHaveURL(/\/carga-masiva\/importaciones\/lote-/);
    // Explicit provider dependency warning alert should be rendered
    await expect(page.getByText("Verificación dependiente del proveedor")).toBeVisible();
    await expect(page.getByText("Total de filas")).toBeVisible();
    await expect(page.getByText("No determinado")).toBeVisible();
    await expect(page.getByText("Recuento no verificado en cliente (XLSX)")).toBeVisible();
    // Provides safe return/recovery button
    const newUploadBtn = page.getByRole("link", { name: "Nueva carga masiva", exact: true }).first();
    await expect(newUploadBtn).toBeVisible();
  });

  // H11 & H12: S03 states - Queued, Processing with rows and domain breakdown
  test("H11 & H12: S03 shows queued and processing states with domain breakdown", async ({ page }) => {
    // 1. Queued state
    await page.goto("/carga-masiva/importaciones/batch-queued");
    await expect(page.getByText("En cola de procesamiento")).toBeVisible();
    await expect(page.getByText("Solicitud admitida en cola")).toBeVisible();

    // 2. Processing state with domain breakdown and rows table
    await page.goto("/carga-masiva/importaciones/batch-processing");
    await expect(page.getByText("Desglose por dominio")).toBeVisible();
    await expect(page.getByText("Muestra preliminar")).toBeVisible();
    await expect(page.locator("section").getByText("Catálogo", { exact: true })).toBeVisible();
    await expect(page.locator("section").getByText("Precios (Pricing)", { exact: true })).toBeVisible();
    await expect(page.locator("section").getByText("Inventario", { exact: true })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  // H11 & H12: S04 terminal protection - Non-terminal batch shows warning and redirects to S03
  test("H11 & H12: S04 non-terminal batch displays warning and does not render table", async ({ page }) => {
    await page.goto("/carga-masiva/importaciones/batch-processing/resultado");
    await expect(page.getByText("Lote en procesamiento")).toBeVisible();
    await expect(page.getByText("Los resultados finales consolidados se presentarán únicamente cuando el procesamiento concluya")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir al seguimiento del lote" })).toBeVisible();
    // The table of rows should not be rendered
    await expect(page.locator("table")).toHaveCount(0);
  });

  // H11 & H12: S04 terminal batch with errors provides download error report
  test("H11 & H12: S04 completed with observations shows download error report and resume button", async ({ page }) => {
    await page.goto("/carga-masiva/importaciones/batch-partial/resultado");
    await expect(page.getByText("Completado con observaciones")).toBeVisible();
    await expect(page.getByRole("button", { name: "Descargar reporte de errores" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reanudar operaciones pendientes" })).toBeVisible();
    // Table is visible
    await expect(page.locator("table")).toBeVisible();
  });

  // H11 & H12: S05 export CSV download vs XLSX informative notice
  test("H11 & H12: S05 export handles CSV ready download vs XLSX provider notice", async ({ page }) => {
    await page.goto("/carga-masiva/descargas");
    await expect(page.getByRole("heading", { name: "Descargas y exportación masiva" })).toBeVisible();

    // Check templates
    await expect(page.getByRole("button", { name: "Descargar CSV de ejemplo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "No disponible en demo" })).toBeDisabled();

    // Request CSV export
    await page.getByRole("button", { name: "Solicitar exportación" }).click();
    await expect(page.getByText(/Trabajo de exportación: exp-/)).toBeVisible();
  });

  // H01: Navegación transversal activa en S01-S05
  test("H01: Lateral menu highlights active navigation for S01-S05", async ({ page }) => {
    // S01: Carga masiva activa
    await page.goto("/carga-masiva");
    const nav = page.getByRole("navigation", { name: "Navegación de la aplicación" });
    const bulkLink = nav.getByRole("link", { name: "Carga masiva" });
    await expect(bulkLink).toHaveAttribute("data-active", "true");

    // S03: Seguimiento mantiene Carga masiva activa
    await page.goto("/carga-masiva/importaciones/batch-processing");
    await expect(bulkLink).toHaveAttribute("data-active", "true");

    // S04: Resultado mantiene Carga masiva activa
    await page.goto("/carga-masiva/importaciones/batch-partial/resultado");
    await expect(bulkLink).toHaveAttribute("data-active", "true");

    // S05: Descargas activa Descargas y exportación
    await page.goto("/carga-masiva/descargas");
    const downloadsLink = nav.getByRole("link", { name: "Descargas y exportación" });
    await expect(downloadsLink).toHaveAttribute("data-active", "true");
  });
});
