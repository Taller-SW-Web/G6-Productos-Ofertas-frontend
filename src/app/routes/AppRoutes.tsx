import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { ApplicationShell } from "../layout/ApplicationShell";
import { NotFoundPage } from "../pages/NotFoundPage";
import { demoRoutes } from "./demoRoutes";
import { productRoutes } from "./productRoutes";
const router = createBrowserRouter([
  {
    element: <ApplicationShell />,
    children: [
      { path: "/", element: <Navigate to="/precios" replace /> },
      ...productRoutes,
      ...(import.meta.env.DEV ? demoRoutes : []),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
export function AppRoutes() {
  return <RouterProvider router={router} />;
}
