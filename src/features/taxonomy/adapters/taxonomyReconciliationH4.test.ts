import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createHttpBrandRepository, createHttpCharacteristicRepository } from "./httpTaxonomyAdmin";
import { reconcileConfirmedTaxonomyResource, taxonomySend } from "./taxonomyHttp";
import type { TaxonomyGatewayTransport } from "./httpProductTypeAdapter";
import { createMemoryStorage, deferred, fakeOwnerA, fakeOwnerB, jsonResponse } from "../../../../tests/fixtures/h4Controlled";

let owner = fakeOwnerA;
let storage: Storage;
beforeEach(() => { owner = fakeOwnerA; storage = createMemoryStorage(); vi.stubGlobal("sessionStorage", storage); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function transport(requestWithInit: NonNullable<TaxonomyGatewayTransport["requestWithInit"]>): TaxonomyGatewayTransport {
  return { scopeId: () => owner, requestWithInit, request: (path, signal) => requestWithInit(path, { method: "GET", signal }) };
}
const signal = () => new AbortController().signal;
const characteristic = (nombre: string, version: number) => ({ caracteristicaId: "attr-h4", nombre, tipo: "TEXTO", estado: "ACTIVO", version });

describe("Taxonomy reconciliation H4", () => {
  it("TAX-H4-01: conserva entity, recurso, payload y versión ante GET anterior y libera solo con GET actualizado", async () => {
    const path = "/api/v1/caracteristicas/attr-h4";
    const io = vi.fn(async () => { throw new Error("timeout luego del despacho"); });
    const api = transport(io);
    await expect(taxonomySend(api, path, "PATCH", signal(), { nombre: "Color principal", unidadMedida: null, version: 4 }, 200, value => value, false, { resourcePath: path, entity: "characteristic" })).rejects.toMatchObject({ outcome: "unknown" });
    const key = Object.keys(storage).find(item => item.startsWith("g6:taxonomy:pending:"));
    expect(key).toBeDefined();
    const saved = JSON.parse(storage.getItem(key!) ?? "null") as Record<string, unknown>;
    expect(saved).toMatchObject({ entity: "characteristic", resourcePath: path, body: { nombre: "Color principal", version: 4 } });
    await reconcileConfirmedTaxonomyResource(api, path, characteristic("Color", 4), fakeOwnerA);
    expect(storage.getItem(key!)).not.toBeNull();
    await reconcileConfirmedTaxonomyResource(api, path, characteristic("Color principal", 5), fakeOwnerA);
    expect(storage.getItem(key!)).toBeNull();
    expect(io).toHaveBeenCalledOnce();
  });

  it("TAX-H4-02: una versión superior con campos distintos no acredita el PATCH", async () => {
    const path = "/api/v1/caracteristicas/attr-h4";
    const api = transport(vi.fn(async () => { throw new Error("timeout"); }));
    await expect(taxonomySend(api, path, "PATCH", signal(), { nombre: "Color principal", unidadMedida: null, version: 4 }, 200, value => value, false, { resourcePath: path, entity: "characteristic" })).rejects.toMatchObject({ outcome: "unknown" });
    await reconcileConfirmedTaxonomyResource(api, path, characteristic("Color secundario", 5), fakeOwnerA);
    const marker = Object.keys(storage).find(item => item.startsWith("g6:taxonomy:pending:"));
    expect(marker).toBeDefined();
    expect(JSON.parse(storage.getItem(marker!) ?? "null")).toMatchObject({ state: "confirmed_read_failed" });
  });

  it("TAX-H4-03: asociación solo se concilia con schemaVersion avanzado, característica e invariantes esperadas", async () => {
    const path = "/api/v1/tipos-producto/type-h4/caracteristicas/attr-h4";
    const resourcePath = "/api/v1/tipos-producto/type-h4/caracteristicas";
    const api = transport(vi.fn(async () => { throw new Error("timeout"); }));
    await expect(taxonomySend(api, path, "PATCH", signal(), { caracteristicaId: "attr-h4", obligatoria: true, schemaVersion: 7 }, 200, value => value, false, { resourcePath, entity: "product_type_association" })).rejects.toMatchObject({ outcome: "unknown" });
    const schema = (version: number, id = "attr-h4") => ({ schemaVersion: version, tipoProducto: { tipoProductoId: "type-h4" }, caracteristicas: [{ caracteristicaId: id, obligatoria: true }] });
    await reconcileConfirmedTaxonomyResource(api, resourcePath, schema(7), fakeOwnerA);
    const marker = Object.keys(storage).find(item => item.startsWith("g6:taxonomy:pending:"));
    expect(marker).toBeDefined();
    await reconcileConfirmedTaxonomyResource(api, resourcePath, schema(8, "attr-otro"), fakeOwnerA);
    expect(storage.getItem(marker!)).not.toBeNull();
    await reconcileConfirmedTaxonomyResource(api, resourcePath, schema(8), fakeOwnerA);
    expect(storage.getItem(marker!)).toBeNull();
  });

  it("TAX-H4-04: Marca HTTP 200 confirma escritura aun si el GET auxiliar responde 503", async () => {
    const dto = { marcaId: "brand-h4", nombre: "Marca H4", estado: "ACTIVO", version: 5, descripcion: null, paisOrigenIso: null, logoUrl: null };
    let getCount = 0;
    const requestWithInit = vi.fn(async (_path: string, init: { method: "GET" | "POST" | "PATCH"; body?: BodyInit; signal?: AbortSignal; headers?: Readonly<Record<string, string>> }) => {
      if (init.method === "PATCH") return jsonResponse(200, dto);
      getCount += 1;
      return getCount === 1 ? jsonResponse(200, { ...dto, version: 4, descripcion: "Anterior", paisOrigenIso: "PE" }) : jsonResponse(503, { status: 503, code: "SERVICIO_NO_DISPONIBLE" });
    });
    const repository = createHttpBrandRepository(transport(requestWithInit));
    const result = await repository.actualizar({ marcaId: "brand-h4", nombre: "Marca H4", descripcion: "", paisOrigenIso: "" });
    expect(result).toMatchObject({ marcaId: "brand-h4", version: 5, descripcion: null, paisOrigenIso: null });
    const patch = requestWithInit.mock.calls.find(([, init]) => init.method === "PATCH");
    expect(patch?.[1].body).toBeInstanceOf(FormData);
    const form = patch?.[1].body as FormData;
    expect(form.get("descripcion")).toBe("");
    expect(form.get("paisOrigenIso")).toBe("");
    expect(Object.keys(storage).filter(key => key.startsWith("g6:taxonomy:pending:"))).toHaveLength(0);
    expect(requestWithInit.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1);
  });

  it("TAX-H4-05: el GET de Marca sin evidencia de logo conserva marcador y storage nunca contiene el binario", async () => {
    const path = "/api/v1/marcas/brand-h4";
    const logo = new File(["logo-binary-h4"], "logo.png", { type: "image/png" });
    const api = transport(vi.fn(async () => { throw new Error("timeout"); }));
    const body = new FormData(); body.set("nombre", "Marca H4"); body.set("version", "2"); body.set("logo", logo);
    await expect(taxonomySend(api, path, "PATCH", signal(), body, 200, value => value, false, { resourcePath: path, entity: "brand" })).rejects.toMatchObject({ outcome: "unknown" });
    const marker = Object.keys(storage).find(key => key.startsWith("g6:taxonomy:pending:"));
    expect(marker).toBeDefined();
    const raw = storage.getItem(marker!) ?? "";
    expect(raw).not.toContain("logo-binary-h4");
    await reconcileConfirmedTaxonomyResource(api, path, { marcaId: "brand-h4", nombre: "Marca H4", version: 3, descripcion: null, paisOrigenIso: null }, fakeOwnerA);
    expect(storage.getItem(marker!)).not.toBeNull();
  });

  it("TAX-H4-06: respuesta favorable de A recibida bajo B no libera el marcador de A", async () => {
    const path = "/api/v1/caracteristicas/attr-h4";
    const getWaiting = deferred<Response>();
    const io = vi.fn(async (_path: string, init: { method: "GET" | "POST" | "PATCH" }) => {
      if (init.method === "PATCH") throw new Error("timeout posterior al despacho");
      return getWaiting.promise;
    });
    const api = transport(io);
    await expect(taxonomySend(api, path, "PATCH", signal(), { nombre: "Color principal", unidadMedida: null, version: 4 }, 200, value => value, false, { resourcePath: path, entity: "characteristic" })).rejects.toMatchObject({ outcome: "unknown" });
    const marker = Object.keys(storage).find(item => item.startsWith("g6:taxonomy:pending:"));
    expect(marker).toBeDefined();
    const original = storage.getItem(marker!);
    const repository = createHttpCharacteristicRepository(transport(io));
    const reconciliation = repository.obtener("attr-h4", signal());
    expect(io.mock.calls.filter(([, init]) => init.method === "PATCH")).toHaveLength(1);
    owner = fakeOwnerB;
    getWaiting.resolve(jsonResponse(200, characteristic("Color principal", 5)));
    await expect(reconciliation).rejects.toThrow("La sesión cambió durante la lectura de Taxonomía.");
    expect(storage.getItem(marker!)).toBe(original);
    expect(JSON.parse(storage.getItem(marker!) ?? "null")).toMatchObject({ owner: createHash("sha256").update(fakeOwnerA).digest("hex"), entity: "characteristic", resourcePath: path, state: "unknown", body: { nombre: "Color principal", version: 4 } });
    expect(io.mock.calls.filter(([, init]) => init.method !== "GET")).toHaveLength(1);
    expect(owner).toBe(fakeOwnerB);
  });
});
