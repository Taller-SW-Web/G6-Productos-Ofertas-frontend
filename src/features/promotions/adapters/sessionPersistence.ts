/** Temporary, tab-scoped refresh persistence. Never stores access JWTs or roles. */
export interface SessionPersistence {
  read(): { refreshToken: string; userId: string } | null;
  save(refreshToken: string, userId: string): void;
  clear(): void;
  consume(refreshToken: string): Promise<void>;
}

export function browserSessionPersistence(base: string): SessionPersistence {
  const key = `g6:session:v1:${base}`;
  return {
    read() {
      try {
        const raw: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
        if (!raw || typeof raw !== "object" || !("refreshToken" in raw) || !("userId" in raw) ||
          typeof raw.refreshToken !== "string" || !raw.refreshToken || raw.refreshToken.length > 16384 ||
          typeof raw.userId !== "string") return null;
        return { refreshToken: raw.refreshToken, userId: raw.userId };
      } catch { return null; }
    },
    save(refreshToken, userId) {
      try { sessionStorage.setItem(key, JSON.stringify({ refreshToken, userId })); }
      catch { /* Storage denial leaves the authenticated session in memory. */ }
    },
    clear() { try { sessionStorage.removeItem(key); } catch { /* Unavailable storage. */ } },
    async consume(refreshToken) {
      // sessionStorage may be copied when a tab is duplicated. Serialize claims
      // across tabs and retain only a non-reversible, non-credential marker.
      if (!navigator.locks) throw new Error("No se puede restaurar la sesión de forma segura.");
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(refreshToken));
      const marker = `g6:refresh-used:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
      await navigator.locks.request(marker, () => {
        if (localStorage.getItem(marker)) throw new Error("El refresco ya fue utilizado.");
        localStorage.setItem(marker, "1");
      });
    },
  };
}
