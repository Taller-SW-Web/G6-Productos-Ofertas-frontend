import { G7Session } from "../../features/promotions/adapters/g7Session";
import { browserSessionPersistence } from "../../features/promotions/adapters/sessionPersistence";

export function createOptionalAuthSession(base?: string, notice?: "expired" | "logout"): G7Session | null {
  if (!base) return null;
  try { return new G7Session(base, Date.now, notice, typeof window === "undefined" ? undefined : browserSessionPersistence(base)); }
  catch { return null; }
}
