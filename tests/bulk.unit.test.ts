import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockBulkRepository } from "../src/features/bulk/adapters/mockBulkRepository";
import { createBulkRepository } from "../src/features/bulk/services/bulkService";
import { checkLocalFile, parseCsvSafely } from "../src/features/bulk/utils/localFileCheck";
import { getGenuineMinimalXlsxArrayBuffer } from "./fixtures/genuineXlsxFixture";

function fileWithBytes(name: string, bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy.buffer], name);
}

function buildZip(entries: string[], options?: { declaredEntries?: number }) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry);
    const data = Buffer.from("test");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    local.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += 30 + name.length + data.length;
  }

  const localData = Buffer.concat(local);
  const centralData = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(options?.declaredEntries ?? entries.length, 8);
  eocd.writeUInt16LE(options?.declaredEntries ?? entries.length, 10);
  eocd.writeUInt32LE(centralData.length, 12);
  eocd.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralData, eocd]);
}

describe("Bulk mock repository and global data mode", () => {
  beforeEach(() => mockBulkRepository.resetMockState?.());
  afterEach(() => mockBulkRepository.resetMockState?.());

  it("selects deterministic mocks only in mock mode and fails explicitly in api mode", async () => {
    expect(createBulkRepository("mock")).toBe(mockBulkRepository);
    const apiRepository = createBulkRepository("api");
    await expect(apiRepository.getImport("batch-queued")).rejects.toMatchObject({
      name: "BulkRepositoryError",
      category: "configuration",
    });
    expect(createBulkRepository("api", { api: mockBulkRepository })).toBe(
      mockBulkRepository,
    );
  });

  it("creates an import in QUEUED and does not read CSV again after local review", async () => {
    const file = new File(["sku,nombre\nA,Producto A\nB,Producto B\n"], "catalogo.csv");
    const batch = await mockBulkRepository.createImport(file, { detectedRows: 2 });
    expect(batch.status).toBe("QUEUED");
    expect(batch.total_rows).toBe(2);
    expect(batch.file_name).toBe("catalogo.csv");
  });

  it("preserves confirmed rows and batch identity when resuming an eligible batch", async () => {
    const batch = await mockBulkRepository.getImport("batch-partial");
    const resumed = await mockBulkRepository.resumeImport("batch-partial");
    expect(resumed.batch_id).toBe("batch-partial");
    expect(resumed.status).toBe("QUEUED");
    expect(resumed.completed_rows).toBe(batch?.completed_rows);
    expect(resumed.rows?.filter((row) => row.status === "COMPLETED")).toHaveLength(
      batch?.rows?.filter((row) => row.status === "COMPLETED").length ?? 0,
    );
    await expect(mockBulkRepository.resumeImport("batch-completed")).rejects.toThrow(
      "no contiene operaciones pendientes",
    );
  });

  it("exports a CSV file and never returns a CSV renamed as XLSX", async () => {
    const csvJob = await mockBulkRepository.createExport("CSV");
    await mockBulkRepository.advanceMockExport?.(csvJob.export_id);
    await mockBulkRepository.advanceMockExport?.(csvJob.export_id);
    const csv = await mockBulkRepository.getExportFile(csvJob.export_id);
    expect(csv?.fileName).toContain(".csv");

    const xlsxJob = await mockBulkRepository.createExport("XLSX");
    await mockBulkRepository.advanceMockExport?.(xlsxJob.export_id);
    await mockBulkRepository.advanceMockExport?.(xlsxJob.export_id);
    expect(await mockBulkRepository.getExportFile(xlsxJob.export_id)).toBeNull();
  });

  it("returns error reports from row details and no invented report without them", async () => {
    const partial = await mockBulkRepository.getImportReport("batch-partial");
    expect(partial?.fileName).toContain("batch-partial");
    expect(await partial?.blob.text()).toContain("SKU_DUPLICADO");
    expect(await mockBulkRepository.getImportReport("batch-failed-general")).toBeNull();
  });
});

describe("Bulk local file checks", () => {
  it("streams CSV structure and detects headers, rows, BOM, quoted commas, and line breaks", async () => {
    const file = new File(
      ["\uFEFFsku,nombre,detalle\r\nSKU-1,Producto 1,\"texto,\ncon salto\"\r\nSKU-2,Producto 2,ok\r\n"],
      "catalogo.csv",
    );
    const result = await checkLocalFile(file);
    expect(result.valid).toBe(true);
    expect(result.detectedColumns).toEqual(["sku", "nombre", "detalle"]);
    expect(result.detectedRows).toBe(2);
    expect(result.unverifiedAspects).toContain(
      "Unicidad de SKU y existencia previa en catálogo no verificable localmente.",
    );
  });

  it("rejects empty, unsupported, header-only, and malformed CSV input", async () => {
    expect((await checkLocalFile(new File([], "vacio.csv"))).errors[0]).toContain("vacío");
    expect((await checkLocalFile(new File(["x"], "catalogo.txt"))).valid).toBe(false);
    expect((await checkLocalFile(new File(["sku,nombre\n"], "solo-header.csv"))).errors[0]).toContain(
      "únicamente el encabezado",
    );
    expect((await checkLocalFile(new File(["sku,nombre\nA\n"], "columnas.csv"))).errors[0]).toContain(
      "campos, mientras que el encabezado define",
    );
    expect((await checkLocalFile(new File(["sku,nombre\n\"A,Producto\n"], "quotes.csv"))).errors[0]).toContain(
      "comillas sin cerrar",
    );
    expect((await checkLocalFile(new File(["sku,sku\nA,B\n"], "duplicadas.csv"))).errors[0]).toContain(
      "nombres de columna duplicados",
    );
  });

  it("recognizes a genuine OOXML container and streams the central directory", async () => {
    const file = fileWithBytes(
      "catalogo.xlsx",
      new Uint8Array(getGenuineMinimalXlsxArrayBuffer()),
    );
    const result = await checkLocalFile(file);
    expect(result.valid).toBe(true);
    expect(result.format).toBe("XLSX");
    expect(result.detectedRows).toBeUndefined();
    expect(result.unverifiedAspects).toContain(
      "Estructura interna de celdas y filas XLSX no verificada en cliente.",
    );
  });

  it("rejects forged ZIP signatures, truncated directories, and ZIP files without OOXML entries", async () => {
    const forged = new Uint8Array(64);
    forged.set([0x50, 0x4b, 0x03, 0x04], 0);
    forged.set([0x50, 0x4b, 0x05, 0x06], 42);
    expect((await checkLocalFile(fileWithBytes("fake.xlsx", forged))).valid).toBe(false);

    const wrongEntries = new Uint8Array(buildZip(["notes.txt"]));
    expect((await checkLocalFile(fileWithBytes("zip-not-xlsx.xlsx", wrongEntries))).valid).toBe(false);

    const truncated = new Uint8Array(buildZip(["[Content_Types].xml"], { declaredEntries: 2 }));
    expect((await checkLocalFile(fileWithBytes("truncated.xlsx", truncated))).valid).toBe(false);
  });

  it("keeps the small in-memory CSV parser deterministic for fixtures", () => {
    expect(parseCsvSafely('sku,nombre\nA,"Producto, uno"\n').rows).toEqual([
      ["sku", "nombre"],
      ["A", "Producto, uno"],
    ]);
    expect(parseCsvSafely('sku,nombre\nA,"sin cerrar').error).toContain("comillas sin cerrar");
  });
});
