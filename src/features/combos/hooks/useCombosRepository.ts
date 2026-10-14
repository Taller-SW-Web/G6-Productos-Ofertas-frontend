import { useContext, useMemo } from "react";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { getCombosService } from "../services/combosService";
import type { CombosRepository } from "../services/combosRepository";

export function useCombosRepository(): CombosRepository {
  const mode = useContext(DataModeContext);
  if (!mode) {
    throw new Error("Combos requiere DataModeContext.");
  }
  return useMemo(() => getCombosService(mode), [mode]);
}
