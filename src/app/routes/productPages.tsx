import { lazy } from "react";

export const CurrentPricePage = lazy(() =>
  import("../../features/pricing/pages/CurrentPricePage").then((module) => ({
    default: module.CurrentPricePage,
  })),
);

export const BulkLayout = lazy(() =>
  import("../../features/bulk/pages/BulkLayout").then((module) => ({
    default: module.BulkLayout,
  })),
);

export const BulkUploadPage = lazy(() =>
  import("../../features/bulk/pages/BulkUploadPage").then((module) => ({
    default: module.BulkUploadPage,
  })),
);

export const BulkReviewPage = lazy(() =>
  import("../../features/bulk/pages/BulkReviewPage").then((module) => ({
    default: module.BulkReviewPage,
  })),
);

export const BulkProgressPage = lazy(() =>
  import("../../features/bulk/pages/BulkProgressPage").then((module) => ({
    default: module.BulkProgressPage,
  })),
);

export const BulkResultPage = lazy(() =>
  import("../../features/bulk/pages/BulkResultPage").then((module) => ({
    default: module.BulkResultPage,
  })),
);

export const BulkDownloadsPage = lazy(() =>
  import("../../features/bulk/pages/BulkDownloadsPage").then((module) => ({
    default: module.BulkDownloadsPage,
  })),
);
