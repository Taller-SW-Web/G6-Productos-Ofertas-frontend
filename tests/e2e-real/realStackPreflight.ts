import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";

export const REAL_STACK_MANIFEST_PATH = resolve(
  process.cwd(),
  "tests/e2e-real/.runtime-stack.json",
);

export interface RealStackEnvironment {
  gatewayUrl: string;
  g7ApiBase: string;
  databaseUrl: string;
  g7Issuer: string;
  g7JwksUrl: string;
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
    ? (JSON.parse(readFileSync(REAL_STACK_MANIFEST_PATH, "utf8")) as Partial<RealStackEnvironment>)
    : {};

  const dataMode = process.env.VITE_DATA_MODE ?? "api";
  if (dataMode !== "api") {
    throw new Error(
      `PREFLIGHT_BLOCKED: VITE_DATA_MODE debe ser 'api' (recibido: ${dataMode}).`,
    );
  }
  const adminEnabled = process.env.VITE_G6_ADMIN_API_ENABLED ?? (manifest.adminApiEnabled ? "true" : "");
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
  const dbRaw = process.env.G6_REAL_PG_URL ?? manifest.databaseUrl;
  const g7Issuer = process.env.G6_REAL_G7_ISSUER ?? manifest.g7Issuer;
  const g7JwksUrl = process.env.G6_REAL_G7_JWKS_URL ?? manifest.g7JwksUrl;

  if (!gatewayRaw || !g7ApiBaseRaw || !dbRaw || !g7Issuer || !g7JwksUrl) {
    throw new Error(
      "PREFLIGHT_BLOCKED: Faltan variables obligatorias del stack real (G6_REAL_GATEWAY_URL, VITE_G7_API_BASE, G6_REAL_PG_URL, G6_REAL_G7_ISSUER, G6_REAL_G7_JWKS_URL). No existe fallback a mock.",
    );
  }

  assertSafeLocalUrl(gatewayRaw, "G6_REAL_GATEWAY_URL");
  assertSafeLocalUrl(g7ApiBaseRaw, "VITE_G7_API_BASE");
  assertSafeLocalUrl(dbRaw, "G6_REAL_PG_URL");
  assertSafeLocalUrl(g7JwksUrl, "G6_REAL_G7_JWKS_URL");

  return {
    gatewayUrl: gatewayRaw.replace(/\/$/, ""),
    g7ApiBase: g7ApiBaseRaw.replace(/\/$/, ""),
    databaseUrl: dbRaw,
    g7Issuer,
    g7JwksUrl,
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

export interface LocalG7Server {
  issuer: string;
  baseUrl: string;
  jwksUrl: string;
  jwks: { keys: Array<Record<string, unknown>> };
  issueAccessToken: (claims?: Record<string, unknown>) => string;
  close: () => Promise<void>;
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export async function startLocalG7Server(
  issuer = "https://g7-local.test/auth",
): Promise<LocalG7Server> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk: Record<string, unknown> = {
    ...publicKey.export({ format: "jwk" }),
    kid: "g6-real-e2e-rs256",
    alg: "RS256",
    use: "sig",
  };

  const gestorId = randomUUID();
  const noRoleId = randomUUID();
  const gestorScopes =
    "catalogo:leer catalogo:escribir taxonomia:leer taxonomia:escribir precios:leer precios:escribir auditoria-precios:leer auditoria-precios:exportar promociones:leer promociones:escribir cupones:leer cupones:escribir combos:leer combos:escribir inventario:leer inventario:escribir carga-masiva:leer carga-masiva:escribir";

  function issueAccessToken(claims: Record<string, unknown> = {}): string {
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", kid: jwk.kid, typ: "JWT" }),
    ).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        iss: issuer,
        sub: gestorId,
        tipo: "acceso",
        aud: ["api-productos"],
        roles: ["GESTOR_COMERCIAL"],
        scope: gestorScopes,
        iat: now,
        exp: now + 600,
        jti: randomUUID(),
        ...claims,
      }),
    ).toString("base64url");
    const sig = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey)
      .toString("base64url");
    return `${header}.${payload}.${sig}`;
  }

  const server: Server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "GET" && url === "/jwks") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }

    if (req.method === "POST" && url === "/auth/login") {
      const body = await readJsonBody(req);
      const correo = typeof body.correo === "string" ? body.correo : "";
      const contrasena = typeof body.contrasena === "string" ? body.contrasena : "";
      if (!correo || !contrasena || body.formatoAcceso !== "JWS") {
        res.statusCode = 401;
        res.setHeader("content-type", "application/problem+json");
        res.end(JSON.stringify({ code: "CREDENCIALES_INVALIDAS" }));
        return;
      }
      const isNoRole = correo.startsWith("sinrol");
      const userId = isNoRole ? noRoleId : gestorId;
      const roles = isNoRole ? [] : ["GESTOR_COMERCIAL"];
      const scope = isNoRole ? "" : gestorScopes;
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          tokenType: "Bearer",
          accessToken: issueAccessToken({ sub: userId, roles, scope }),
          refreshToken: `refresh-${randomUUID()}`,
          expiresIn: 600,
          usuario: {
            id: userId,
            nombreCompleto: isNoRole ? "Usuario Sin Rol" : "Gestor Comercial E2E",
            correo,
            roles,
          },
        }),
      );
      return;
    }

    if (req.method === "POST" && url === "/auth/refresh") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          tokenType: "Bearer",
          accessToken: issueAccessToken(),
          refreshToken: `refresh-${randomUUID()}`,
          expiresIn: 600,
          usuario: {
            id: gestorId,
            nombreCompleto: "Gestor Comercial E2E",
            correo: "gestor@example.test",
            roles: ["GESTOR_COMERCIAL"],
          },
        }),
      );
      return;
    }

    if (req.method === "POST" && url === "/auth/logout") {
      res.statusCode = 204;
      res.end();
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("No se pudo iniciar servidor local G7/JWKS.");
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    issuer,
    baseUrl,
    jwksUrl: `${baseUrl}/jwks`,
    jwks: { keys: [jwk] },
    issueAccessToken,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface LoginPageLike {
  getByRole: (
    role: "textbox" | "button" | "heading",
    options: { name: string; exact?: boolean },
  ) => {
    fill: (value: string) => Promise<void>;
    click: () => Promise<void>;
    waitFor: (options?: { state?: "visible" | "hidden" }) => Promise<void>;
  };
}

export async function loginViaReactUi(
  page: LoginPageLike,
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
