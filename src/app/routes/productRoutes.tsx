import type { RouteObject } from "react-router-dom";
import {
  BrandDetailPage,
  BrandFormPage,
  BrandListPage,
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
  ProductTypeAssociatePage,
  ProductTypeCreatePage,
  ProductTypeDetailPage,
  ProductTypeListPage,
  SeoConfigPage,
  SeoListPage,
} from "./productPages";
export const productRoutes: RouteObject[] = [
  { path: "/precios", element: <CurrentPricePage /> },
  // MK-008-S01: árbol/listado de categorías
  { path: "/categorias", element: <CategoryTreePage /> },
  // MK-008-S02: crear categoría
  { path: "/categorias/nueva", element: <CreateCategoryPage /> },
  // MK-008-S02-C: confirmar slug SEO (paso de creación)
  { path: "/categorias/confirmar-slug", element: <CreateCategoryPage /> },
  // MK-008-S03: editar categoría
  { path: "/categorias/:id/editar", element: <EditCategoryPage /> },
  // MK-008-S04 / S04-P / S04-B: solicitud y estado de desactivación
  { path: "/categorias/:id/desactivar", element: <DeactivateCategoryPage /> },
  // MK-008-S05-R: reactivación de categoría
  { path: "/categorias/:id/reactivar", element: <CategoryDetailPage /> },
  // MK-008-S05: detalle de categoría
  { path: "/categorias/:id", element: <CategoryDetailPage /> },
  // MK-009: características y valores
  { path: "/caracteristicas", element: <CharacteristicListPage /> },
  { path: "/caracteristicas/nueva", element: <CharacteristicCreatePage /> },
  { path: "/caracteristicas/:id/editar", element: <CharacteristicEditPage /> },
  { path: "/caracteristicas/:id/valores", element: <CharacteristicValuesPage /> },
  { path: "/caracteristicas/:id/estado", element: <CharacteristicStatePage /> },
  { path: "/caracteristicas/:id", element: <CharacteristicDetailPage /> },
  // MK-010: tipos de producto
  { path: "/tipos-producto", element: <ProductTypeListPage /> },
  { path: "/tipos-producto/nuevo", element: <ProductTypeCreatePage /> },
  { path: "/tipos-producto/:id/asociar", element: <ProductTypeAssociatePage /> },
  { path: "/tipos-producto/:id", element: <ProductTypeDetailPage /> },
  // MK-011: marcas
  { path: "/marcas", element: <BrandListPage /> },
  { path: "/marcas/nueva", element: <BrandFormPage /> },
  { path: "/marcas/:id/editar", element: <BrandFormPage /> },
  { path: "/marcas/:id", element: <BrandDetailPage /> },
  // MK-012: SEO y metadatos
  { path: "/seo", element: <SeoListPage /> },
  { path: "/seo/:id", element: <SeoConfigPage /> },
];
