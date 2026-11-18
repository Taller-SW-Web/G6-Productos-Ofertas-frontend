import { protectedCouponRead } from "./release-login-policy.mjs";

// Private, disposable evidence. Never expose DTOs, headers, credentials or tokens
// in return values/errors/artifacts. This checks protocol linkage, not signatures.
export class ReleaseSessionEvidence {
  #credentials;
  #session;
  #challenge;
  #otpSent = false;
  #mfaCompleted = false;
  #read = false;
  #readDone;
  #readResult = new Promise(resolve => { this.#readDone = resolve; });
  #logout = false;
  #logoutDone;
  #logoutResult = new Promise(resolve => { this.#logoutDone = resolve; });
  promotionIds = new Set();

  constructor(credentials) { this.#credentials = credentials; }
  #fail() { throw new Error("RELEASE_SESSION_NOT_CONFIRMED"); }
  #body(request) {
    try { return JSON.parse(request.postData() ?? "null"); } catch { return this.#fail(); }
  }
  async #json(response) {
    try {
      const data = await response.body();
      if (data.length > 65536) return this.#fail();
      return JSON.parse(data.toString());
    } catch { return this.#fail(); }
  }
  before(policy, request) {
    const url = new URL(request.url());
    if (url.origin === policy.gateway && url.pathname.startsWith("/api/v1/") && request.method() === "GET") {
      if (!this.#session || request.headers().authorization !== `Bearer ${this.#session.accessToken}`) this.#fail();
      return { kind: "read", coupon: url.pathname === "/api/v1/cupones", protectedQuery: url.pathname + url.search === protectedCouponRead };
    }
    if (request.method() !== "POST" || !request.url().startsWith(policy.g7Base + "/auth/")) return {};
    const action = request.url().slice((policy.g7Base + "/auth/").length);
    const body = this.#body(request);
    if (action === "login") {
      if (this.#session || body?.correo !== this.#credentials.email || body?.contrasena !== this.#credentials.password) this.#fail();
    } else if (action === "otp/solicitar") {
      if (!this.#challenge || body?.challengeToken !== this.#challenge || body?.canal !== "EMAIL") this.#fail();
    } else if (action === "otp/verificar") {
      if (!this.#otpSent || !this.#challenge || body?.challengeToken !== this.#challenge || typeof body?.codigo !== "string" || !/^\d{6}$/.test(body.codigo)) this.#fail();
    } else if (["refresh", "logout"].includes(action)) {
      if (this.#logout || !this.#session || body?.refreshToken !== this.#session.refreshToken) this.#fail();
      if (action === "logout") this.#logout = true;
    } else this.#fail();
    return { kind: action };
  }
  #accept(dto, rotating = false) {
    if (!dto || dto.tokenType !== "Bearer" || typeof dto.accessToken !== "string" || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(dto.accessToken) ||
        typeof dto.refreshToken !== "string" || !dto.refreshToken || !Number.isFinite(dto.expiresIn) || dto.expiresIn <= 0 ||
        typeof dto.usuario?.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dto.usuario.id) || typeof dto.usuario?.nombreCompleto !== "string" || !dto.usuario.nombreCompleto.trim() ||
        typeof dto.usuario?.correo !== "string" || dto.usuario.correo.toLowerCase() !== this.#credentials.email.toLowerCase() || !Array.isArray(dto.usuario.roles) || !dto.usuario.roles.includes("GESTOR_COMERCIAL")) this.#fail();
    if (rotating && (dto.refreshToken === this.#session.refreshToken || dto.usuario.id !== this.#session.usuario.id)) this.#fail();
    this.#session = dto;
  }
  async after(stamp, response) {
    const status = response.status();
    if (stamp.kind === "login" && status === 200) {
      const dto = await this.#json(response);
      if (dto?.mfaRequerido === true) {
        if (typeof dto.challengeToken !== "string" || !dto.challengeToken || !(dto.expiraEn > 0)) this.#fail();
        this.#challenge = dto.challengeToken;
      } else this.#accept(dto);
    } else if (stamp.kind === "otp/solicitar" && status === 202) this.#otpSent = true;
    else if (stamp.kind === "otp/verificar" && status === 200) {
      this.#accept(await this.#json(response)); this.#mfaCompleted = true; this.#challenge = undefined;
    } else if (stamp.kind === "refresh") {
      if (status === 200) this.#accept(await this.#json(response), true);
      else this.#session = undefined;
    }
    else if (stamp.kind === "read" && stamp.coupon && status === 200) {
      const dto = await this.#json(response);
      for (const item of Array.isArray(dto?.items) ? dto.items : []) {
        if (typeof item?.promocionId === "string") this.promotionIds.add(encodeURIComponent(item.promocionId));
      }
      if (stamp.protectedQuery) {
        this.#read = true;
        this.#readDone();
      }
    } else if (stamp.kind === "logout") {
      this.#session = undefined;
      this.#logoutDone(status === 204);
    }
  }
  failed(stamp) { if (stamp?.kind === "logout") { this.#session = undefined; this.#logoutDone(false); return true; } return false; }
  confirmRead() { if (!this.#session || !this.#read) this.#fail(); }
  async waitForRead() {
    let timer;
    try {
      await Promise.race([this.#readResult, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("RELEASE_READ_NOT_CONFIRMED")), 15000); })]);
      this.confirmRead();
    } finally { clearTimeout(timer); }
  }
  confirmMfa() { if (!this.#mfaCompleted) this.#fail(); }
  async confirmLogout() {
    if (!this.#logout) throw new Error("RELEASE_LOGOUT_NOT_CONFIRMED");
    let timer;
    try {
      const ok = await Promise.race([this.#logoutResult, new Promise(resolve => { timer = setTimeout(() => resolve(false), 15000); })]);
      if (!ok) throw new Error("RELEASE_LOGOUT_NOT_CONFIRMED");
    } finally { clearTimeout(timer); }
  }
  dispose() { this.#credentials = undefined; this.#session = undefined; this.#challenge = undefined; this.promotionIds.clear(); }
}
