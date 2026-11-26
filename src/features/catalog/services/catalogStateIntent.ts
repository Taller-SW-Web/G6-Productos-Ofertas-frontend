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
  priorVersion: number | null;
  operationId?: string;
  correlationId?: string;
  phase: "dispatching" | "uncertain" | "acknowledged";
  updatedAt: number;
}

const intentPrefix = "g6:catalog:state-intent:v2:";

function key(intent: Pick<CatalogStateIntent, "entity" | "userId" | "sessionExpiresAt" | "sessionVersion" | "sessionRoles" | "productId" | "variantId">) {
  return [intentPrefix.slice(0, -1), intent.entity, encodeURIComponent(intent.userId), intent.sessionExpiresAt ?? "unknown", intent.sessionVersion, encodeURIComponent([...intent.sessionRoles].sort().join(",")), intent.productId, intent.variantId ?? "product"].join(":");
}

export function readCatalogStateIntent(
  identity: { userId: string; sessionVersion: number; sessionRoles: readonly string[] },
  entity: CatalogStateIntent["entity"],
  productId: string,
  variantId?: string,
): CatalogStateIntent | null {
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const storageKey = localStorage.key(index);
      if (!storageKey?.startsWith(intentPrefix)) continue;
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (!value || typeof value !== "object") continue;
      const intent = value as CatalogStateIntent;
      if (
        intent.schemaVersion !== 2 ||
        intent.userId !== identity.userId ||
        !Array.isArray(intent.sessionRoles) ||
        JSON.stringify([...intent.sessionRoles].sort()) !== JSON.stringify([...identity.sessionRoles].sort()) ||
        intent.entity !== entity ||
        intent.productId !== productId ||
        intent.variantId !== variantId ||
        (intent.phase !== "dispatching" && intent.phase !== "uncertain" && intent.phase !== "acknowledged")
      ) continue;

      // Token refresh changes expiry but preserves the active G7 session
      // generation. Every phase remains scoped to the same user, generation,
      // roles and entity.
      if (intent.sessionVersion === identity.sessionVersion) return intent;
    }
    return null;
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
    for (let index = 0; index < localStorage.length; index++) {
      const storageKey = localStorage.key(index);
      if (!storageKey?.startsWith("g6:catalog:state-intent:v2:")) continue;
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
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
    localStorage.setItem(key(intent), JSON.stringify(intent));
    return true;
  } catch {
    return false;
  }
}

export function clearCatalogStateIntent(intent: CatalogStateIntent): void {
  try { localStorage.removeItem(key(intent)); } catch { /* fail closed: marker remains */ }
}

export class CatalogStateLockUnavailable extends Error {
  constructor(message = "No se pudo garantizar exclusión entre pestañas; no se envió la mutación.") {
    super(message);
    this.name = "CatalogStateLockUnavailable";
  }
}

export async function withCatalogEntityLock<T>(
  entity: CatalogStateIntent["entity"],
  productId: string,
  variantId: string | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks)
    throw new CatalogStateLockUnavailable();

  let callbackStarted = false;
  try {
    const outcome = await navigator.locks.request(
      ["g6:catalog:state", entity, encodeURIComponent(productId), encodeURIComponent(variantId ?? "product")].join(":"),
      { mode: "exclusive", ifAvailable: true },
      async lock => {
        if (!lock) return { acquired: false as const };
        callbackStarted = true;
        return { acquired: true as const, value: await operation() };
      },
    );
    if (!outcome.acquired) throw new CatalogStateLockUnavailable("Ya hay una operación de Catálogo en curso para esta entidad; no se envió otra mutación.");
    return outcome.value;
  } catch (error) {
    if (error instanceof CatalogStateLockUnavailable) throw error;
    if (!callbackStarted) throw new CatalogStateLockUnavailable();
    throw error;
  }
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
