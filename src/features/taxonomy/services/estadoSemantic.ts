import type { Semantic } from "../../../theme/tokens";
import type { CategoryNode } from "../types";

// DESIGN.md 1.1.0: "Activo"/"Inactivo" are neutral; only attention states use a signal color.
export const estadoSemantic: Record<CategoryNode["estado"], Semantic> = {
  Activo: "neutral",
  Inactivo: "neutral",
  "Verificando baja": "warning",
};
