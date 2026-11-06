import { useContext, type ReactNode } from "react";
import { FeedbackAlert } from "../../components/shared";
import { PromotionSessionGate } from "../../features/promotions/components/PromotionSessionGate";
import { DataModeContext } from "./DataModeContext";
import { PromotionSessionContext } from "./PromotionSessionContext";

export function GlobalSessionGate({ children }: { children: ReactNode }) {
  const mode = useContext(DataModeContext);
  const session = useContext(PromotionSessionContext);
  if (mode !== "api") return children;
  if (!session)
    return (
      <FeedbackAlert semantic="error" title="Inicio de sesión no disponible">
        Configura el origen autorizado de Seguridad G7 y el Gateway para iniciar
        una sesión humana. No se habilita acceso sin autenticación.
      </FeedbackAlert>
    );
  return <PromotionSessionGate session={session}>{children}</PromotionSessionGate>;
}
