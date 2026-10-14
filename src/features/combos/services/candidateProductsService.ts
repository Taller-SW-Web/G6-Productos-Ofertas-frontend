import { useContext, useMemo } from "react";
import { DataModeContext } from "../../../app/config/DataModeContext";
import type { CandidateProduct } from "../types/combos";
import { ComboRepositoryError } from "./combosRepository";

export interface CandidateProductsService {
  getCandidateProducts(signal?: AbortSignal): Promise<CandidateProduct[]>;
}

export function createCandidateProductsService(mode: "mock" | "api"): CandidateProductsService {
  if (mode === "api") {
    return {
      getCandidateProducts: async () => {
        throw new ComboRepositoryError(
          "SERVICIO_NO_DISPONIBLE",
          "Integración con API real no disponible actualmente para Catálogo.",
        );
      },
    };
  }

  return {
    getCandidateProducts: async () => {
      // Dynamically import mock fixtures only in mock mode to avoid leaking fixtures in API mode
      const { catalogCandidateProducts } = await import("../mocks/combosFixtures");
      return catalogCandidateProducts;
    },
  };
}

export function useCandidateProducts(): CandidateProductsService {
  const mode = useContext(DataModeContext);
  if (!mode) {
    throw new Error("CandidateProducts requiere DataModeContext.");
  }
  return useMemo(() => createCandidateProductsService(mode), [mode]);
}
