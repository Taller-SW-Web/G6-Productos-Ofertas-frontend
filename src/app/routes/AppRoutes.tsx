import { lazy, Suspense, useContext, type ReactNode } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { ApplicationShell } from "../layout/ApplicationShell";
import { NotFoundPage } from "../pages/NotFoundPage";
import { demoRoutes } from "./demoRoutes";
import { productRoutes } from "./productRoutes";
import { RequireSession } from "./RequireSession";
import { LoginPage } from "../../features/auth/pages/LoginPage";
import { DataModeContext } from "../config/DataModeContext";
import { publicReadEntries } from "./publicReadEntries";
const G6ReadDemoApp = lazy(() => import("../../features/catalog/pages/G6ReadDemoApp").then(module => ({ default: module.G6ReadDemoApp })));
const ReadOnlyPage = lazy(() => import("../../features/reads/ReadOnlyPage").then(module => ({ default: module.ReadOnlyPage })));
function PublicReadEntry({ children }: { children: ReactNode }) {
  const mode = useContext(DataModeContext);
  const { pathname } = useLocation();
  const operation = publicReadEntries[pathname];
  return mode === "api" && operation
    ? <Suspense fallback={<p role="status">Cargando consultas…</p>}><ReadOnlyPage key={pathname} initialOperationId={operation} /></Suspense>
    : children;
}
const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  ...(import.meta.env.VITE_G6_READ_DEMO === "true" ? [{
    path: "/demo/g6/*",
    element: <Suspense fallback={<p role="status">Cargando catálogo…</p>}><G6ReadDemoApp /></Suspense>,
  }] : []),
  {
    element: <RequireSession />,
    children: [
      {
        element: <ApplicationShell />,
        children: [
          { path: "/", element: <Navigate to="/precios" replace /> },
          ...productRoutes.map(route => ({ ...route, element: <PublicReadEntry>{route.element}</PublicReadEntry> })),
          { path: "/consultas", element: <Suspense fallback={<p role="status">Cargando consultas…</p>}><ReadOnlyPage /></Suspense> },
          ...(import.meta.env.DEV ? demoRoutes : []),
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
export function AppRoutes() {
  return <RouterProvider router={router} />;
}
