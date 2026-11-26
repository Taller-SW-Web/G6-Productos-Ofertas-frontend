import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const REAL_STACK_MANIFEST_PATH = resolve(
  process.cwd(),
  "tests/e2e-real/.runtime-stack.json",
);

export interface RealStackEnvironment {
  gatewayUrl: string;
  g7ApiBase: string;
  g7Issuer: string;
  g7JwksUrl: string;
  viteOrigin: string;
  dataMode: "api";
  adminApiEnabled: true;
}

const FORBIDDEN_HOST_PATTERNS = [
  /slzglmtiyrzygpkiuthf/i,
  /azurewebsites\.net/i,
  /azurecontainerapps\.io/i,
  /vercel\.app/i,
  /marketplace/i,
];

export function assertSafeLocalUrl(raw: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`PREFLIGHT_BLOCKED: ${label} no es una URL válida (${raw}).`);
  }
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(raw)) {
      throw new Error(
        `PREFLIGHT_BLOCKED: ${label} apunta a un recurso prohibido (${raw}). Solo se permite entorno local/descartable.`,
      );
    }
  }
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(
      `PREFLIGHT_BLOCKED: ${label} debe usar 127.0.0.1 o localhost (recibido: ${parsed.hostname}).`,
    );
  }
  return parsed;
}

export function assertRealStackPreflight(): RealStackEnvironment {
  const manifest = existsSync(REAL_STACK_MANIFEST_PATH)
    ? (JSON.parse(
        readFileSync(REAL_STACK_MANIFEST_PATH, "utf8"),
      ) as Partial<RealStackEnvironment>)
    : {};

  const dataMode = process.env.VITE_DATA_MODE ?? manifest.dataMode ?? "api";
  if (dataMode !== "api") {
    throw new Error(
      `PREFLIGHT_BLOCKED: VITE_DATA_MODE debe ser 'api' (recibido: ${dataMode}).`,
    );
  }
  const adminEnabled =
    process.env.VITE_G6_ADMIN_API_ENABLED ??
    (manifest.adminApiEnabled ? "true" : "");
  if (adminEnabled !== "true") {
    throw new Error(
      "PREFLIGHT_BLOCKED: VITE_G6_ADMIN_API_ENABLED debe ser 'true' en la suite E2E real.",
    );
  }

  const gatewayRaw =
    process.env.G6_REAL_GATEWAY_URL ??
    process.env.VITE_GATEWAY_ORIGIN ??
    manifest.gatewayUrl;
  const g7ApiBaseRaw = process.env.VITE_G7_API_BASE ?? manifest.g7ApiBase;
  const g7Issuer = process.env.G6_REAL_G7_ISSUER ?? manifest.g7Issuer;
  const g7JwksUrl = process.env.G6_REAL_G7_JWKS_URL ?? manifest.g7JwksUrl;
  const viteOrigin = manifest.viteOrigin ?? "http://127.0.0.1:4173";

  if (!gatewayRaw || !g7ApiBaseRaw || !g7Issuer || !g7JwksUrl) {
    throw new Error(
      "PREFLIGHT_BLOCKED: Faltan variables obligatorias del stack real. Ejecuta mediante playwright.real.config.ts.",
    );
  }

  assertSafeLocalUrl(gatewayRaw, "G6_REAL_GATEWAY_URL");
  assertSafeLocalUrl(g7ApiBaseRaw, "VITE_G7_API_BASE");
  assertSafeLocalUrl(g7JwksUrl, "G6_REAL_G7_JWKS_URL");

  return {
    gatewayUrl: gatewayRaw.replace(/\/$/, ""),
    g7ApiBase: g7ApiBaseRaw.replace(/\/$/, ""),
    g7Issuer,
    g7JwksUrl,
    viteOrigin,
    dataMode: "api",
    adminApiEnabled: true,
  };
}

export async function verifyGatewayAndServicesReady(
  gatewayUrl: string,
): Promise<void> {
  const res = await fetch(`${gatewayUrl}/health/ready`);
  if (!res.ok) {
    throw new Error(
      `PREFLIGHT_BLOCKED: Gateway local no está listo en ${gatewayUrl}/health/ready (HTTP ${res.status}).`,
    );
  }
}

export async function issueTokenFromTrustedG7(
  g7ApiBase: string,
  correo: string,
  contrasena = "isolated-g7-password",
): Promise<string> {
  const res = await fetch(`${g7ApiBase}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ correo, contrasena, formatoAcceso: "JWS" }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo emitir token G7 de prueba (HTTP ${res.status}).`);
  }
  const dto = (await res.json()) as { accessToken?: string };
  if (!dto.accessToken) {
    throw new Error("El emisor G7 local no devolvió accessToken.");
  }
  return dto.accessToken;
}

export async function issueTechnicalServiceToken(
  g7ApiBase: string,
  clientId: string,
  scope: string,
): Promise<string> {
  const res = await fetch(`${g7ApiBase}/auth/service-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope }),
  });
  if (!res.ok) {
    throw new Error(
      `No se pudo emitir token técnico G7 para ${clientId} (HTTP ${res.status}).`,
    );
  }
  const dto = (await res.json()) as { access_token?: string };
  if (!dto.access_token) {
    throw new Error("El emisor G7 local no devolvió access_token.");
  }
  return dto.access_token;
}

export interface SpaPageLike {
  getByRole: (
    role: "textbox" | "button" | "heading",
    options: { name: string; exact?: boolean },
  ) => {
    fill: (value: string) => Promise<void>;
    click: () => Promise<void>;
    waitFor: (options?: { state?: "visible" | "hidden" }) => Promise<void>;
  };
  locator: (selector: string) => {
    first: () => {
      click: () => Promise<void>;
      waitFor: (options?: { state?: "visible" | "hidden" }) => Promise<void>;
    };
  };
  reload: () => Promise<unknown>;
}

export async function loginViaReactUi(
  page: SpaPageLike,
  correo = "gestor@example.test",
  contrasena = "isolated-g7-password",
): Promise<void> {
  await page.getByRole("heading", { name: "Iniciar sesión", exact: true }).waitFor({
    state: "visible",
  });
  await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).fill(correo);
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(contrasena);
  await page.getByRole("button", { name: "Ingresar al panel", exact: true }).click();
}

export async function navigateViaSpa(
  page: SpaPageLike,
  href: string,
): Promise<void> {
  const navLink = page.locator(`nav a[href="${href}"]`).first();
  await navLink.waitFor({ state: "visible" });
  await navLink.click();
}

export async function navigateViaSubLink(
  page: SpaPageLike,
  href: string,
): Promise<void> {
  const subLink = page.locator(`main a[href="${href}"], a[href="${href}"]`).first();
  await subLink.waitFor({ state: "visible" });
  await subLink.click();
}

export async function reloadVerifySessionLostAndReauth(
  page: SpaPageLike,
  correo = "gestor@example.test",
): Promise<void> {
  await page.reload();
  await page.getByRole("heading", { name: "Iniciar sesión", exact: true }).waitFor({
    state: "visible",
  });
  await loginViaReactUi(page, correo, "isolated-g7-password");
}
