import type { RouteObject } from "react-router-dom";
import {
  CategoryDetailPage,
  CategoryTreePage,
  CreateCategoryPage,
  CurrentPricePage,
  EditCategoryPage,
} from "./productPages";
export const productRoutes: RouteObject[] = [
  { path: "/precios", element: <CurrentPricePage /> },
  { path: "/MK008/S01", element: <CategoryTreePage /> },
  { path: "/MK008/S02", element: <CreateCategoryPage /> },
  { path: "/MK008/S03/:id", element: <EditCategoryPage /> },
  { path: "/MK008/S05/:id", element: <CategoryDetailPage /> },
];
