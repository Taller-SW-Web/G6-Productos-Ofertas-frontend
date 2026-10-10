import type { RouteObject } from "react-router-dom";
import { CurrentPricePage } from "./productPages";
export const productRoutes: RouteObject[] = [
  { path: "/precios", element: <CurrentPricePage /> },
];
