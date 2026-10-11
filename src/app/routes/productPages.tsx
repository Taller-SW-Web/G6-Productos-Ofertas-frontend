import { lazy } from "react";
export const CurrentPricePage = lazy(() =>
  import("../../features/pricing/pages/CurrentPricePage").then((module) => ({
    default: module.CurrentPricePage,
  })),
);
export const CategoryTreePage = lazy(() =>
  import("../../features/taxonomy/pages/CategoryTreePage").then((module) => ({
    default: module.CategoryTreePage,
  })),
);
export const CreateCategoryPage = lazy(() =>
  import("../../features/taxonomy/pages/CreateCategoryPage").then((module) => ({
    default: module.CreateCategoryPage,
  })),
);
export const EditCategoryPage = lazy(() =>
  import("../../features/taxonomy/pages/EditCategoryPage").then((module) => ({
    default: module.EditCategoryPage,
  })),
);
export const CategoryDetailPage = lazy(() =>
  import("../../features/taxonomy/pages/CategoryDetailPage").then((module) => ({
    default: module.CategoryDetailPage,
  })),
);
