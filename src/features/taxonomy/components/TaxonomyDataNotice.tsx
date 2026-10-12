import { useContext } from "react";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { FeedbackAlert } from "../../../components/shared";

// Centralized demo notice for the Taxonomy module. It renders only while the
// application runs in mock mode, so production api builds never show it.
export function TaxonomyDataNotice() {
  if (useContext(DataModeContext) !== "mock") return null;
  return (
    <FeedbackAlert semantic="info" title="Datos de demostración">
      La información mostrada es simulada. Esta pantalla no consulta ni modifica
      datos reales del catálogo.
    </FeedbackAlert>
  );
}
