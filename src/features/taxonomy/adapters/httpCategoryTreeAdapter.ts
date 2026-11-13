import type { CategoryNode } from "../types";
import { boundedTaxonomyRequest, type TaxonomyGatewayTransport } from "./httpProductTypeAdapter";

export async function loadCategoryTree(transport: TaxonomyGatewayTransport, signal: AbortSignal): Promise<CategoryNode[]> {
  const response = await boundedTaxonomyRequest(transport, "/api/v1/categorias/arbol", signal, 7500);
  if (!response.ok) throw new Error(`No se pudo cargar el árbol de categorías (HTTP ${response.status}).`);
  const payload: unknown = await response.json();
  const seen = new Set<string>();
  const map = (value: unknown, depth: number): CategoryNode => {
    if (depth > 100 || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("Respuesta de categorías inválida.");
    const node = value as Record<string, unknown>;
    if (!node.categoria || typeof node.categoria !== "object" || Array.isArray(node.categoria) || !Array.isArray(node.hijos)) throw new Error("Respuesta de categorías inválida.");
    const category = node.categoria as Record<string, unknown>;
    if (typeof category.categoriaId !== "string" || !category.categoriaId.trim() || seen.has(category.categoriaId) || typeof category.nombre !== "string" || !category.nombre.trim() || !Number.isSafeInteger(category.version) || Number(category.version) < 0 || (category.estado !== "ACTIVO" && category.estado !== "INACTIVO")) throw new Error("Respuesta de categorías inválida.");
    seen.add(category.categoriaId);
    return { id: category.categoriaId, nombre: category.nombre, nivel: depth, estado: category.estado === "ACTIVO" ? "Activo" : "Inactivo", hijas: node.hijos.map(child => map(child, depth + 1)) };
  };
  if (!Array.isArray(payload)) throw new Error("Respuesta de categorías inválida.");
  return payload.map(node => map(node, 0));
}
