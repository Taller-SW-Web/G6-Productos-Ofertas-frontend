import { CatalogError } from "./catalogRepository";

const prefix = "g6:catalog:create-intent:";
const maxIntentsPerUser = 64;
async function intentKey(userId: string, resource: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}\u0000${resource}`)));
  return `${prefix}${[...digest].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
async function userScopeHash(userId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId)));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function clear(key: string) { try { sessionStorage.removeItem(key); } catch { /* marker remains fail-closed */ } }

export async function runCatalogCreateIntent<T>(userId: string | undefined, resource: string, work: () => Promise<T>): Promise<T> {
  if (!userId) throw new CatalogError("session", "No se puede proteger la creación sin una identidad humana activa.");
  const key = await intentKey(userId, resource);
  const scopeHash = await userScopeHash(userId);
  try {
    if (sessionStorage.getItem(key)) throw new CatalogError("write_unknown", "Esta identidad ya se envió y requiere reconciliación antes de repetir la creación.");
    const keys = Object.keys(sessionStorage).filter(item => item.startsWith(prefix) && item !== key && (() => { try { return JSON.parse(sessionStorage.getItem(item) ?? "{}").scopeHash === scopeHash; } catch { return false; } })());
    if (keys.length >= maxIntentsPerUser) throw new CatalogError("write_unknown", "Hay demasiadas creaciones pendientes de reconciliación en esta sesión.");
    sessionStorage.setItem(key, JSON.stringify({ state: "dispatching", scopeHash, at: Date.now() }));
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw new CatalogError("write_unknown", "No se pudo proteger la intención en esta sesión; no se envió la creación.");
  }
  try {
    const result = await work();
    clear(key);
    return result;
  } catch (error) {
    if (error instanceof CatalogError && error.kind !== "write_unknown") clear(key);
    else { try { sessionStorage.setItem(key, JSON.stringify({ state: "unknown", scopeHash, at: Date.now() })); } catch { /* pre-dispatch marker remains */ } }
    throw error;
  }
}

export function hasCatalogCreateIntent(userId: string | undefined, resource: string): Promise<boolean> {
  if (!userId) return Promise.resolve(false);
  return intentKey(userId, resource).then(key => { try { return Boolean(sessionStorage.getItem(key)); } catch { return true; } });
}
