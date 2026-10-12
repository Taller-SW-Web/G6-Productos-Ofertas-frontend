import { PricingFailure } from "../services/pricingModels";
import type { PricingRepository } from "../services/pricingRepository";

// Deliberately fail closed. No endpoint, credentials or fallback are invented.
export function createUnavailableApiPricingRepository(): PricingRepository {
  async function unavailable(): Promise<never> {
    throw new PricingFailure(
      "configuration",
      "El adapter API de Pricing no está configurado. No se utilizarán datos simulados como sustitución.",
    );
  }
  return {
    listTargets: unavailable,
    read: unavailable,
    readEditable: unavailable,
    update: unavailable,
    listSchedules: unavailable,
    schedule: unavailable,
    readHistorical: unavailable,
    prevalidate: unavailable,
    readBatch: unavailable,
    report: unavailable,
  };
}
