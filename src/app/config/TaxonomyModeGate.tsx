import { lazy, Suspense, useContext, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { FeedbackAlert } from "../../components/shared";
import { DataModeContext } from "./DataModeContext";

const TaxonomyDataNotice = lazy(() =>
  import("../../features/taxonomy/components/TaxonomyDataNotice").then(
    (module) => ({ default: module.TaxonomyDataNotice }),
  ),
);

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
  if (mode === "api")
    return (
      <FeedbackAlert
        semantic="error"
        title="Integración con API real no disponible"
      >
        Integración con API real no disponible actualmente para el módulo de
        Taxonomía.
      </FeedbackAlert>
    );
  return (
    <>
      <Suspense fallback={null}>
        <TaxonomyDataNotice />
      </Suspense>
      {children}
    </>
  );
}