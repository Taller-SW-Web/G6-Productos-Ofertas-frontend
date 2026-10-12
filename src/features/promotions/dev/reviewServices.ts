import {
  promotionServices,
  type PromotionServices,
} from "../services/promotionServices";
import { createDemoServices } from "./demoServices";
import {
  checkAdministrationRead,
  type AdministrationScenario,
} from "./demoScenarios";
const cache = new Map<string, PromotionServices>();
export async function reviewCreationAccess(
  scenario: AdministrationScenario,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (import.meta.env.DEV)
    await checkAdministrationRead(
      scenario === "session" || scenario === "forbidden" ? scenario : "default",
      signal,
    );
}
export function reviewServices(
  scenario: AdministrationScenario | "usage-unavailable",
): PromotionServices {
  if (!import.meta.env.DEV || scenario === "default") return promotionServices;
  let services = cache.get(scenario);
  if (!services) {
    services = createDemoServices(promotionServices, scenario);
    cache.set(scenario, services);
  }
  return services;
}
