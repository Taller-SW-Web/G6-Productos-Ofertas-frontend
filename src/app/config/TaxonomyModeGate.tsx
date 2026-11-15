import { useContext, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { FeedbackAlert } from "../../components/shared";
import { DataModeContext } from "./DataModeContext";
import { isTaxonomyGatewayConfigured } from "../../features/taxonomy/services/taxonomyGatewayRuntime";

const taxonomyPaths = [
  "/categorias",
  "/caracteristicas",
  "/tipos-producto",
  "/marcas",
  "/seo",
] as const;

function isTaxonomyPath(pathname: string): boolean {
  return taxonomyPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function TaxonomyModeGate({ children }: { children: ReactNode }) {
  const mode = useContext(DataModeContext);
  const { pathname } = useLocation();
  if (!mode)
    throw new Error("La aplicación requiere configurar su modo de datos.");
  if (!isTaxonomyPath(pathname)) return children;
  if (mode === "mock")
    return (
      <>
        <FeedbackAlert semantic="info" title="Datos simulados">
          Esta pantalla utiliza datos de demostración locales.
        </FeedbackAlert>
        {children}
      </>
    );
  if (mode === "api" && isTaxonomyGatewayConfigured()) return children;
  return (
    <FeedbackAlert semantic="error" title="Función no disponible">
      Se requiere sesión G7 y un origen Gateway configurado para esta operación.
    </FeedbackAlert>
  );
}
