import { createElement, lazy } from "react";
import type {
  PricingRuntime,
  ReportDownloader,
} from "../services/pricingRuntime";
import { createMockPricingRepository } from "../adapters/mockPricingRepository";
import { DemoControl } from "./demoControl";
import { decorateDemoRepository } from "./demoPricingDecorator";
import { demoNow } from "./prices";
import { mockCatalogRepository } from "../../catalog/adapters/mockCatalogRepository";
import { mockPricingAudit } from "../../price-audit/mocks/pricingChanges";

export function createDemoPricingRuntime(
  downloader: ReportDownloader,
): PricingRuntime {
  const clock = { now: () => demoNow };
  const control = new DemoControl();
  const Panel = import.meta.env.DEV
    ? lazy(() =>
        import("./PricingDemoPanel").then((module) => ({
          default: module.PricingDemoPanel,
        })),
      )
    : undefined;
  return {
    service: decorateDemoRepository(
      createMockPricingRepository(clock, mockPricingAudit.record),
      control,
    ),
    clock,
    downloader,
    updates: {
      subscribe(listener) {
        const unsubscribeControl = control.subscribe(listener);
        const unsubscribeCatalog = mockCatalogRepository.subscribe(listener);
        return () => { unsubscribeControl(); unsubscribeCatalog(); };
      },
      version: operation => control.version(operation) +
        (operation === "listTargets" ? mockCatalogRepository.revision() : 0),
    },
    notice: {
      title: "Datos de demostración",
      description:
        "Datos y respuestas ficticios; cambios en memoria que se reinician al recargar. Las ediciones confirmadas generan asientos simulados en Historial de precios. Catálogo y Combos usan datos separados: sus altas y precios no se sincronizan con esta selección. La selección de archivos no analiza ni valida sus bytes. Reloj de exposición: 17 de octubre de 2026, 07:00 (America/Bogota).",
    },
    ReviewTools: Panel ? () => createElement(Panel, { control }) : undefined,
  };
}
