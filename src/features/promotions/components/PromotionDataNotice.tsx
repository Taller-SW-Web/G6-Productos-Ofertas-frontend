import { FeedbackAlert } from "../../../components/shared";
import { useContext } from "react";
import { DataModeContext } from "../../../app/config/DataModeContext";

const messages = {
  coupons:
    "Los cupones y sus usos son simulados. Esta consulta no accede a información comercial real.",
  "coupon-form":
    "Los cambios se guardan solo en esta sesión de demostración. Al recargar se recuperan los datos de muestra.",
  campaigns:
    "Los registros y cambios son simulados y se reinician al recargar.",
  "campaign-detail":
    "Consulta y cambios locales de muestra; no se modifican compras reales.",
  "campaign-form":
    "Los cambios se guardan en esta sesión y se reinician al recargar. No se evalúan compras.",
  recommendations:
    "Las reglas y sus cambios son simulados. No agregan ni reemplazan productos automáticamente.",
  "recommendation-detail":
    "Las recomendaciones no agregan ni reemplazan productos automáticamente. No se reserva stock ni se calcula precio final.",
  "recommendation-form":
    "Las recomendaciones no agregan ni reemplazan productos automáticamente. Se configura una relación manual; no se calcula superioridad por precio.",
};

export function PromotionDataNotice({
  kind,
}: {
  kind: keyof typeof messages;
}) {
  if (useContext(DataModeContext) !== "mock") return null;
  return (
    <FeedbackAlert semantic="info" title="Datos de demostración">
      {messages[kind]}
    </FeedbackAlert>
  );
}
