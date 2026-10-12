import type { RouteObject } from "react-router-dom";
import {
  CategoryDetailPage,
  CategoryTreePage,
  CharacteristicCreatePage,
  CharacteristicDetailPage,
  CharacteristicEditPage,
  CharacteristicListPage,
  CharacteristicStatePage,
  CharacteristicValuesPage,
  CreateCategoryPage,
  CurrentPricePage,
  DeactivateCategoryPage,
  EditCategoryPage,
} from "./productPages";
export const productRoutes: RouteObject[] = [
  { path: "/precios", element: <CurrentPricePage /> },
  { path: "/MK008/S01", element: <CategoryTreePage /> },
  { path: "/MK008/S02", element: <CreateCategoryPage /> },
  { path: "/MK008/S03/:id", element: <EditCategoryPage /> },
  { path: "/MK008/S04/:id", element: <DeactivateCategoryPage /> },
  { path: "/MK008/S05/:id", element: <CategoryDetailPage /> },
  { path: "/caracteristicas", element: <CharacteristicListPage /> },
  { path: "/caracteristicas/nueva", element: <CharacteristicCreatePage /> },
  { path: "/caracteristicas/:id/editar", element: <CharacteristicEditPage /> },
  { path: "/caracteristicas/:id/valores", element: <CharacteristicValuesPage /> },
  { path: "/caracteristicas/:id/estado", element: <CharacteristicStatePage /> },
  { path: "/caracteristicas/:id", element: <CharacteristicDetailPage /> },
];
