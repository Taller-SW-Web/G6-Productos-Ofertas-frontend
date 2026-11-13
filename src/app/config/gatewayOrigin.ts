import { secureBase } from "../../features/promotions/adapters/g7Session";

const azureGateway = "https://api-gateway.calmgrass-aec0b33c.chilecentral.azurecontainerapps.io";

export function supportsAdministrativeContracts(
  enabled: boolean,
  gateway: string | undefined,
  location: Pick<Location, "hostname" | "origin">,
): boolean {
  return enabled && Boolean(gateway) && gateway !== azureGateway &&
    !(location.hostname.endsWith(".vercel.app") && gateway === location.origin);
}

// Vercel proxies this fixed backend through /api/v1; local development keeps
// its explicitly configured origin. No credentials or alternate backend fallback.
export function resolveGatewayOrigin(
  configured: string | undefined,
  location: Pick<Location, "hostname" | "origin">,
  production: boolean,
): string | undefined {
  if (!configured) return undefined;
  let origin: string;
  try { origin = secureBase(configured, true); }
  catch { return undefined; }
  return production && location.hostname.endsWith(".vercel.app") && origin === azureGateway
    ? location.origin
    : origin;
}

export function resolveG7ApiBase(
  configured: string | undefined,
  location: Pick<Location, "hostname" | "origin">,
  production: boolean,
): string | undefined {
  if (!configured) return undefined;
  let base: string;
  try { base = secureBase(configured); }
  catch { return undefined; }
  return production && location.hostname.endsWith(".vercel.app") && base === "https://g7-auth-service.onrender.com/api/v1"
    ? location.origin + "/g7/api/v1"
    : base;
}
