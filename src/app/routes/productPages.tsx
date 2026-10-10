import { lazy } from "react";
export const CurrentPricePage = lazy(() =>
  import("../../features/pricing/pages/CurrentPricePage").then((module) => ({
    default: module.CurrentPricePage,
  })),
);
