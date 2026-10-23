import { G7Session, secureBase } from "../adapters/g7Session";
import { createHttpPromotionServices } from "../adapters/httpPromotionServices";

export function createPromotionSessionRuntime(
  gatewayOrigin: string,
  securityApiBase: string,
) {
  const gateway = secureBase(gatewayOrigin, true);
  const session = new G7Session(securityApiBase);
  return {
    session,
    services: createHttpPromotionServices({
      gatewayOrigin: gateway,
      getAccessToken: session.getAccessToken,
      refreshAccessToken: session.refreshAccessToken,
      invalidateAccessToken: session.invalidateAccessToken,
    }),
  };
}
