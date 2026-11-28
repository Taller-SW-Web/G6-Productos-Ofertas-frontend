import { describe, expect, it, vi } from "vitest";
import { createHttpInventoryRepository } from "./apiInventoryAdapter";

const locationId = "11111111-1111-4111-8111-111111111111";
const stock = { sku: "SKU-1", skuActivo: true, ubicacion: { locationId, nombre: "Almacén" }, onHand: 10, reserved: 1, blocked: 2, available: 7, umbralEfectivo: 5, estado: "DISPONIBLE", stockVersion: 3, actualizadoEn: "2026-11-28T12:00:00Z" };
const metadata = { sku: "SKU-1", productName: "Producto", categoryId: "cat", categoryName: "Calzado", brandId: "brand", brandName: "Marca" };
describe("INV-01/02 composición sin cambiar saldos", () => {
  it("decora página y detalle sin exigir filtro de clasificación", async () => {
    const catalog = vi.fn(async () => [metadata]);
    const fullScan = vi.fn(async () => []);
    const repository = createHttpInventoryRepository({
      listCatalogSkus: fullScan,
      resolveCatalogSkus: catalog,
      transport: { request: async path => {
        const size = Number(new URL(path, "https://example.test").searchParams.get("tamanio"));
        return Response.json({ items: [stock], meta: { pagina: 1, tamanio: size, total: 1, totalPaginas: 1 } });
      } },
    });
    const page = await repository.getStockPage!({}, 1, 20);
    expect(page.items[0]).toMatchObject({ sku: "SKU-1", productName: "Producto", categoryName: "Calzado", brandName: "Marca", onHand: 10, reserved: 1, blocked: 2, available: 7, stockVersion: 3 });
    expect(await repository.getStockDetail("SKU-1", locationId)).toMatchObject({ productName: "Producto", categoryName: "Calzado", brandName: "Marca", available: 7 });
    expect(page.total).toBe(1);
    expect(fullScan).not.toHaveBeenCalled();
    expect(catalog).toHaveBeenCalledWith(["SKU-1"], undefined);
  });
  it("la caída de Catálogo conserva el saldo e identifica el enriquecimiento sin verificar", async () => {
    const repository = createHttpInventoryRepository({ listCatalogSkus: async () => { throw new Error("429"); },
      transport: { request: async () => Response.json({ items: [stock], meta: { pagina: 1, tamanio: 20, total: 1, totalPaginas: 1 } }) } });
    expect((await repository.getStockPage!({}, 1, 20)).items[0]).toMatchObject({ available: 7, categoryName: "Catálogo temporalmente no disponible" });
  });
  it("comparte una lectura de ubicaciones con distribución y no inventa bloqueados", async () => {
    const calls: string[] = [];
    const repository = createHttpInventoryRepository({ transport: { request: async path => {
      calls.push(path);
      return path.includes("ubicaciones") ? Response.json({ items: [{ id: locationId, code: "ALM", name: "Almacén", type: "ALMACEN", active: true }], meta: { pagina: 1, tamanio: 100, total: 1, totalPaginas: 1 } }) :
        Response.json({ generatedAt: "2026-11-28T12:00:00Z", porUbicacion: [{ location_id: locationId, on_hand: 10, reserved: 1, available: 7, skusDisponibles: 1, skusStockBajo: 0, skusAgotados: 0 }] });
    } } });
    const [distribution] = await Promise.all([repository.getLocationDistribution(), repository.getLocations()]);
    expect(distribution[0]).toMatchObject({ locationName: "Almacén", availableTotal: 7, onHandTotal: 10, blockedTotal: null });
    expect(calls.filter(path => path.includes("ubicaciones"))).toHaveLength(1);
  });
});
