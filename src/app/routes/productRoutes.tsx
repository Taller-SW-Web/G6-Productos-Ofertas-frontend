import type { RouteObject } from "react-router-dom";
import {
  RecommendationsPage,
  RecommendationDetailPage,
  RecommendationEditorLayout,
  RecommendationFormPage,
  RecommendationSelectorPage,
  CampaignsPage,
  CampaignDetailPage,
  CampaignEditorLayout,
  CampaignFormPage,
  CampaignScopePage,
  CouponDetailPage,
  CouponFormPage,
  CouponsPage,
  CurrentPricePage,
  EditPricePage,
  PriceSchedulesPage,
  ImportPricesPage,
  PriceImportResultPage,
  HistoricalPricePage,
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
