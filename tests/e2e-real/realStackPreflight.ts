import { generateKeyPairSync, randomUUID, sign } from "node:crypto";

export interface RealStackEnvironment {
  gatewayUrl: string;
  databaseUrl: string;
  g7Issuer: string;
  g7JwksUrl: string;
  dataMode: "api";
}

const FORBIDDEN_HOST_PATTERNS = [
  /slzglmtiyrzygpkiuthf/i,
  /azurewebsites\.net/i,
  /azurecontainerapps\.io/i,
  /vercel\.app/i,
  /marketplace/i,
];

function assertSafeLocalUrl(raw: string, label: string): URL {
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
  const dataMode = process.env.VITE_DATA_MODE ?? "api";
  if (dataMode !== "api") {
    throw new Error(
      `PREFLIGHT_BLOCKED: VITE_DATA_MODE debe ser 'api' (recibido: ${dataMode}).`,
    );
  }

  const gatewayRaw = process.env.G6_REAL_GATEWAY_URL;
  const dbRaw = process.env.G6_REAL_PG_URL;
  const g7Issuer = process.env.G6_REAL_G7_ISSUER;
  const g7JwksUrl = process.env.G6_REAL_G7_JWKS_URL;

  if (!gatewayRaw || !dbRaw || !g7Issuer || !g7JwksUrl) {
    throw new Error(
      "PREFLIGHT_BLOCKED: Faltan variables obligatorias del stack real (G6_REAL_GATEWAY_URL, G6_REAL_PG_URL, G6_REAL_G7_ISSUER, G6_REAL_G7_JWKS_URL). No existe fallback a mock.",
    );
  }

  assertSafeLocalUrl(gatewayRaw, "G6_REAL_GATEWAY_URL");
  assertSafeLocalUrl(dbRaw, "G6_REAL_PG_URL");
  assertSafeLocalUrl(g7JwksUrl, "G6_REAL_G7_JWKS_URL");

  return {
    gatewayUrl: gatewayRaw.replace(/\/$/, ""),
    databaseUrl: dbRaw,
    g7Issuer,
    g7JwksUrl,
    dataMode: "api",
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

export function createLocalG7TokenFactory(issuer: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "g6-real-e2e-rs256",
    alg: "RS256",
    use: "sig",
  };

  function issue(claims: Record<string, unknown>): string {
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", kid: jwk.kid, typ: "JWT" }),
    ).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        iss: issuer,
        aud: ["api-productos"],
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

  return {
    jwks: { keys: [jwk] },
    issueHumanGestor: (sub = `gestor-${randomUUID().slice(0, 8)}`) =>
      issue({
        sub,
        tipo: "humano",
        roles: ["GESTOR_COMERCIAL"],
        scope:
          "catalogo:leer catalogo:escribir taxonomia:leer taxonomia:escribir precios:leer precios:escribir auditoria-precios:leer auditoria-precios:exportar promociones:leer promociones:escribir cupones:leer cupones:escribir combos:leer combos:escribir inventario:leer inventario:escribir carga-masiva:leer carga-masiva:escribir",
      }),
    issueHumanNoRole: (sub = `sin-rol-${randomUUID().slice(0, 8)}`) =>
      issue({
        sub,
        tipo: "humano",
        roles: [],
        scope: "",
      }),
  };
}

export async function injectBrowserSession(
  page: { addInitScript: (fn: (arg: { token: string }) => void, arg: { token: string }) => Promise<unknown> },
  token: string,
): Promise<void> {
  await page.addInitScript(
    ({ token: jwt }) => {
      window.sessionStorage.setItem("g6.auth.access_token", jwt);
    },
    { token },
  );
}
