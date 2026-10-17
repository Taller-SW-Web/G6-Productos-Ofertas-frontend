import { useContext, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { FeedbackAlert } from "../../components/shared";
import { DataModeContext } from "./DataModeContext";

export function CommercialModeGate({ children }: { children: ReactNode }) {
  const mode = useContext(DataModeContext);
  const { pathname } = useLocation();
  if (!mode)
    throw new Error("La aplicación requiere configurar su modo de datos.");
  const mockOnly = [
    "/cupones",
    "/promociones",
    "/recomendaciones",
    "/inventario",
    "/combos",
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (mode === "api" && mockOnly)
    return (
      <FeedbackAlert semantic="error" title="Función no disponible">
        Esta función no está disponible en el modo actual.
      </FeedbackAlert>
    );
  return children;
}
