import { useContext, useMemo } from "react";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { useCatalogServices } from "../../catalog/hooks/useCatalogServices";
import { getCatalogServices } from "../../catalog/services/catalogServices";
import type { CatalogRepository } from "../../catalog/services/catalogRepository";
import type { CandidateProduct, CandidateVariant } from "../types/combos";
import { ComboRepositoryError } from "./combosRepository";

export interface CandidateProductsService {
  getCandidateProducts(signal?: AbortSignal): Promise<CandidateProduct[]>;
}

export function createCandidateProductsService(
  mode: "mock" | "api",
  catalogRepo?: CatalogRepository,
): CandidateProductsService {
  if (mode === "api") {
    return {
      getCandidateProducts: async () => {
        throw new ComboRepositoryError(
          "SERVICIO_NO_DISPONIBLE",
          "Catálogo no disponible: integración con API real no configurada.",
        );
      },
    };
  }

  return {
    getCandidateProducts: async (signal?: AbortSignal) => {
      const catalog = catalogRepo ?? getCatalogServices("mock").catalog;
      const pageResult = await catalog.list(
        { page: 1, pageSize: 100, status: "all" },
        undefined,
        signal,
      );

      const candidates: CandidateProduct[] = [];

      for (const p of pageResult.items) {
        let variants: CandidateVariant[] = [];
        if (p.hasVariants) {
          try {
            const varResult = await catalog.listVariants(
              p.id,
              { page: 1, pageSize: 100, status: "all" },
              undefined,
              signal,
            );
            variants = varResult.items.map((v) => ({
              variantId: v.variantId,
              sku: v.sku,
              label:
                v.identifyingAttributes?.map((a) => `${a.nombre}: ${a.valor}`).join(", ") ||
                v.sku,
              status: v.status,
            }));
          } catch {
            variants = [];
          }
        }

        candidates.push({
          productId: p.id,
          name: p.name,
          hasVariants: p.hasVariants,
          skuBase: p.skuBase,
          status: p.status,
          typeName: p.typeName,
          typeId: p.typeId,
          variants,
        });
      }

      // Merge mock demonstration candidate products if not already in catalog
      const { catalogCandidateProducts } = await import("../mocks/combosFixtures");
      for (const cp of catalogCandidateProducts) {
        if (!candidates.some((c) => c.productId === cp.productId || c.skuBase === cp.skuBase)) {
          candidates.push(cp);
        }
      }

      return candidates;
    },
  };
}

export function useCandidateProducts(): CandidateProductsService {
  const mode = useContext(DataModeContext);
  const catalogServices = useCatalogServices();
  if (!mode) {
    throw new Error("CandidateProducts requiere DataModeContext.");
  }
  return useMemo(
    () => createCandidateProductsService(mode, catalogServices.catalog),
    [mode, catalogServices.catalog],
  );
}
