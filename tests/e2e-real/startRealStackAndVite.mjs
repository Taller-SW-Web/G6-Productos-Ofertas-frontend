import { execFile, spawn } from "node:child_process";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

/**
 * Inventario ordenado de scripts SQL aplicados por microservicio.
 * Ningún error de esquema o migración se oculta; cualquier fallo aborta el arranque.
 */
export const SQL_INVENTORY_BY_SERVICE = {
  taxonomy: [
    "apps/api-gateway/test/fixtures/phase1-taxonomy-0001.sql",
    "apps/taxonomy-svc/migrations/0002_deactivation_source_version.sql",
    "apps/taxonomy-svc/migrations/0003_deactivation_timeout_setting.sql",
    "apps/taxonomy-svc/migrations/0004_product_type_pending_version.sql",
    "apps/taxonomy-svc/migrations/0005_configurable_list_values.sql",
    "apps/taxonomy-svc/migrations-candidate/h5/0001_outbox_delivery.sql",
  ],
  catalog: [
    "apps/catalog-svc/test/fixtures/0001_create_catalog.sql",
    "apps/catalog-svc/migrations/0002_create_sku_barcodes.sql",
    "apps/catalog-svc/migrations/0003_product_publication_history.sql",
    "apps/catalog-svc/migrations/0004_historical_preparation_requests.sql",
    "apps/catalog-svc/migrations/0005_catalog_function_search_path.sql",
    "apps/catalog-svc/migrations-candidate/h5/0001_outbox_delivery.sql",
    "apps/catalog-svc/migrations-candidate/h5/0002_taxonomy_reply_transport.sql",
    "apps/catalog-svc/migrations-candidate/h5/0003_bulk_retry_receipts.sql",
  ],
  pricing: [
    "apps/pricing-svc/test/fixtures/pricing.sql",
    "apps/pricing-svc/migrations/0002_schedule_effective_events.sql",
    "apps/pricing-svc/migrations/0003_initialization_operation_index.sql",
    "apps/pricing-svc/migrations/0004_price_import_idempotency.sql",
    "apps/pricing-svc/migrations-candidate/h5/0001_outbox_delivery.sql",
    "apps/pricing-svc/migrations/0003_service_bus_h5_routes_r2.sql",
  ],
  price_audit: [
    "apps/price-audit-svc/test/fixtures/price-audit.sql",
    "apps/price-audit-svc/migrations/0002_typed_price_change.sql",
  ],
  promotions: [
    "apps/promotions-svc/migrations-candidate/h5/0001_coupon_http_operations.sql",
    "apps/promotions-svc/migrations-candidate/h5/0002_coupon_http_runtime_role.sql",
  ],
  combos: ["apps/combos-svc/migrations/0002_create_combo_creation_receipts.sql"],
  inventory: [
    "apps/catalog-svc/test/fixtures/inventory-initial.sql",
    "apps/catalog-svc/test/fixtures/inventory-operations.sql",
    "apps/inventory-svc/migrations/20261104_0001_lifecycle_offline_reconciliation.sql",
    "apps/inventory-svc/migrations-candidate/h5/0001_outbox_delivery.sql",
  ],
  bulk: [
    "apps/bulk-svc/test/fixtures/0001_create_bulk_persistence.sql",
    "apps/bulk-svc/migrations/0002_export_source_snapshot.sql",
    "apps/bulk-svc/migrations/0003_export_claim_lease.sql",
    "apps/bulk-svc/migrations/0004_catalog_claim_check_content.sql",
    "apps/bulk-svc/migrations/0005_actor_ownership.sql",
    "apps/bulk-svc/migrations/0006_owner_correlation_identity.sql",
    "apps/bulk-svc/migrations/0007_bulk_retry_v1.sql",
    "apps/bulk-svc/migrations/0008_h5_outbox_delivery.sql",
  ],
};

function runPsql(containerName, database, sqlContent, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
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
        database,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let stderr = "";
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      rejectPromise(
        new Error(`PSQL_SPAWN_FAILED (${label}): ${err.message}`),
      );
    });
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(
          new Error(
            `PSQL_FAILED (${label}, exit=${code}): ${stderr || stdout}`,
          ),
        );
        return;
      }
      resolvePromise(stdout);
    });

    child.stdin.write(sqlContent, "utf8");
    child.stdin.end();
  });
}

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

async function startDisposablePostgresWithTls(backendRoot) {
  const containerName = `g6-e2e-stack-${randomUUID()}`;
  const password = randomUUID();
  const certDir = mkdtempSync(join(tmpdir(), "g6-e2e-pg-tls-"));
  const caCertPath = join(certDir, "server.crt");

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

  try {
    const { stdout } = await exec("docker", ["port", containerName, "5432/tcp"]);
    const port = /^127\.0\.0\.1:(\d+)\s*$/.exec(stdout)?.[1];
    if (!port) throw new Error("Puerto de PostgreSQL descartable inválido.");

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
        if (i === 59) throw new Error("PostgreSQL descartable no estuvo listo.");
        await delay(250);
      }
    }

    // Generar certificado TLS autofirmado con SAN IP:127.0.0.1 para verify-full real
    await exec("docker", [
      "exec",
      containerName,
      "sh",
      "-c",
      'apk add --no-cache openssl >/dev/null && openssl req -x509 -newkey rsa:2048 -nodes -keyout /var/lib/postgresql/server.key -out /var/lib/postgresql/server.crt -days 1 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" && chown postgres:postgres /var/lib/postgresql/server.key /var/lib/postgresql/server.crt && chmod 600 /var/lib/postgresql/server.key',
    ]);
    await exec("docker", [
      "cp",
      `${containerName}:/var/lib/postgresql/server.crt`,
      caCertPath,
    ]);
    await runPsql(
      containerName,
      "g6_e2e_test",
      "ALTER SYSTEM SET ssl = 'on'; ALTER SYSTEM SET ssl_cert_file = '/var/lib/postgresql/server.crt'; ALTER SYSTEM SET ssl_key_file = '/var/lib/postgresql/server.key'; SELECT pg_reload_conf();",
      "enable-postgres-tls",
    );

    const roleAndSchemaSql = `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catalog_app') THEN
          CREATE ROLE catalog_app LOGIN PASSWORD '${password}';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'po_pricing_owner') THEN
          CREATE ROLE po_pricing_owner NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pricing_app') THEN
          CREATE ROLE pricing_app LOGIN PASSWORD '${password}';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'combos_app') THEN
          CREATE ROLE combos_app LOGIN PASSWORD '${password}';
        END IF;
      END $$;
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
      CREATE SCHEMA IF NOT EXISTS catalog AUTHORIZATION catalog_app;
      CREATE SCHEMA IF NOT EXISTS taxonomy;
      CREATE SCHEMA IF NOT EXISTS pricing AUTHORIZATION po_pricing_owner;
      CREATE SCHEMA IF NOT EXISTS price_audit;
      CREATE SCHEMA IF NOT EXISTS promotions;
      CREATE SCHEMA IF NOT EXISTS combos AUTHORIZATION combos_app;
      CREATE SCHEMA IF NOT EXISTS inventory;
      CREATE SCHEMA IF NOT EXISTS bulk;
      GRANT USAGE ON SCHEMA extensions TO po_pricing_owner, catalog_app, combos_app;
    `;
    await runPsql(containerName, "g6_e2e_test", roleAndSchemaSql, "roles-and-schemas");

    for (const [service, files] of Object.entries(SQL_INVENTORY_BY_SERVICE)) {
      for (const rel of files) {
        const fullPath = resolve(backendRoot, rel);
        if (!existsSync(fullPath)) {
          throw new Error(`SQL_MISSING (${service}): ${fullPath}`);
        }
        const sql = readFileSync(fullPath, "utf8");
        const wrapped =
          service === "pricing"
            ? `BEGIN; SET LOCAL ROLE po_pricing_owner;\n${sql}\nCOMMIT;`
            : sql;
        await runPsql(containerName, "g6_e2e_test", wrapped, `${service}:${rel}`);
      }
    }

    await runPsql(
      containerName,
      "g6_e2e_test",
      "SELECT 1 FROM information_schema.tables WHERE table_schema IN ('catalog','taxonomy','pricing','price_audit','promotions','combos','inventory','bulk') LIMIT 1;",
      "verify-schemas-non-empty",
    );

    return {
      containerName,
      port: Number(port),
      password,
      caCertPath,
      databaseUrl: `postgresql://postgres:${password}@127.0.0.1:${port}/g6_e2e_test`,
      stop: async () => {
        rmSync(certDir, { recursive: true, force: true });
        await exec("docker", ["rm", "--force", "--volumes", containerName], {
          timeout: 15_000,
        }).catch(() => undefined);
      },
    };
  } catch (err) {
    rmSync(certDir, { recursive: true, force: true });
    await exec("docker", ["rm", "--force", "--volumes", containerName], {
      timeout: 15_000,
    }).catch(() => undefined);
    throw err;
  }
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

  let baseUrl = "";
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
    if (req.method === "GET" && url === "/.well-known/openid-configuration") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          issuer,
          jwks_uri: `${baseUrl}/jwks`,
          token_endpoint: `${baseUrl}/auth/service-token`,
        }),
      );
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
  baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    issuer,
    baseUrl,
    jwksUrl: `${baseUrl}/jwks`,
    discoveryUrl: `${baseUrl}/.well-known/openid-configuration`,
    tokenUrl: `${baseUrl}/auth/service-token`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

async function main() {
  const port = Number(process.env.PLAYWRIGHT_REAL_PORT ?? 4173);
  const viteOrigin = `http://127.0.0.1:${port}`;
  const backendRoot = resolve(
    process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
  );

  let pg;
  let g7;
  const children = [];

  const cleanup = async (vite) => {
    vite?.kill("SIGTERM");
    for (const child of children) child.kill("SIGTERM");
    await g7?.close();
    await pg?.stop();
    rmSync(MANIFEST_PATH, { force: true });
  };

  try {
    pg = await startDisposablePostgresWithTls(backendRoot);
    g7 = await startSingleLocalG7Server();

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
      SECURITY_ISSUER: g7.issuer,
      SECURITY_DISCOVERY_URL: g7.discoveryUrl,
      SECURITY_JWKS_URL: g7.jwksUrl,
      PGHOST: "127.0.0.1",
      PGPORT: String(pg.port),
      PGDATABASE: "g6_e2e_test",
      PGPASSWORD: pg.password,
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: pg.caCertPath,
      DATABASE_URL: pg.databaseUrl,
    };

    const serviceUrls = {};
    const servicePorts = {};
    for (const svc of SERVICE_NAMES) {
      const p = await reserveLocalPort();
      servicePorts[svc] = p;
      serviceUrls[svc] = `http://127.0.0.1:${p}`;
    }

    const perServiceEnv = {
      "catalog-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["catalog-svc"]),
        PGUSER: "catalog_app",
        G6_DATABASE_SCHEMA: "catalog",
        G6_EXPECTED_ROLE: "catalog_app",
        G6_CONNECTION_MODE: "direct",
      },
      "taxonomy-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["taxonomy-svc"]),
      },
      "pricing-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["pricing-svc"]),
        PRICING_SERVICE_TOKEN_URL: g7.tokenUrl,
        PRICING_SERVICE_CLIENT_SECRET: "e2e-pricing-secret",
        PRICING_CATALOG_URL: serviceUrls["catalog-svc"],
      },
      "price-audit-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["price-audit-svc"]),
      },
      "promotions-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["promotions-svc"]),
      },
      "combos-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["combos-svc"]),
        COMBOS_SVC_PORT: String(servicePorts["combos-svc"]),
        PGUSER: "combos_app",
        COMBOS_CATALOG_URL: serviceUrls["catalog-svc"],
        COMBOS_PRICING_URL: serviceUrls["pricing-svc"],
        COMBOS_G7_TOKEN_URL: g7.tokenUrl,
        COMBOS_G7_CLIENT_SECRET: "e2e-combos-secret",
      },
      "inventory-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["inventory-svc"]),
      },
      "bulk-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["bulk-svc"]),
      },
    };

    for (const svc of SERVICE_NAMES) {
      children.push(
        spawn(process.execPath, [`dist/apps/${svc}/src/main.js`], {
          cwd: backendRoot,
          env: perServiceEnv[svc],
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
          GATEWAY_CORS_ALLOWED_ORIGINS: viteOrigin,
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

    // Nunca escribir contraseña de PostgreSQL en el manifiesto
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(
        {
          gatewayUrl,
          g7ApiBase: g7.baseUrl,
          g7Issuer: g7.issuer,
          g7JwksUrl: g7.jwksUrl,
          viteOrigin,
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

    process.on("SIGINT", () => void cleanup(vite).then(() => process.exit(0)));
    process.on("SIGTERM", () => void cleanup(vite).then(() => process.exit(0)));
    vite.on("exit", (code) => {
      void cleanup(vite).then(() => process.exit(code ?? 0));
    });
  } catch (err) {
    await cleanup();
    throw err;
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
