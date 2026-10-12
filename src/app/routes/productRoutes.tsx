import type { RouteObject } from "react-router-dom";
import {
  BrandDetailPage,
  BrandFormPage,
  BrandListPage,
  CampaignDetailPage,
  CampaignEditorLayout,
  CampaignFormPage,
  CampaignsPage,
  CampaignScopePage,
  CategoryDetailPage,
  CategoryTreePage,
  CharacteristicCreatePage,
  CharacteristicDetailPage,
  CharacteristicEditPage,
  CharacteristicListPage,
  CharacteristicStatePage,
  CharacteristicValuesPage,
  CouponDetailPage,
  CouponFormPage,
  CouponsPage,
  CreateCategoryPage,
  CurrentPricePage,
  DeactivateCategoryPage,
  EditCategoryPage,
  EditPricePage,
  HistoricalPricePage,
  ImportPricesPage,
  PriceImportResultPage,
  PriceSchedulesPage,
  ProductTypeAssociatePage,
  ProductTypeCreatePage,
  ProductTypeDetailPage,
  ProductTypeListPage,
  RecommendationDetailPage,
  RecommendationEditorLayout,
  RecommendationFormPage,
  RecommendationSelectorPage,
  RecommendationsPage,
  SeoConfigPage,
  SeoListPage,
} from "./productPages";
export const productRoutes: RouteObject[] = [
  { path: "/precios", element: <CurrentPricePage /> },
  { path: "/precios/editar", element: <EditPricePage /> },
  { path: "/precios/programaciones", element: <PriceSchedulesPage /> },
  { path: "/precios/importar", element: <ImportPricesPage /> },
  {
    path: "/precios/importaciones/:batchId",
    element: <PriceImportResultPage />,
  },
  { path: "/precios/historico", element: <HistoricalPricePage /> },
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
  // Recomendaciones / venta cruzada y upselling
  { path: "/recomendaciones", element: <RecommendationsPage /> },
  {
    path: "/recomendaciones/nueva/venta-cruzada",
    element: <RecommendationEditorLayout kind="cross-sell" />,
    children: [
      { index: true, element: <RecommendationFormPage /> },
      { path: "productos", element: <RecommendationSelectorPage /> },
    ],
  },
  {
    path: "/recomendaciones/nueva/upselling",
    element: <RecommendationEditorLayout kind="upsell" />,
    children: [
      { index: true, element: <RecommendationFormPage /> },
      { path: "productos", element: <RecommendationSelectorPage /> },
    ],
  },
  {
    path: "/recomendaciones/:ruleId/editar",
    element: <RecommendationEditorLayout />,
    children: [
      { index: true, element: <RecommendationFormPage /> },
      { path: "productos", element: <RecommendationSelectorPage /> },
    ],
  },
  { path: "/recomendaciones/:ruleId", element: <RecommendationDetailPage /> },
  {
    path: "/recomendaciones/:ruleId/estado",
    element: <RecommendationDetailPage changeState />,
  },
  // Ofertas y promociones (campañas)
  { path: "/promociones", element: <CampaignsPage /> },
  {
    path: "/promociones/nueva",
    element: <CampaignEditorLayout />,
    children: [
      { index: true, element: <CampaignFormPage /> },
      { path: "alcance", element: <CampaignScopePage /> },
    ],
  },
  {
    path: "/promociones/:promotionId/editar",
    element: <CampaignEditorLayout />,
    children: [
      { index: true, element: <CampaignFormPage /> },
      { path: "alcance", element: <CampaignScopePage /> },
    ],
  },
  { path: "/promociones/:promotionId", element: <CampaignDetailPage /> },
  {
    path: "/promociones/:promotionId/estado",
    element: <CampaignDetailPage changeState />,
  },
  // Cupones de descuento
  { path: "/cupones", element: <CouponsPage /> },
  { path: "/cupones/nuevo", element: <CouponFormPage /> },
  { path: "/cupones/:couponId/editar", element: <CouponFormPage /> },
  {
    path: "/cupones/:couponId/estado",
    element: <CouponDetailPage changeState />,
  },
  { path: "/cupones/:couponId", element: <CouponDetailPage /> },
  {
    path: "/cupones/:couponId/limites",
    element: <CouponDetailPage limitsOnly />,
  },
];
