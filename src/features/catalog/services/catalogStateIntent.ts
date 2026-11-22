import type { ProductStatus, VariantStatus } from "./catalogRepository";

export type CatalogStateAction = "activate" | "deactivate" | "reactivate";
export interface CatalogStateIntent {
  schemaVersion: 2;
  entity: "product" | "variant";
  userId: string;
  sessionExpiresAt: number | null;
  sessionVersion: number;
  sessionRoles: readonly string[];
  productId: string;
  variantId?: string;
  action: CatalogStateAction;
  priorStatus: ProductStatus | VariantStatus;
  expectedStatus: ProductStatus | VariantStatus;
  priorVersion: number;
  operationId?: string;
  correlationId?: string;
  phase: "dispatching" | "uncertain" | "acknowledged";
  updatedAt: number;
}

function key(intent: Pick<CatalogStateIntent, "entity" | "userId" | "sessionExpiresAt" | "sessionVersion" | "sessionRoles" | "productId" | "variantId">) {
  return ["g6:catalog:state-intent:v2", intent.entity, encodeURIComponent(intent.userId), intent.sessionExpiresAt ?? "unknown", intent.sessionVersion, encodeURIComponent([...intent.sessionRoles].sort().join(",")), intent.productId, intent.variantId ?? "product"].join(":");
}

export function readCatalogStateIntent(
  identity: { userId: string; sessionExpiresAt: number | null; sessionVersion: number; sessionRoles: readonly string[] },
  entity: CatalogStateIntent["entity"],
  productId: string,
  variantId?: string,
): CatalogStateIntent | null {
  try {
    const storageKey = key({ ...identity, entity, productId, variantId });
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (!value || typeof value !== "object") return null;
    const intent = value as CatalogStateIntent;
    return intent.schemaVersion === 2 && intent.userId === identity.userId &&
      intent.sessionExpiresAt === identity.sessionExpiresAt && JSON.stringify([...intent.sessionRoles].sort()) === JSON.stringify([...identity.sessionRoles].sort()) && intent.entity === entity &&
      intent.sessionVersion === identity.sessionVersion &&
      intent.productId === productId && intent.variantId === variantId ? intent : null;
  } catch {
    return null;
  }
}

/**
 * An intent from another login in this tab still blocks a second write for
 * the same entity. It cannot be reconciled because reconciliation uses the
 * full identity/session tuple through readCatalogStateIntent.
 */
export function hasCatalogStateIntent(entity: CatalogStateIntent["entity"], productId: string, variantId?: string): boolean {
  try {
    for (let index = 0; index < sessionStorage.length; index++) {
      const storageKey = sessionStorage.key(index);
      if (!storageKey?.startsWith("g6:catalog:state-intent:v2:")) continue;
      const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (!value || typeof value !== "object") continue;
      const intent = value as Partial<CatalogStateIntent>;
      if (intent.schemaVersion === 2 && intent.entity === entity && intent.productId === productId && intent.variantId === variantId &&
          typeof intent.userId === "string" && typeof intent.sessionVersion === "number" &&
          (intent.phase === "dispatching" || intent.phase === "uncertain" || intent.phase === "acknowledged")) return true;
    }
  } catch {
    // Fail closed: storage errors must not enable an unsafe retry.
    return true;
  }
  return false;
}

export function saveCatalogStateIntent(intent: CatalogStateIntent): boolean {
  try {
    sessionStorage.setItem(key(intent), JSON.stringify(intent));
    return true;
  } catch {
    return false;
  }
}

export function clearCatalogStateIntent(intent: CatalogStateIntent): void {
  try { sessionStorage.removeItem(key(intent)); } catch { /* fail closed: marker remains */ }
}

export function nextCatalogStatus(action: CatalogStateAction): "ACTIVO" | "INACTIVO" {
  return action === "deactivate" ? "INACTIVO" : "ACTIVO";
}

export function isProductStatus(value: unknown): value is ProductStatus {
  return value === "BORRADOR" || value === "ACTIVO" || value === "INACTIVO";
}

export function isVariantStatus(value: unknown): value is VariantStatus {
  return value === "BORRADOR" || value === "ACTIVA" || value === "INACTIVA";
}
