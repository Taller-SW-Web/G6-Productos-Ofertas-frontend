import { afterEach, describe, expect, it, vi } from "vitest";
import { G7Session } from "../promotions/adapters/g7Session";
import type { SessionPersistence } from "../promotions/adapters/sessionPersistence";

const user = { id: "11111111-1111-4111-8111-111111111111", nombreCompleto: "Prueba", correo: "test@example.test", roles: ["GESTOR_COMERCIAL"] };
const dto = (version: number) => ({ usuario: user, accessToken: `header.payload.signature${version}`, refreshToken: `refresh-${version}`, tokenType: "Bearer", expiresIn: 900 });
function storage() {
  let saved: ReturnType<SessionPersistence["read"]> = null;
  const used = new Set<string>();
  return {
    read: () => saved,
    save: (refreshToken: string, userId: string) => { saved = { refreshToken, userId }; },
    clear: () => { saved = null; },
    consume: vi.fn(async (token: string) => {
      if (used.has(token)) throw new Error("used");
      used.add(token);
    }),
  } satisfies SessionPersistence;
}
afterEach(() => vi.restoreAllMocks());
describe("restauración verificada por G7", () => {
  it("persiste solo refresco/identidad esperada y restaura roles desde G7 con una única rotación", async () => {
    const persistence = storage();
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async input => Response.json(dto(String(input).endsWith("/login") ? 1 : 2)));
    const session = new G7Session("https://g7.example.test", Date.now, undefined, persistence);
    await session.login("test@example.test", "not-a-real-password");
    expect(persistence.read()).toEqual({ refreshToken: "refresh-1", userId: user.id });
    const reloaded = new G7Session("https://g7.example.test", Date.now, undefined, persistence);
    const first = reloaded.restore();
    const second = reloaded.restore();
    expect(reloaded.snapshot().user).toBeNull();
    await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(reloaded.snapshot().restoration).toBe("authenticated");
    expect(reloaded.snapshot().user).toEqual(user);
    expect(persistence.read()?.refreshToken).toBe("refresh-2");
  });
  it.each(["401", "timeout", "same-refresh", "different-user"])("falla cerrada y elimina el refresco ante %s", async failure => {
    const persistence = storage();
    persistence.save("refresh-1", user.id);
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      expect(persistence.read()).toBeNull();
      if (failure === "timeout") throw new DOMException("Timeout", "TimeoutError");
      if (failure === "401") return Response.json({ code: "REFRESCO_INVALIDO" }, { status: 401 });
      return Response.json({ ...dto(failure === "same-refresh" ? 1 : 2), usuario: failure === "different-user" ? { ...user, id: "22222222-2222-4222-8222-222222222222" } : user });
    });
    const session = new G7Session("https://g7.example.test", Date.now, undefined, persistence);
    await session.restore();
    await session.restore();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(session.snapshot().user).toBeNull();
    expect(persistence.read()).toBeNull();
  });
  it("logout durante restauración impide aceptar una respuesta tardía", async () => {
    const persistence = storage();
    persistence.save("refresh-1", user.id);
    let release: (response: Response) => void = () => undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(resolve => { release = resolve; }));
    const session = new G7Session("https://g7.example.test", Date.now, undefined, persistence);
    const restore = session.restore();
    await vi.waitFor(() => expect(persistence.consume).toHaveBeenCalled());
    await session.logout();
    release(Response.json(dto(2)));
    await restore;
    expect(session.snapshot().user).toBeNull();
    expect(persistence.read()).toBeNull();
  });
});
