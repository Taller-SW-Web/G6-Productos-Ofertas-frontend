import { PromotionApiContext } from "./PromotionApiContext";
import { useContext, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Anchor } from "@mantine/core";
import { FeedbackAlert } from "../../components/shared";
import { DataModeContext } from "./DataModeContext";
import { consultaEntries, consultaHref } from "../routes/publicReadEntries";
import { AdminApiContext } from "./AdminApiContext";

export function CommercialModeGate({ children }: { children: ReactNode }) {
  const mode = useContext(DataModeContext);
  const api = useContext(PromotionApiContext);
  const adminApi = useContext(AdminApiContext);
  const { pathname } = useLocation();
  if (!mode)
    throw new Error("La aplicación requiere configurar su modo de datos.");
  const mockOnly = ["/cupones", "/promociones", "/recomendaciones"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  const route = pathname.replace(/\/+$/, "");
  const transfers = route === "/inventario/traslados" || route.startsWith("/inventario/traslados/");
  const pendingModule = transfers || (!adminApi &&
    (route === "/inventario" || route === "/combos" || route.startsWith("/combos/")));

  if (mode === "api" && (pendingModule || (mockOnly && !api))) {
    const entry = consultaEntries[pathname];
    return (
      <FeedbackAlert semantic="error" title="Función no disponible">
        Esta función no está disponible en el modo actual.
        {entry ? (
          <>
            {" "}
            {entry.limitation}{" "}
            <Anchor component={Link} to={consultaHref(entry.operationId)}>
              Abrir en Consultas de los módulos
            </Anchor>
            .
          </>
        ) : null}
      </FeedbackAlert>
    );
  }
  return children;
}
