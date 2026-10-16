import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockBulkRepository } from "../src/features/bulk/adapters/mockBulkRepository";
import { BulkRepositoryError, createBulkRepository } from "../src/features/bulk/services/bulkService";
import { canRequestImportReport } from "../src/features/bulk/services/bulkRepository";
import { canMockProvideImportReport } from "../src/features/bulk/services/reportAvailability";
import { isBulkProviderConfigured } from "../src/features/bulk/services/bulkProviderStatus";
import { getQueuedBatchDescription, getUnknownRowCountDescription } from "../src/features/bulk/components/batchStatusMessages";
import { isExportSnapshotStale, selectBatchQueryView } from "../src/features/bulk/hooks/bulkQueryState";
import { getDownloadFailureMessage, getUnavailableDownloadMessage } from "../src/features/bulk/services/downloadMessages";
import { AdmissionCoordinator, LatestTaskCoordinator, runSingleFlight } from "../src/features/bulk/utils/asyncGuards";
import { checkLocalFile, parseCsvSafely } from "../src/features/bulk/utils/localFileCheck";
import { getGenuineMinimalXlsxArrayBuffer } from "./fixtures/genuineXlsxFixture";
import { mockBatches } from "../src/features/bulk/mocks/bulkFixtures";

function fileWithBytes(name: string, bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy.buffer], name);
}

function fileWithChunks(name: string, bytes: Uint8Array, chunkSize = 64 * 1024) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const file = new File([copy.buffer], name);
  Object.defineProperty(file, "stream", {
    value: () => {
      let offset = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= bytes.length) {
            controller.close();
            return;
          }
          const end = Math.min(offset + chunkSize, bytes.length);
          controller.enqueue(bytes.slice(offset, end));
          offset = end;
        },
      });
    },
  });
  return file;
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

  it("keeps batch refresh reads free of import writes", async () => {
    const getCreateCalls = () => mockBulkRepository.getCreateImportCallCount?.() ?? 0;
    const createCallsBefore = getCreateCalls();
    await mockBulkRepository.getImport("batch-completed");
    expect(getCreateCalls()).toBe(createCallsBefore);
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

  it("rejects a duplicate resume while preserving the same batch identity", async () => {
    const results = await Promise.allSettled([
      mockBulkRepository.resumeImport("batch-partial"),
      mockBulkRepository.resumeImport("batch-partial"),
    ]);
    const accepted = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(accepted[0]).toMatchObject({
      status: "fulfilled",
      value: { batch_id: "batch-partial" },
    });
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
    expect(canMockProvideImportReport(mockBatches["batch-failed-general"]!)).toBe(false);
    expect(canRequestImportReport(mockBulkRepository, mockBatches["batch-failed-general"]!)).toBe(false);

    const apiRepository = { ...mockBulkRepository, canDownloadImportReport: undefined };
    expect(canRequestImportReport(apiRepository, mockBatches["batch-failed-general"]!)).toBe(true);
  });

  it("keeps mock/API status messages tied to the global mode, not the filename", () => {
    expect(getQueuedBatchDescription("mock")).toContain("demostración mock");
    expect(getQueuedBatchDescription("api")).toContain("provider configurado");
    expect(getUnknownRowCountDescription("mock")).not.toContain("XLSX");
    expect(getUnknownRowCountDescription("api")).not.toContain("XLSX");
    expect(isBulkProviderConfigured("api", null)).toBe(false);
    expect(isBulkProviderConfigured("api", mockBulkRepository)).toBe(true);
    expect(isBulkProviderConfigured("mock", null)).toBe(true);
  });

  it("does not describe API download failures as mock limitations", () => {
    expect(getUnavailableDownloadMessage("mock", "exportación", "XLSX")).toContain("modo mock");
    expect(getUnavailableDownloadMessage("api", "exportación", "XLSX")).toContain("provider API configurado");
    expect(getUnavailableDownloadMessage("api", "plantilla", "CSV")).toContain("provider API configurado");
    expect(getDownloadFailureMessage(new BulkRepositoryError("Sin conexión", "communication"), "exportación"))
      .toContain("Error de comunicación");
  });

  it("uses the latest completed batch query and discards stale responses", () => {
    const batch = mockBatches["batch-partial"]!;
    const staleResponse = { key: '["batch-partial",0]', state: { status: "success" as const, batch } };
    const notFound = selectBatchQueryView({
      batchId: "batch-partial",
      requestKey: '["batch-partial",1]',
      response: { key: '["batch-partial",1]', state: { status: "not_found" } },
      lastSuccess: { batchId: batch.batch_id, batch },
    });
    expect(notFound).toMatchObject({ batch: null, isNotFound: true, loading: false });

    const communicationError = selectBatchQueryView({
      batchId: "batch-partial",
      requestKey: '["batch-partial",2]',
      response: { key: '["batch-partial",2]', state: { status: "error", message: "offline" } },
      lastSuccess: { batchId: batch.batch_id, batch },
    });
    expect(communicationError).toMatchObject({ batch, error: "offline", isStale: true });

    expect(selectBatchQueryView({
      batchId: "another-batch",
      requestKey: '["another-batch",0]',
      response: staleResponse,
      lastSuccess: { batchId: batch.batch_id, batch },
    })).toMatchObject({ batch: null, loading: true, isNotFound: false });
  });

  it("marks the last export stale only for the same export ID", () => {
    expect(isExportSnapshotStale({
      visibleExportId: "exp-a",
      initialExportId: "exp-a",
      routeExportId: "exp-a",
      createdJobMatches: false,
      currentQueryStatus: "error",
    })).toBe(true);
    expect(isExportSnapshotStale({
      visibleExportId: "exp-b",
      initialExportId: "exp-b",
      routeExportId: "exp-a",
      createdJobMatches: false,
      currentQueryStatus: "error",
      refreshErrorExportId: "exp-a",
    })).toBe(false);
    expect(isExportSnapshotStale({
      visibleExportId: "exp-c",
      createdJobMatches: true,
      refreshErrorExportId: "exp-c",
    })).toBe(true);
  });

  it("guards duplicate confirmations and cancels stale file-selection checks", async () => {
    const guard = { current: false };
    let complete!: (value: string) => void;
    let submissions = 0;
    const first = runSingleFlight(guard, () => {
      submissions++;
      return new Promise<string>((resolve) => { complete = resolve; });
    });
    const duplicate = await runSingleFlight(guard, async () => {
      submissions++;
      return "duplicate";
    });
    expect(duplicate).toBeUndefined();
    expect(submissions).toBe(1);
    complete("accepted");
    await expect(first).resolves.toBe("accepted");

    const coordinator = new LatestTaskCoordinator();
    const fileA = coordinator.start();
    const fileB = coordinator.start();
    expect(fileA.signal.aborted).toBe(true);
    expect(fileA.isCurrent()).toBe(false);
    expect(fileB.isCurrent()).toBe(true);
    coordinator.cancel();
    expect(fileB.signal.aborted).toBe(true);
    expect(fileB.isCurrent()).toBe(false);
  });

  it("allows a new admission after acceptance and ignores a response from an older selection", () => {
    const coordinator = new AdmissionCoordinator<{ name: string }>();
    const firstFile = { name: "primero.csv" };
    coordinator.select(firstFile);
    const firstAdmission = coordinator.begin(firstFile);
    expect(firstAdmission).not.toBeNull();
    expect(coordinator.begin(firstFile)).toBeNull();
    expect(coordinator.finish(firstAdmission!, "accepted")).toBe(true);
    expect(coordinator.status).toBe("accepted");
    expect(coordinator.begin(firstFile)).toBeNull();

    const lateAdmission = coordinator.begin(firstFile);
    expect(lateAdmission).toBeNull();
    const secondFile = { name: "segundo.csv" };
    coordinator.select(secondFile);
    expect(coordinator.finish(firstAdmission!, "uncertain")).toBe(false);
    expect(coordinator.status).toBe("ready");
    const secondAdmission = coordinator.begin(secondFile);
    expect(secondAdmission).not.toBeNull();
    expect(coordinator.begin(secondFile)).toBeNull();
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

  it("handles escaped quotes in ordinary CSV fields and headers", async () => {
    const result = await checkLocalFile(
      new File(['"sku""code",nombre\n"AB""C",Producto\n'], "comillas.csv"),
    );
    expect(result.valid).toBe(true);
    expect(result.detectedColumns).toEqual(['sku"code', "nombre"]);
    expect(result.detectedRows).toBe(1);
  });

  it("keeps escaped quotes intact when the pair straddles two 64 KiB reads", async () => {
    const encoder = new TextEncoder();
    const prefix = encoder.encode('sku,detalle\nA,"');
    const padding = new Uint8Array(64 * 1024 - prefix.length - 1).fill("x".charCodeAt(0));
    const bytes = new Uint8Array([
      ...prefix,
      ...padding,
      ...encoder.encode('""y"\nB,ok\n'),
    ]);
    const result = await checkLocalFile(fileWithChunks("comillas-frontera.csv", bytes));
    expect(result.valid).toBe(true);
    expect(result.detectedRows).toBe(2);
  });

  it("handles escaped quotes split in a header and a CRLF split at the read boundary", async () => {
    const encoder = new TextEncoder();
    const headerPrefix = encoder.encode('"sku');
    const headerPadding = new Uint8Array(64 * 1024 - headerPrefix.length - 1).fill("x".charCodeAt(0));
    const headerBytes = new Uint8Array([
      ...headerPrefix,
      ...headerPadding,
      ...encoder.encode('""code",nombre\nA,B\n'),
    ]);
    const headerResult = await checkLocalFile(fileWithChunks("header-frontera.csv", headerBytes));
    expect(headerResult.valid).toBe(true);
    expect(headerResult.detectedColumns?.[0]).toMatch(/"code$/);

    const rowPrefix = encoder.encode("sku,nombre\nA,");
    const rowPadding = new Uint8Array(64 * 1024 - rowPrefix.length - 1).fill("x".charCodeAt(0));
    const rowBytes = new Uint8Array([
      ...rowPrefix,
      ...rowPadding,
      ...encoder.encode("\r\nB,Producto\n"),
    ]);
    const crlfResult = await checkLocalFile(fileWithChunks("crlf-frontera.csv", rowBytes));
    expect(crlfResult.valid).toBe(true);
    expect(crlfResult.detectedRows).toBe(2);
  });

  it("decodes UTF-8 multibyte characters split across reads", async () => {
    const encoder = new TextEncoder();
    const prefix = encoder.encode("sku,nombre\nA,");
    const padding = new Uint8Array(64 * 1024 - prefix.length - 1).fill("x".charCodeAt(0));
    const bytes = new Uint8Array([
      ...prefix,
      ...padding,
      ...encoder.encode("ñ\nB,Producto\n"),
    ]);
    const result = await checkLocalFile(fileWithChunks("utf8-frontera.csv", bytes));
    expect(result.valid).toBe(true);
    expect(result.detectedRows).toBe(2);
  });

  it("bounds oversized local headers without imposing a commercial file-size limit", async () => {
    const header = new Uint8Array(256 * 1024 + 1).fill("x".charCodeAt(0));
    const bytes = new Uint8Array([...header, 10, 65, 10]);
    const result = await checkLocalFile(fileWithChunks("header-grande.csv", bytes));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("límite de inspección local");
  });

  it("cancels an active streaming read when the selection is cleared", async () => {
    const file = new File(["sku,nombre\nA,B\n"], "cancelar.csv");
    let cancelled = false;
    Object.defineProperty(file, "stream", {
      value: () => new ReadableStream<Uint8Array>({
        pull() {},
        cancel() { cancelled = true; },
      }),
    });
    const controller = new AbortController();
    const pending = checkLocalFile(file, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
  });
});
