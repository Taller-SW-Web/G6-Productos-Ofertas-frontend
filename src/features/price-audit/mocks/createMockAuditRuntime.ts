import { lazy } from "react";
import { createMockAuditRepository } from "../adapters/mockAuditRepository";
import type { AuditRuntime } from "../services/auditRepository";
import type { ReportDownloader } from "../../pricing/services/pricingRuntime";
import { mockPricingAudit } from "./pricingChanges";

export async function createMockAuditRuntime(
  downloader: ReportDownloader,
): Promise<AuditRuntime> {
  const repository = createMockAuditRepository(mockPricingAudit.read);
  return {
    repository: import.meta.env?.DEV
      ? (await import("./reviewRepository")).createReviewRepository(repository)
      : repository,
    downloader,
    notice:
      "Asientos y trabajos de demostración. Las ediciones confirmadas en Precios generan asientos simulados durante esta sesión; se reinician al recargar. Actor ficticio: demo-pricing; no hay auditoría real. Programaciones e importaciones se demuestran por separado. Las descargas son archivos de muestra preparados: no los genera un backend ni representan necesariamente la consulta.",
    ReviewTools: import.meta.env?.DEV
      ? lazy(() =>
          import("./AuditReviewTools").then((module) => ({
            default: module.AuditReviewTools,
          })),
        )
      : undefined,
  };
}
