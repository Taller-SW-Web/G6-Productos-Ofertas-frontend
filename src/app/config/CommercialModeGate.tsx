import { PromotionApiContext } from "./PromotionApiContext";
import { useContext, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Anchor } from "@mantine/core";
import { FeedbackAlert } from "../../components/shared";
import { DataModeContext } from "./DataModeContext";
import { consultaEntries, consultaHref } from "../routes/publicReadEntries";

export function CommercialModeGate({ children }: { children: ReactNode }) {
  const mode = useContext(DataModeContext);
  const api = useContext(PromotionApiContext);
  const { pathname } = useLocation();
  if (!mode)
    throw new Error("La aplicación requiere configurar su modo de datos.");
  const mockOnly = ["/cupones", "/promociones", "/recomendaciones"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // En modo API solo se habilitan /inventario/umbrales y /inventario/dashboard.
  // /inventario y /inventario/traslados se conservan explícitamente bloqueadas.
  const isBlockedInventory =
    pathname === "/inventario" ||
    pathname === "/inventario/" ||
    pathname === "/inventario/traslados" ||
    pathname.startsWith("/inventario/traslados/");

  const pendingModule =
    isBlockedInventory ||
    ["/combos"].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );

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
