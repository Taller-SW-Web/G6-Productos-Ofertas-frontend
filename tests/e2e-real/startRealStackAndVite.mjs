import { execFile, spawn } from "node:child_process";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const POSTGRES_IMAGE =
  "postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea";
const SERVICE_NAMES = [
  "catalog-svc",
  "taxonomy-svc",
  "pricing-svc",
  "price-audit-svc",
  "promotions-svc",
  "combos-svc",
  "inventory-svc",
  "bulk-svc",
];
const MANIFEST_PATH = resolve(
  process.cwd(),
  "tests/e2e-real/.runtime-stack.json",
);

async function reserveLocalPort() {
  return new Promise((resolvePort, reject) => {
    const srv = createNetServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("Puerto local inválido.")));
        return;
      }
      const { port } = addr;
      srv.close(() => resolvePort(port));
    });
  });
}

async function waitForHttpReady(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await delay(250);
  }
  throw new Error(`PREFLIGHT_BLOCKED: Servicio no respondió listo en ${url}`);
}

async function startDisposablePostgres(backendRoot) {
  const containerName = `g6-e2e-stack-${randomUUID()}`;
  const password = randomUUID();
  await exec(
    "docker",
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--publish",
      "127.0.0.1::5432",
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      "--env",
      "POSTGRES_DB=g6_e2e_test",
      POSTGRES_IMAGE,
    ],
    { timeout: 60_000 },
  );

  const { stdout } = await exec("docker", ["port", containerName, "5432/tcp"]);
  const port = /^127\.0\.0\.1:(\d+)\s*$/.exec(stdout)?.[1];
  if (!port) {
    await exec("docker", ["rm", "--force", "--volumes", containerName]).catch(
      () => undefined,
    );
    throw new Error("Puerto de PostgreSQL descartable inválido.");
  }

  for (let i = 0; i < 60; i += 1) {
    try {
      await exec(
        "docker",
        [
          "exec",
          containerName,
          "pg_isready",
          "-U",
          "postgres",
          "-d",
          "g6_e2e_test",
        ],
        { timeout: 5_000 },
      );
      break;
    } catch {
      if (i === 59) {
        await exec("docker", ["rm", "--force", "--volumes", containerName]).catch(
          () => undefined,
        );
        throw new Error("PostgreSQL descartable no estuvo listo a tiempo.");
      }
      await delay(250);
    }
  }

  const schemasSql = `
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
    CREATE SCHEMA IF NOT EXISTS catalog;
    CREATE SCHEMA IF NOT EXISTS taxonomy;
    CREATE SCHEMA IF NOT EXISTS pricing;
    CREATE SCHEMA IF NOT EXISTS price_audit;
    CREATE SCHEMA IF NOT EXISTS promotions;
    CREATE SCHEMA IF NOT EXISTS combos;
    CREATE SCHEMA IF NOT EXISTS inventory;
    CREATE SCHEMA IF NOT EXISTS bulk;
  `;
  await exec(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "g6_e2e_test",
    ],
    { input: schemasSql },
  ).catch(() => undefined);

  const sqlCandidates = [
    resolve(backendRoot, "apps/bulk-svc/test/fixtures/0001_create_bulk_persistence.sql"),
    resolve(backendRoot, "apps/bulk-svc/migrations/0008_h5_outbox_delivery.sql"),
  ];
  for (const file of sqlCandidates) {
    if (existsSync(file)) {
      const content = readFileSync(file, "utf8");
      await exec(
        "docker",
        [
          "exec",
          "-i",
          containerName,
          "psql",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "postgres",
          "-d",
          "g6_e2e_test",
        ],
        { input: content },
      ).catch(() => undefined);
    }
  }

  return {
    containerName,
    databaseUrl: `postgresql://postgres:${password}@127.0.0.1:${port}/g6_e2e_test`,
    stop: async () => {
      await exec("docker", ["rm", "--force", "--volumes", containerName], {
        timeout: 15_000,
      }).catch(() => undefined);
    },
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function startSingleLocalG7Server(issuer = "https://g7-local.test/auth") {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "g6-real-e2e-rs256",
    alg: "RS256",
    use: "sig",
  };
  const gestorId = randomUUID();
  const noRoleId = randomUUID();
  const gestorScopes =
    "catalogo:leer catalogo:escribir taxonomia:leer taxonomia:escribir precios:leer precios:escribir auditoria-precios:leer auditoria-precios:exportar promociones:leer promociones:escribir cupones:leer cupones:escribir combos:leer combos:escribir inventario:leer inventario:escribir carga-masiva:leer carga-masiva:escribir";

  function issueAccessToken(claims = {}) {
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
    const sig = sign(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      privateKey,
    ).toString("base64url");
    return `${header}.${payload}.${sig}`;
  }

  const server = createServer(async (req, res) => {
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
      const contrasena =
        typeof body.contrasena === "string" ? body.contrasena : "";
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
            nombreCompleto: isNoRole
              ? "Usuario Sin Rol"
              : "Gestor Comercial E2E",
            correo,
            roles,
          },
        }),
      );
      return;
    }
    if (req.method === "POST" && url === "/auth/service-token") {
      const body = await readJsonBody(req);
      const clientId =
        typeof body.client_id === "string" ? body.client_id : "modulo-ventas";
      const scope =
        typeof body.scope === "string"
          ? body.scope
          : "cupones:consumir cupones:restaurar cupones:operaciones:leer stock:reservar";
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          token_type: "Bearer",
          access_token: issueAccessToken({
            sub: clientId,
            tipo: "servicio",
            roles: [],
            scope,
          }),
          expires_in: 600,
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
    close: () => new Promise((r) => server.close(() => r())),
  };
}

async function main() {
  const port = Number(process.env.PLAYWRIGHT_REAL_PORT ?? 4173);
  const backendRoot = resolve(
    process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
  );

  const pg = await startDisposablePostgres(backendRoot);
  const g7 = await startSingleLocalG7Server();
  const children = [];

  const controlledBaseEnv = {
    PATH: process.env.PATH ?? "",
    SYSTEMROOT: process.env.SYSTEMROOT ?? "",
    TEMP: process.env.TEMP ?? "",
    TMP: process.env.TMP ?? "",
    NODE_ENV: "test",
    G6_SECURITY_MODE: "G7_AUTHENTICATED",
    GATEWAY_G5_H5_ENABLED: "true",
    AUTH_ISSUER: g7.issuer,
    AUTH_JWKS_URL: g7.jwksUrl,
    DATABASE_URL: pg.databaseUrl,
    CATALOG_DATABASE_URL: pg.databaseUrl,
    TAXONOMY_DATABASE_URL: pg.databaseUrl,
    PRICING_DATABASE_URL: pg.databaseUrl,
    PRICE_AUDIT_DATABASE_URL: pg.databaseUrl,
    PROMOTIONS_DATABASE_URL: pg.databaseUrl,
    COMBOS_DATABASE_URL: pg.databaseUrl,
    INVENTORY_DATABASE_URL: pg.databaseUrl,
    BULK_DATABASE_URL: pg.databaseUrl,
  };

  try {
    const serviceUrls = {};
    const servicePorts = {};
    for (const svc of SERVICE_NAMES) {
      const p = await reserveLocalPort();
      servicePorts[svc] = p;
      serviceUrls[svc] = `http://127.0.0.1:${p}`;
      children.push(
        spawn(process.execPath, [`dist/apps/${svc}/src/main.js`], {
          cwd: backendRoot,
          env: { ...controlledBaseEnv, PORT: String(p) },
          stdio: "pipe",
        }),
      );
    }

    const gatewayPort = await reserveLocalPort();
    const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
    children.push(
      spawn(process.execPath, ["dist/apps/api-gateway/src/main.js"], {
        cwd: backendRoot,
        env: {
          ...controlledBaseEnv,
          PORT: String(gatewayPort),
          GATEWAY_CATALOG_SVC_URL: serviceUrls["catalog-svc"],
          GATEWAY_TAXONOMY_SVC_URL: serviceUrls["taxonomy-svc"],
          GATEWAY_PRICING_SVC_URL: serviceUrls["pricing-svc"],
          GATEWAY_PRICE_AUDIT_SVC_URL: serviceUrls["price-audit-svc"],
          GATEWAY_PROMOTIONS_SVC_URL: serviceUrls["promotions-svc"],
          GATEWAY_COMBOS_SVC_URL: serviceUrls["combos-svc"],
          GATEWAY_INVENTORY_SVC_URL: serviceUrls["inventory-svc"],
          GATEWAY_BULK_SVC_URL: serviceUrls["bulk-svc"],
          GATEWAY_CATALOG_SVC_READINESS_PATH: "/health/ready",
          GATEWAY_TAXONOMY_SVC_READINESS_PATH: "/health/ready",
          GATEWAY_PRICING_SVC_READINESS_PATH: "/health/ready",
          GATEWAY_PRICE_AUDIT_SVC_READINESS_PATH: "/health/ready",
          GATEWAY_PROMOTIONS_SVC_READINESS_PATH: "/health/ready",
          GATEWAY_COMBOS_SVC_READINESS_PATH: "/health/ready",
          GATEWAY_INVENTORY_SVC_READINESS_PATH: "/health/ready",
          GATEWAY_BULK_SVC_READINESS_PATH: "/health/ready",
        },
        stdio: "pipe",
      }),
    );

    for (const svc of SERVICE_NAMES) {
      await waitForHttpReady(`${serviceUrls[svc]}/health/ready`);
    }
    await waitForHttpReady(`${gatewayUrl}/health/ready`);

    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(
        {
          gatewayUrl,
          g7ApiBase: g7.baseUrl,
          databaseUrl: pg.databaseUrl,
          g7Issuer: g7.issuer,
          g7JwksUrl: g7.jwksUrl,
          dataMode: "api",
          adminApiEnabled: true,
        },
        null,
        2,
      ),
    );

    const vite = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "dev", "--", "--port", String(port), "--strictPort"],
      {
        stdio: "inherit",
        env: {
          ...controlledBaseEnv,
          PLAYWRIGHT_REAL_PORT: String(port),
          VITE_DATA_MODE: "api",
          VITE_G6_ADMIN_API_ENABLED: "true",
          VITE_GATEWAY_ORIGIN: gatewayUrl,
          VITE_G7_API_BASE: g7.baseUrl,
        },
      },
    );

    const cleanup = async () => {
      vite.kill("SIGTERM");
      for (const child of children) child.kill("SIGTERM");
      await g7.close();
      await pg.stop();
      rmSync(MANIFEST_PATH, { force: true });
    };

    process.on("SIGINT", () => void cleanup().then(() => process.exit(0)));
    process.on("SIGTERM", () => void cleanup().then(() => process.exit(0)));
    vite.on("exit", (code) => {
      void cleanup().then(() => process.exit(code ?? 0));
    });
  } catch (err) {
    for (const child of children) child.kill("SIGTERM");
    await g7.close();
    await pg.stop();
    rmSync(MANIFEST_PATH, { force: true });
    throw err;
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
