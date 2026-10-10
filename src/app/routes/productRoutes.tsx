import type { RouteObject } from "react-router-dom";
import {
  BulkDownloadsPage,
  BulkLayout,
  BulkProgressPage,
  BulkResultPage,
  BulkReviewPage,
  BulkUploadPage,
  CurrentPricePage,
} from "./productPages";

export const productRoutes: RouteObject[] = [
  { path: "/precios", element: <CurrentPricePage /> },
  {
    path: "/carga-masiva",
    element: <BulkLayout />,
    children: [
      { index: true, element: <BulkUploadPage /> },
      { path: "revisar", element: <BulkReviewPage /> },
      { path: "importaciones/:batchId", element: <BulkProgressPage /> },
      { path: "importaciones/:batchId/resultado", element: <BulkResultPage /> },
      { path: "descargas", element: <BulkDownloadsPage /> },
    ],
  },
];
