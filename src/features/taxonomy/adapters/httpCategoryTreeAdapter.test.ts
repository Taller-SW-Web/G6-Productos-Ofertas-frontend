import { describe, expect, it, vi } from "vitest";
import { loadCategoryTree } from "./httpCategoryTreeAdapter";
const signal = () => new AbortController().signal;
describe("árbol HTTP de categorías", () => {
  it("mapea el árbol contractual y sus niveles", async () => {
    const request = vi.fn().mockResolvedValue(Response.json([{ categoria: { categoriaId: "a", nombre: "Ropa", estado: "ACTIVO", version: 1 }, hijos: [{ categoria: { categoriaId: "b", nombre: "Camisas", estado: "INACTIVO", version: 0 }, hijos: [] }] }]));
    const nodes = await loadCategoryTree({ request }, signal());
    expect(request).toHaveBeenCalledWith("/api/v1/categorias/arbol", expect.any(AbortSignal));
    expect(nodes[0]).toMatchObject({ id: "a", nivel: 0, estado: "Activo", hijas: [{ id: "b", nivel: 1, estado: "Inactivo" }] });
  });
  it.each([401, 403, 500])("propaga HTTP %s sin usar mock", async status => {
    await expect(loadCategoryTree({ request: async () => new Response(null, { status }) }, signal())).rejects.toThrow(`HTTP ${status}`);
  });
  it("rechaza datos inválidos o duplicados", async () => {
    const node = { categoria: { categoriaId: "a", nombre: "A", estado: "ACTIVO", version: 1 }, hijos: [] };
    await expect(loadCategoryTree({ request: async () => Response.json([node, node]) }, signal())).rejects.toThrow("inválida");
  });
  it("propaga errores de red", async () => {
    await expect(loadCategoryTree({ request: async () => { throw new Error("Sin red"); } }, signal())).rejects.toThrow("Sin red");
  });
});
