import { lazy } from "react";
export const RecommendationsPage = lazy(() =>
  import("../../features/promotions/pages/RecommendationsPage").then(
    (module) => ({ default: module.RecommendationsPage }),
  ),
);
export const RecommendationDetailPage = lazy(() =>
  import("../../features/promotions/pages/RecommendationDetailPage").then(
    (module) => ({ default: module.RecommendationDetailPage }),
  ),
);
export const RecommendationEditorLayout = lazy(() =>
  import("../../features/promotions/pages/RecommendationEditorLayout").then(
    (module) => ({ default: module.RecommendationEditorLayout }),
  ),
);
export const RecommendationFormPage = lazy(() =>
  import("../../features/promotions/pages/RecommendationFormPage").then(
    (module) => ({ default: module.RecommendationFormPage }),
  ),
);
export const RecommendationSelectorPage = lazy(() =>
  import("../../features/promotions/pages/RecommendationSelectorPage").then(
    (module) => ({ default: module.RecommendationSelectorPage }),
  ),
);
export const CampaignsPage = lazy(() =>
  import("../../features/promotions/pages/CampaignsPage").then((module) => ({
    default: module.CampaignsPage,
  })),
);
export const CampaignDetailPage = lazy(() =>
  import("../../features/promotions/pages/CampaignDetailPage").then(
    (module) => ({ default: module.CampaignDetailPage }),
  ),
);
export const CampaignEditorLayout = lazy(() =>
  import("../../features/promotions/pages/CampaignEditorLayout").then(
    (module) => ({ default: module.CampaignEditorLayout }),
  ),
);
export const CampaignFormPage = lazy(() =>
  import("../../features/promotions/pages/CampaignFormPage").then((module) => ({
    default: module.CampaignFormPage,
  })),
);
export const CampaignScopePage = lazy(() =>
  import("../../features/promotions/pages/CampaignScopePage").then(
    (module) => ({ default: module.CampaignScopePage }),
  ),
);
export const CouponFormPage = lazy(() =>
  import("../../features/promotions/pages/CouponFormPage").then((module) => ({
    default: module.CouponFormPage,
  })),
);
export const CouponsPage = lazy(() =>
  import("../../features/promotions/pages/CouponsPage").then((module) => ({
    default: module.CouponsPage,
  })),
);
export const CouponDetailPage = lazy(() =>
  import("../../features/promotions/pages/CouponDetailPage").then((module) => ({
    default: module.CouponDetailPage,
  })),
);
export const CurrentPricePage = lazy(() =>
  import("../../features/pricing/pages/CurrentPricePage").then((module) => ({
    default: module.CurrentPricePage,
  })),
);
export const EditPricePage = lazy(() =>
  import("../../features/pricing/pages/EditPricePage").then((module) => ({
    default: module.EditPricePage,
  })),
);
export const PriceSchedulesPage = lazy(() =>
  import("../../features/pricing/pages/PriceSchedulesPage").then((module) => ({
    default: module.PriceSchedulesPage,
  })),
);
export const ImportPricesPage = lazy(() =>
  import("../../features/pricing/pages/ImportPricesPage").then((module) => ({
    default: module.ImportPricesPage,
  })),
);
export const PriceImportResultPage = lazy(() =>
  import("../../features/pricing/pages/PriceImportResultPage").then(
    (module) => ({ default: module.PriceImportResultPage }),
  ),
);
export const HistoricalPricePage = lazy(() =>
  import("../../features/pricing/pages/HistoricalPricePage").then((module) => ({
    default: module.HistoricalPricePage,
  })),
);
