import { lazy, Suspense } from "react";
import { AppRoutes } from "./routes/AppRoutes";
const G6ReadDemoApp = lazy(() =>
  import("../features/catalog/pages/G6ReadDemoApp").then((module) => ({
    default: module.G6ReadDemoApp,
  })),
);
export function App() {
  if (import.meta.env.VITE_G6_READ_DEMO === "true")
    return (
      <Suspense fallback={<p role="status">Cargando catálogo…</p>}>
        <G6ReadDemoApp />
      </Suspense>
    );
  return <AppRoutes />;
}
