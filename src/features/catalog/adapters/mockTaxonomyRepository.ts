import type {
  TaxonomyBrand,
  TaxonomyCategory,
  TaxonomyProductType,
  AttributeSchema,
  TaxonomyRepository,
} from "../services/taxonomyRepository";
import {
  initialBrands,
  initialCategories,
  initialProductTypes,
  attributeSchemasByType,
} from "../mocks/taxonomyFixtures";
import { getTaxonomyServices } from "../../taxonomy/services/taxonomyServices";
import type { CategoryNode } from "../../taxonomy/types";

// Canonical mapping between Catálogo IDs and Taxonomía IDs (LOP-01 / LOP-02)
const CATEGORY_ID_MAP: Record<string, string> = {
  calzado: "CAT-CALZADO",
  ropa: "CAT-ROPA",
  accesorios: "CAT-ACC",
};

export class MockTaxonomyRepository implements TaxonomyRepository {
  async getCategories(signal?: AbortSignal): Promise<TaxonomyCategory[]> {
    try {
      const taxonomy = getTaxonomyServices("mock");
      const { nodos } = await taxonomy.category.list(signal);

      const flatten = (nodes: CategoryNode[]): TaxonomyCategory[] =>
        nodes.flatMap((node) => {
          const catalogId = CATEGORY_ID_MAP[node.id] ?? node.id;
          const items: TaxonomyCategory[] = [
            {
              id: catalogId,
              nombre: node.nombre,
              activo: node.estado === "Activo",
            },
          ];
          if (node.hijas?.length) {
            items.push(...flatten(node.hijas));
          }
          return items;
        });

      const categories = flatten(nodos);
      for (const initial of initialCategories) {
        if (!categories.some((c) => c.id === initial.id)) {
          categories.push({ ...initial });
        }
      }
      return categories;
    } catch {
      return [...initialCategories];
    }
  }

  async getBrands(signal?: AbortSignal): Promise<TaxonomyBrand[]> {
    try {
      const taxonomy = getTaxonomyServices("mock");
      const { items } = await taxonomy.brand.list(signal);
      const brands: TaxonomyBrand[] = items.map((b) => ({
        id: b.marcaId,
        nombre: b.nombre,
        activo: b.estado === "Activo",
      }));
      for (const initial of initialBrands) {
        if (!brands.some((b) => b.id === initial.id)) {
          brands.push({ ...initial });
        }
      }
      return brands;
    } catch {
      return [...initialBrands];
    }
  }

  async getProductTypes(signal?: AbortSignal): Promise<TaxonomyProductType[]> {
    try {
      const taxonomy = getTaxonomyServices("mock");
      const { items } = await taxonomy.productType.list(signal);
      const types: TaxonomyProductType[] = items.map((t) => ({
        id: t.tipoProductoId,
        nombre: t.nombre,
        activo: t.estado === "Activo",
      }));
      for (const initial of initialProductTypes) {
        if (!types.some((t) => t.id === initial.id)) {
          types.push({ ...initial });
        }
      }
      return types;
    } catch {
      return [...initialProductTypes];
    }
  }

  async getAttributeSchema(
    typeId: string,
    signal?: AbortSignal,
  ): Promise<AttributeSchema[]> {
    try {
      const taxonomy = getTaxonomyServices("mock");
      const type = await taxonomy.productType.obtener(typeId, signal);
      if (type) {
        const catalog = await taxonomy.characteristic.list(signal);
        return Promise.all(
          type.asociadas
            .filter((item) => item.estado === "Activo")
            .map(async (association) => {
              const characteristic = await taxonomy.characteristic.obtener(
                association.caracteristicaId,
                signal,
              );
              if (!characteristic || characteristic.estado !== "Activo") {
                throw new Error(
                  `Característica ${association.caracteristicaId} no disponible en Taxonomía.`,
                );
              }
              const values =
                characteristic.tipo === "LISTA"
                  ? await taxonomy.characteristic.listarValores(
                      characteristic.id,
                      signal,
                    )
                  : undefined;
              return {
                caracteristicaId: characteristic.id,
                nombre: characteristic.nombre,
                tipo: characteristic.tipo,
                obligatorio: association.obligatoria,
                unidad: characteristic.unidad,
                opciones: values
                  ?.filter((v) => v.estado === "Activo")
                  .map((v) => ({ id: v.valorId, valor: v.nombre })),
                maxLength:
                  characteristic.tipo === "TEXTO"
                    ? catalog.config.maxTexto
                    : undefined,
              };
            }),
        );
      }
    } catch {
      // Fallback
    }
    return (attributeSchemasByType[typeId] ?? []).map((schema) => ({
      ...schema,
      maxLength: schema.tipo === "TEXTO" ? 100 : schema.maxLength,
    }));
  }
}

export const mockTaxonomyRepository = new MockTaxonomyRepository();
