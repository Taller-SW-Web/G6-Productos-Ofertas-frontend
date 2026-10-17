import { lazy } from "react";
import { createMockAuditRepository } from "../adapters/mockAuditRepository";
import type { AuditRuntime } from "../services/auditRepository";
import type { ReportDownloader } from "../../pricing/services/pricingRuntime";

export async function createMockAuditRuntime(
  downloader: ReportDownloader,
): Promise<AuditRuntime> {
  const repository = createMockAuditRepository();
  return {
    repository: import.meta.env?.DEV
      ? (await import("./reviewRepository")).createReviewRepository(repository)
      : repository,
    downloader,
    notice:
      "Asientos y trabajos de demostración. Las descargas son archivos de muestra preparados: no los genera un backend ni representan necesariamente la consulta. Los cambios locales de Pricing no producen eventos reales de auditoría.",
    ReviewTools: import.meta.env?.DEV
      ? lazy(() =>
          import("./AuditReviewTools").then((module) => ({
            default: module.AuditReviewTools,
          })),
        )
      : undefined,
  };
}
