import { G7Session, secureBase } from "../adapters/g7Session";
import { createHttpPromotionServices } from "../adapters/httpPromotionServices";

// Configuration failure belongs to this integration. The commercial gate
// handles a null provider without preventing independent modules from mounting.
export function createOptionalPromotionSessionRuntime(
  gatewayOrigin: string,
  securityApiBase: string,
  session?: G7Session,
) {
  try {
    return createPromotionSessionRuntime(gatewayOrigin, securityApiBase, session);
  } catch {
    return null;
  }
}

export function createPromotionSessionRuntime(
  gatewayOrigin: string,
  securityApiBase: string,
  session = new G7Session(securityApiBase),
) {
  const gateway = secureBase(gatewayOrigin, true);
  return {
    session,
    services: createHttpPromotionServices({
      gatewayOrigin: gateway,
      getAccessToken: session.getAccessToken,
      refreshAccessToken: session.refreshAccessToken,
      invalidateAccessToken: session.invalidateAccessToken,
      scopeId: () => session.snapshot().user?.id ?? null,
      sessionEvents: { version: session.getSessionVersion, subscribe: session.subscribe },
    }),
  };
}
