import { Navigate, useRoutes } from "react-router-dom";
import { ApplicationShell } from "../layout/ApplicationShell";
import { NotFoundPage } from "../pages/NotFoundPage";
import { demoRoutes } from "./demoRoutes";
import { productRoutes } from "./productRoutes";
export function AppRoutes() {
  return useRoutes([
    {
      element: <ApplicationShell />,
      children: [
        { path: "/", element: <Navigate to="/foundation/listados" replace /> },
        ...productRoutes,
        ...demoRoutes,
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ]);
}
