import { useContext, useMemo } from "react";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { getCombosService } from "../services/combosService";
import type { CombosRepository } from "../services/combosRepository";

export function useCombosRepository(): CombosRepository {
  const mode = useContext(DataModeContext) ?? "mock";
  return useMemo(() => getCombosService(mode), [mode]);
}
