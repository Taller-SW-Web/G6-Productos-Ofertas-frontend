import { lazy } from "react";
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
