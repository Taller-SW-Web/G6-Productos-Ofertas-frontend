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
import { isCharacteristicValuePending } from "../../taxonomy/adapters/mockCharacteristicAdapter";

// ---------------------------------------------------------------------------
// Canonical mapping between Taxonomía IDs and Catálogo IDs (LOP-01 / LOP-02).
// Only these root IDs are mapped; subcategories and new categories keep their
// Taxonomía IDs. Fixtures from taxonomyFixtures are ONLY added as explicit
// compatibility seeds for IDs that are known to be used by existing Catalog
// products but are not yet represented in Taxonomía.
// ---------------------------------------------------------------------------
export const CATEGORY_ID_MAP: Record<string, string> = {
  calzado: "CAT-CALZADO",
  ropa: "CAT-ROPA",
  accesorios: "CAT-ACC",
};

// Reverse: CAT-* → Taxonomía ID, for lookups that arrive with Catalog IDs.
export const REVERSE_CATEGORY_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_ID_MAP).map(([t, c]) => [c, t]),
);

// Mapping of Taxonomía product-type IDs → Catalog TIP-* IDs.
// Only enumerate IDs that are CONFIRMED equivalent (same concept, same schema).
// Do NOT add a mapping just because names look similar.
export const PRODUCT_TYPE_ID_MAP: Record<string, string> = {
  // No confirmed equivalences yet. Taxonomía uses "calzado"/"ropa"/"accesorios";
  // Catalog uses "TIP-ZAPATILLA", "TIP-CAMISA", etc. These are DIFFERENT
  // granularity concepts — do not conflate them.
  // Coordinación pendiente con Poma (H-03).
};

// MK-010 / MK-004: confirmed equivalence between Taxonomía characteristic IDs and
// the Catalog schema characteristic IDs. Taxonomía expresses Color and Talla as
// `color`/`talla`; the Catalog attribute schema (fixtures) uses `CAR-COLOR`/
// `CAR-TALLA`. Without this map the fixture reference is not found and the
// `esIdentificadora` flag is lost, which breaks variant identification in MK-004.
// Only confirmed same-concept equivalences belong here; never infer from names.
export const CHARACTERISTIC_ID_MAP: Record<string, string> = {
  color: "CAR-COLOR",
  talla: "CAR-TALLA",
};

// ---------------------------------------------------------------------------
// Helper: flatten CategoryNode tree into a flat list, translating IDs.
// ---------------------------------------------------------------------------
const flattenCategories = (nodes: CategoryNode[]): TaxonomyCategory[] =>
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
      items.push(...flattenCategories(node.hijas));
    }
    return items;
  });

// ---------------------------------------------------------------------------
// Compatibility seed policy: only add fixtures for IDs that are referenced by
// existing Catalog products but absent from Taxonomía. If Taxonomía already has
// the data (after map), do NOT add the fixture — that would duplicate.
//
// This function is called ONLY when live data was obtained successfully.
// It does NOT fall back on error.
// ---------------------------------------------------------------------------
const addCompatibilitySeeds = <T extends { id: string }>(
  live: T[],
  seeds: T[],
): T[] => {
  const result = [...live];
  for (const seed of seeds) {
    if (!result.some((item) => item.id === seed.id)) {
      result.push({ ...seed });
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// MockTaxonomyRepository
//
// H-01: Errors and AbortSignal cancellations propagate to the caller.
//   - Taxonomy service errors are re-thrown (no silent catch-all fallback).
//   - AbortError from signal.throwIfAborted() propagates naturally.
//   - The compatibility-seed policy (addCompatibilitySeeds) runs only when
//     live data was obtained without error.
//
// H-02: Product-type and attribute-schema integration.
//   - getProductTypes() does NOT conflate Taxonomía types with Catalog TIP-*
//     unless PRODUCT_TYPE_ID_MAP defines a confirmed equivalence.
//   - getAttributeSchema() resolves from Taxonomía first; falls back to
//     attributeSchemasByType ONLY for TIP-* IDs that are outside Taxonomía's
//     scope (i.e., id starts with "TIP-" and is not in PRODUCT_TYPE_ID_MAP).
//   - esIdentificadora is propagated from fixture schemas for TIP-* fallback.
//   - Characteristic errors propagate; missing characteristics throw instead
//     of being silently skipped.
// ---------------------------------------------------------------------------
export class MockTaxonomyRepository implements TaxonomyRepository {
  // -------------------------------------------------------------------------
  // H-01 fix: no try/catch around the entire body. Signal cancellations and
  // taxonomy service errors propagate to the caller.
  // Compatibility seeds are added explicitly after successful live read.
  // -------------------------------------------------------------------------
  async getCategories(signal?: AbortSignal): Promise<TaxonomyCategory[]> {
    const taxonomy = getTaxonomyServices("mock");
    const { nodos } = await taxonomy.category.list(signal);
    // AbortError from the above propagates naturally.

    const categories = flattenCategories(nodos);

    // Explicit compatibility policy: add known fixture IDs not yet in Taxonomía.
    return addCompatibilitySeeds(categories, initialCategories);
  }

  async getBrands(signal?: AbortSignal): Promise<TaxonomyBrand[]> {
    const taxonomy = getTaxonomyServices("mock");
    const { items } = await taxonomy.brand.list(signal);
    // AbortError propagates naturally.

    const brands: TaxonomyBrand[] = items.map((b) => ({
      id: b.marcaId,
      nombre: b.nombre,
      activo: b.estado === "Activo",
    }));

    return addCompatibilitySeeds(brands, initialBrands);
  }

  // -------------------------------------------------------------------------
  // H-02 fix: getProductTypes does NOT map Taxonomía IDs to TIP-* unless
  // PRODUCT_TYPE_ID_MAP provides a confirmed equivalence. Catalog's TIP-*
  // types are added as compatibility seeds because they are outside Taxonomía.
  // -------------------------------------------------------------------------
  async getProductTypes(signal?: AbortSignal): Promise<TaxonomyProductType[]> {
    const taxonomy = getTaxonomyServices("mock");
    const { items } = await taxonomy.productType.list(signal);
    // AbortError propagates naturally.

    const types: TaxonomyProductType[] = items.map((t) => ({
      // Apply confirmed mapping if it exists; otherwise keep Taxonomía ID.
      id: PRODUCT_TYPE_ID_MAP[t.tipoProductoId] ?? t.tipoProductoId,
      nombre: t.nombre,
      activo: t.estado === "Activo",
    }));

    // Add Catalog-native TIP-* types as explicit compatibility seeds since
    // Taxonomía does not yet cover that granularity (pending H-03 / Poma).
    return addCompatibilitySeeds(types, initialProductTypes);
  }

  // -------------------------------------------------------------------------
  // H-01 / H-02 fix for getAttributeSchema:
  // 1. For IDs within Taxonomía scope: query Taxonomía, propagate errors,
  //    propagate esIdentificadora from association (when available).
  // 2. For TIP-* IDs outside Taxonomía (not in PRODUCT_TYPE_ID_MAP): use
  //    fixture schema with full fidelity (including esIdentificadora).
  // 3. No silent catch-all; individual characteristic errors propagate.
  // -------------------------------------------------------------------------
  async getAttributeSchema(
    typeId: string,
    signal?: AbortSignal,
  ): Promise<AttributeSchema[]> {
    // If typeId is a Catalog-native TIP-* outside Taxonomía scope, serve the
    // fixture directly without attempting a Taxonomía call that would fail.
    const isCatalogNativeTip =
      typeId.startsWith("TIP-") && !(typeId in PRODUCT_TYPE_ID_MAP);
    if (isCatalogNativeTip) {
      const fixtureSchemas = attributeSchemasByType[typeId];
      if (fixtureSchemas) {
        // Return a defensive copy with full fidelity (esIdentificadora included).
        return fixtureSchemas.map((s) => ({
          ...s,
          maxLength: s.tipo === "TEXTO" ? (s.maxLength ?? 100) : s.maxLength,
        }));
      }
      // Unknown TIP-* with no fixture: return empty (no Taxonomía fallback exists).
      return [];
    }

    // Resolve Taxonomía ID: if caller passed a mapped CAT ID, resolve back.
    const taxonomyTypeId = PRODUCT_TYPE_ID_MAP[typeId]
      ? typeId // already a Taxonomía ID (the map points from Taxonomía → TIP-*)
      : typeId;

    const taxonomy = getTaxonomyServices("mock");

    // H-01: this call's errors propagate; no catch.
    const type = await taxonomy.productType.obtener(taxonomyTypeId, signal);

    if (!type) {
      // Type not found in Taxonomía and not a known TIP-* fixture.
      return [];
    }

    const catalog = await taxonomy.characteristic.list(signal);

    // H-01: each characteristic resolution throws if not found or inactive.
    // H-02: esIdentificadora is propagated from fixture schemas when available
    //       (Taxonomía's characteristic model does not carry it natively yet).
    const fixtureByCharId = new Map<string, AttributeSchema>();
    for (const schemas of Object.values(attributeSchemasByType)) {
      for (const s of schemas) {
        if (!fixtureByCharId.has(s.caracteristicaId)) {
          fixtureByCharId.set(s.caracteristicaId, s);
        }
      }
    }

    const activeAssociations = type.asociadas.filter(
      (item) => item.estado === "Activo",
    );

    return Promise.all(
      activeAssociations.map(async (association) => {
        const characteristic = await taxonomy.characteristic.obtener(
          association.caracteristicaId,
          signal,
        );

        if (!characteristic || characteristic.estado !== "Activo") {
          // H-01: propagate instead of swallowing.
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

        // H-02: carry esIdentificadora from fixture if Taxonomía doesn't
        // express it (the field belongs to the Catalog schema contract, not
        // the Taxonomía characteristic model). Resolve the fixture through the
        // confirmed Taxonomía → Catalog characteristic ID equivalence.
        const fixtureRef = fixtureByCharId.get(
          CHARACTERISTIC_ID_MAP[characteristic.id] ?? characteristic.id,
        );
        const esIdentificadora = fixtureRef?.esIdentificadora ?? false;

        return {
          caracteristicaId: characteristic.id,
          nombre: characteristic.nombre,
          tipo: characteristic.tipo,
          obligatorio: association.obligatoria,
          unidad: characteristic.unidad,
          esIdentificadora,
          opciones: values
            ?.filter(
              (v) =>
                v.estado === "Activo" &&
                !isCharacteristicValuePending(characteristic.id, v.valorId),
            )
            .map((v) => ({ id: v.valorId, valor: v.nombre })),
          maxLength:
            characteristic.tipo === "TEXTO"
              ? catalog.config.maxTexto
              : undefined,
        } satisfies AttributeSchema;
      }),
    );
  }
}

export const mockTaxonomyRepository = new MockTaxonomyRepository();
