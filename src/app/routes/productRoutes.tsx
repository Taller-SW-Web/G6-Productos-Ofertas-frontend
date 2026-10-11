import type { RouteObject } from "react-router-dom";
import {
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
];
