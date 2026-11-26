import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const REAL_STACK_MANIFEST_PATH = resolve(
  process.cwd(),
  "tests/e2e-real/.runtime-stack.json",
);

export interface RealStackEnvironment {
  gatewayUrl: string;
  catalogServiceUrl: string;
  serviceUrls: Record<string, string>;
  isolatedBusUrl: string;
  g7ApiBase: string;
  g7Issuer: string;
  g7JwksUrl: string;
  g5EvidenceOrigin: string;
  g5SeedOrigin: string;
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
  const catalogServiceUrlRaw =
    process.env.G6_REAL_CATALOG_URL ?? manifest.catalogServiceUrl ?? "";
  const g7ApiBaseRaw = process.env.VITE_G7_API_BASE ?? manifest.g7ApiBase;
  const g7Issuer = process.env.G6_REAL_G7_ISSUER ?? manifest.g7Issuer;
  const g7JwksUrl = process.env.G6_REAL_G7_JWKS_URL ?? manifest.g7JwksUrl;
  const g5EvidenceOrigin =
    process.env.G6_REAL_G5_EVIDENCE_ORIGIN ?? manifest.g5EvidenceOrigin ?? "";
  const g5SeedOrigin =
    process.env.G6_REAL_G5_SEED_ORIGIN ?? manifest.g5SeedOrigin ?? "";
  const viteOrigin = manifest.viteOrigin ?? "http://127.0.0.1:4173";

  if (!gatewayRaw || !g7ApiBaseRaw || !g7Issuer || !g7JwksUrl) {
    throw new Error(
      "PREFLIGHT_BLOCKED: Faltan variables obligatorias del stack real. Ejecuta mediante playwright.real.config.ts.",
    );
  }

  assertSafeLocalUrl(gatewayRaw, "G6_REAL_GATEWAY_URL");
  if (catalogServiceUrlRaw) {
    assertSafeLocalUrl(catalogServiceUrlRaw, "G6_REAL_CATALOG_URL");
  }
  assertSafeLocalUrl(g7ApiBaseRaw, "VITE_G7_API_BASE");
  assertSafeLocalUrl(g7JwksUrl, "G6_REAL_G7_JWKS_URL");
  if (g5SeedOrigin) {
    assertSafeLocalUrl(g5SeedOrigin, "G6_REAL_G5_SEED_ORIGIN");
  }

  return {
    gatewayUrl: gatewayRaw.replace(/\/$/, ""),
    catalogServiceUrl: catalogServiceUrlRaw.replace(/\/$/, ""),
    serviceUrls: manifest.serviceUrls ?? {},
    isolatedBusUrl: manifest.isolatedBusUrl ?? "",
    g7ApiBase: g7ApiBaseRaw.replace(/\/$/, ""),
    g7Issuer,
    g7JwksUrl,
    g5EvidenceOrigin,
    g5SeedOrigin,
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

const LAB_CLIENT_SECRETS: Record<string, string> = {
  "modulo-ventas": "e2e-ventas-secret",
  "modulo-productos": "e2e-catalog-secret",
  "modulo-marketplace": "e2e-marketplace-secret",
  "modulo-chatbot": "e2e-chatbot-secret",
  "promotions-svc": "e2e-promotions-secret",
};

export async function issueTechnicalServiceToken(
  g7ApiBase: string,
  clientId: string,
  scope: string,
  clientSecret?: string,
): Promise<string> {
  const secret = clientSecret ?? LAB_CLIENT_SECRETS[clientId];
  if (!secret) {
    throw new Error(`Cliente técnico de laboratorio no registrado: ${clientId}`);
  }
  const res = await fetch(`${g7ApiBase}/api/v1/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: secret,
      scope,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `No se pudo emitir token técnico G7 para ${clientId} (HTTP ${res.status}).`,
    );
  }
  const dto = (await res.json()) as { accessToken?: string };
  if (!dto.accessToken) {
    throw new Error("El emisor G7 local no devolvió accessToken.");
  }
  return dto.accessToken;
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
