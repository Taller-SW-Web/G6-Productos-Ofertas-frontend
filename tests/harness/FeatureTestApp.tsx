import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { ApplicationShell } from "../../src/app/layout/ApplicationShell";
import { NotFoundPage } from "../../src/app/pages/NotFoundPage";
import { productRoutes } from "../../src/app/routes/productRoutes";
import { demoRoutes } from "../../src/app/routes/demoRoutes";

// Isolated feature/adapter tests, without claiming a G7 identity. Never imported
// by the production entry. Auth E2E use the real App and its RequireSession guard.
if (!import.meta.env.DEV) throw new Error("Entrada exclusiva de pruebas locales.");
const router = createBrowserRouter([{
  element: <ApplicationShell />,
  children: [
    { path: "/", element: <Navigate to="/precios" replace /> },
    ...productRoutes,
    ...demoRoutes,
    { path: "*", element: <NotFoundPage /> },
  ],
}]);
export function FeatureTestApp() {
  return <RouterProvider router={router} />;
}
