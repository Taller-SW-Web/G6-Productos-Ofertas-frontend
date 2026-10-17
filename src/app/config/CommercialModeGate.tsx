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
      <FeedbackAlert semantic="error" title={pathname.startsWith("/combos") ? "Provider API de Combos no configurado" : "Integración API no disponible"}>
        {pathname.startsWith("/combos")
          ? "Combos requiere providers API de Combos, Catálogo y Pricing. No se cargan datos mock en este modo."
          : "Este módulo todavía utiliza un adapter de demostración. En modo API sus operaciones permanecen deshabilitadas hasta configurar su provider."}
      </FeedbackAlert>
    );
  return children;
}
