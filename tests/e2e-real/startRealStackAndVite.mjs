import { execFile, spawn } from "node:child_process";
import { createVerify, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
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
 * Inventario ordenado de scripts SQL oficiales por microservicio (base en ../docs/datos + migraciones en ../backend/apps).
 * Cada servicio ejecuta sus scripts bajo su rol owner (SET LOCAL ROLE po_<svc>_owner).
 */
export const SQL_INVENTORY_BY_SERVICE = {
  taxonomy: {
    ownerRole: "po_taxonomy_owner",
    files: [
      { root: "docs", path: "datos/taxonomy/migrations/0001_create_taxonomy.sql" },
      { root: "backend", path: "apps/taxonomy-svc/migrations/0002_deactivation_source_version.sql" },
      { root: "backend", path: "apps/taxonomy-svc/migrations/0003_deactivation_timeout_setting.sql" },
      { root: "backend", path: "apps/taxonomy-svc/migrations/0004_product_type_pending_version.sql" },
      { root: "backend", path: "apps/taxonomy-svc/migrations/0005_configurable_list_values.sql" },
      { root: "backend", path: "apps/taxonomy-svc/migrations-candidate/h5/0001_outbox_delivery.sql" },
    ],
  },
  catalog: {
    ownerRole: "po_catalog_owner",
    files: [
      { root: "docs", path: "datos/catalog-svc/migrations/0001_create_catalog.sql" },
      { root: "backend", path: "apps/catalog-svc/migrations/0002_create_sku_barcodes.sql" },
      { root: "backend", path: "apps/catalog-svc/migrations/0003_product_publication_history.sql" },
      { root: "backend", path: "apps/catalog-svc/migrations/0004_historical_preparation_requests.sql" },
      { root: "backend", path: "apps/catalog-svc/migrations/0005_catalog_function_search_path.sql" },
      { root: "backend", path: "apps/catalog-svc/migrations-candidate/h5/0001_outbox_delivery.sql" },
      { root: "backend", path: "apps/catalog-svc/migrations-candidate/h5/0002_taxonomy_reply_transport.sql" },
      { root: "backend", path: "apps/catalog-svc/migrations-candidate/h5/0003_bulk_retry_receipts.sql" },
    ],
  },
  pricing: {
    ownerRole: "po_pricing_owner",
    files: [
      { root: "docs", path: "datos/pricing/migrations/0001_create_pricing.sql" },
      { root: "backend", path: "apps/pricing-svc/migrations/0002_schedule_effective_events.sql" },
      { root: "backend", path: "apps/pricing-svc/migrations/0003_initialization_operation_index.sql" },
      { root: "backend", path: "apps/pricing-svc/migrations/0004_price_import_idempotency.sql" },
      { root: "backend", path: "apps/pricing-svc/migrations-candidate/h5/0001_outbox_delivery.sql" },
      { root: "backend", path: "apps/pricing-svc/migrations/0003_service_bus_h5_routes_r2.sql" },
    ],
  },
  price_audit: {
    ownerRole: "po_price_audit_owner",
    files: [
      { root: "docs", path: "datos/price_audit/migrations/0001_create_price_audit.sql" },
      { root: "backend", path: "apps/price-audit-svc/migrations/0002_typed_price_change.sql" },
    ],
  },
  promotions: {
    ownerRole: "po_promotions_owner",
    preSql:
      "ALTER DEFAULT PRIVILEGES IN SCHEMA promotions GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO po_promotions_runtime; SELECT set_config('g6.promotions_h5_runtime_role', 'po_promotions_runtime', true);",
    files: [
      { root: "docs", path: "datos/promotions/migrations/0001_promotions_persistence.sql" },
      { root: "docs", path: "datos/promotions/migrations/0002_promotions_global_price_projection.sql" },
      { root: "docs", path: "datos/promotions/migrations/0003_promotions_timestamps_and_delete_rules.sql" },
      { root: "docs", path: "datos/promotions/migrations/0004_coupon_idempotency_receipts.sql" },
      { root: "backend", path: "apps/promotions-svc/migrations-candidate/h5/0001_coupon_http_operations.sql" },
      { root: "backend", path: "apps/promotions-svc/migrations-candidate/h5/0002_coupon_http_runtime_role.sql" },
    ],
  },
  combos: {
    ownerRole: "po_combos_owner",
    files: [
      { root: "docs", path: "datos/combos/migrations/0001_create_combos_persistence.sql" },
      { root: "backend", path: "apps/combos-svc/migrations/0002_create_combo_creation_receipts.sql" },
    ],
  },
  inventory: {
    ownerRole: "po_inventory_owner",
    files: [
      { root: "docs", path: "datos/inventory-svc/migrations/0001_inventory_initial.sql" },
      { root: "docs", path: "datos/inventory-svc/migrations/0002_order_id_operaciones_disponibilidad.sql" },
      { root: "backend", path: "apps/inventory-svc/migrations/20261104_0001_lifecycle_offline_reconciliation.sql" },
      { root: "backend", path: "apps/inventory-svc/migrations-candidate/h5/0001_outbox_delivery.sql" },
    ],
  },
  bulk: {
    ownerRole: "po_bulk_owner",
    files: [
      { root: "docs", path: "datos/bulk/migrations/0001_create_bulk_persistence.sql" },
      { root: "backend", path: "apps/bulk-svc/migrations/0002_export_source_snapshot.sql" },
      { root: "backend", path: "apps/bulk-svc/migrations/0003_export_claim_lease.sql" },
      { root: "backend", path: "apps/bulk-svc/migrations/0004_catalog_claim_check_content.sql" },
      { root: "backend", path: "apps/bulk-svc/migrations/0005_actor_ownership.sql" },
      { root: "backend", path: "apps/bulk-svc/migrations/0006_owner_correlation_identity.sql" },
      { root: "backend", path: "apps/bulk-svc/migrations/0007_bulk_retry_v1.sql" },
      { root: "backend", path: "apps/bulk-svc/migrations/0008_h5_outbox_delivery.sql" },
    ],
  },
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

async function startDisposablePostgresWithTls(backendRoot, docsRoot) {
  const containerName = `g6-e2e-stack-${randomUUID()}`;
  const password = randomUUID();
  const certDir = mkdtempSync(join(tmpdir(), "g6-e2e-pg-tls-"));
  const caCertPath = join(certDir, "server.crt");

  // 1. Generar certificado TLS con SAN IP:127.0.0.1 antes de arrancar PostgreSQL
  await exec(
    "docker",
    [
      "run",
      "--rm",
      "--entrypoint",
      "sh",
      "-v",
      `${certDir}:/out`,
      POSTGRES_IMAGE,
      "-c",
      'apk add --no-cache openssl >/dev/null && openssl req -x509 -newkey rsa:2048 -nodes -keyout /out/server.key -out /out/server.crt -days 1 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" && chmod 644 /out/server.crt && chmod 600 /out/server.key && chown 70:70 /out/server.key /out/server.crt',
    ],
    { timeout: 60_000 },
  );

  // 2. Arrancar PostgreSQL directamente con TLS habilitado desde el inicio
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
      "-v",
      `${certDir}:/etc/pg-tls:ro`,
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      "--env",
      "POSTGRES_DB=g6_e2e_test",
      POSTGRES_IMAGE,
      "-c",
      "ssl=on",
      "-c",
      "ssl_cert_file=/etc/pg-tls/server.crt",
      "-c",
      "ssl_key_file=/etc/pg-tls/server.key",
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

    const sslStatus = await runPsql(
      containerName,
      "g6_e2e_test",
      "SHOW ssl;",
      "verify-ssl-on",
    );
    if (!/\bon\b/i.test(sslStatus)) {
      throw new Error(`POSTGRES_TLS_NOT_ENABLED: SHOW ssl devolvió ${sslStatus}`);
    }

    // 3. Provisionar roles owner (NOLOGIN) y roles runtime separados (sin membresía owner)
    const roleAndSchemaSql = `
      CREATE ROLE po_taxonomy_owner NOLOGIN;
      CREATE ROLE po_catalog_owner NOLOGIN;
      CREATE ROLE po_pricing_owner NOLOGIN;
      CREATE ROLE po_price_audit_owner NOLOGIN;
      CREATE ROLE po_promotions_owner NOLOGIN;
      CREATE ROLE po_promotions_runtime NOLOGIN;
      CREATE ROLE po_combos_owner NOLOGIN;
      CREATE ROLE po_inventory_owner NOLOGIN;
      CREATE ROLE po_bulk_owner NOLOGIN;

      CREATE ROLE taxonomy_app LOGIN PASSWORD '${password}';
      CREATE ROLE catalog_app LOGIN PASSWORD '${password}';
      CREATE ROLE pricing_app LOGIN PASSWORD '${password}';
      CREATE ROLE price_audit_app LOGIN PASSWORD '${password}';
      CREATE ROLE price_audit_archiver LOGIN PASSWORD '${password}';
      CREATE ROLE promotions_app LOGIN PASSWORD '${password}';
      GRANT po_promotions_runtime TO promotions_app;
      CREATE ROLE combos_app LOGIN PASSWORD '${password}';
      CREATE ROLE inventory_app LOGIN PASSWORD '${password}';
      CREATE ROLE bulk_app LOGIN PASSWORD '${password}';

      CREATE SCHEMA extensions;
      CREATE EXTENSION btree_gist WITH SCHEMA extensions;
      GRANT USAGE ON SCHEMA extensions TO po_taxonomy_owner, po_catalog_owner, po_pricing_owner, po_price_audit_owner, po_promotions_owner, po_combos_owner, po_inventory_owner, po_bulk_owner, taxonomy_app, catalog_app, pricing_app, price_audit_app, promotions_app, combos_app, inventory_app, bulk_app;

      CREATE SCHEMA taxonomy AUTHORIZATION po_taxonomy_owner;
      CREATE SCHEMA catalog AUTHORIZATION po_catalog_owner;
      CREATE SCHEMA pricing AUTHORIZATION po_pricing_owner;
      CREATE SCHEMA price_audit AUTHORIZATION po_price_audit_owner;
      CREATE SCHEMA promotions AUTHORIZATION po_promotions_owner;
      CREATE SCHEMA combos AUTHORIZATION po_combos_owner;
      CREATE SCHEMA inventory AUTHORIZATION po_inventory_owner;
      CREATE SCHEMA bulk AUTHORIZATION po_bulk_owner;

      GRANT USAGE ON SCHEMA promotions TO po_promotions_runtime, promotions_app;
      GRANT USAGE ON SCHEMA combos TO combos_app;
      GRANT USAGE ON SCHEMA inventory TO inventory_app;
      GRANT USAGE ON SCHEMA bulk TO bulk_app;
    `;
    await runPsql(containerName, "g6_e2e_test", roleAndSchemaSql, "roles-and-schemas");

    // 4. Ejecutar SQL oficial de cada servicio bajo su rol owner
    for (const [service, spec] of Object.entries(SQL_INVENTORY_BY_SERVICE)) {
      const statements = [
        "BEGIN;",
        `SET LOCAL ROLE ${spec.ownerRole};`,
        ...(spec.preSql ? [spec.preSql] : []),
      ];
      for (const entry of spec.files) {
        const base = entry.root === "docs" ? docsRoot : backendRoot;
        const fullPath = resolve(base, entry.path);
        if (!existsSync(fullPath)) {
          throw new Error(`SQL_MISSING (${service}): ${fullPath}`);
        }
        statements.push(readFileSync(fullPath, "utf8"));
      }
      statements.push("COMMIT;");
      await runPsql(
        containerName,
        "g6_e2e_test",
        statements.join("\n"),
        `migrate:${service}`,
      );
    }

    // 5. Privilegios mínimos runtime sobre tablas y secuencias para los esquemas que lo requieran
    const runtimeGrantsSql = `
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA combos TO combos_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA combos TO combos_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventory TO inventory_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA inventory TO inventory_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA bulk TO bulk_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA bulk TO bulk_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA promotions TO promotions_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA promotions TO promotions_app;

      INSERT INTO inventory.locations (id, code, name, type, active)
      VALUES ('00000000-0000-4000-8000-000000000101', 'CENTRAL', 'Almacén Central E2E', 'ALMACEN_CENTRAL', true)
      ON CONFLICT (code) DO NOTHING;
    `;
    await runPsql(containerName, "g6_e2e_test", runtimeGrantsSql, "runtime-grants");

    await runPsql(
      containerName,
      "g6_e2e_test",
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema IN ('catalog','taxonomy','pricing','price_audit','promotions','combos','inventory','bulk');",
      "verify-schemas-non-empty",
    );

    const urlFor = (role) =>
      `postgresql://${role}:${password}@127.0.0.1:${port}/g6_e2e_test?sslmode=verify-full&sslrootcert=${encodeURIComponent(caCertPath)}`;

    return {
      containerName,
      port: Number(port),
      password,
      caCertPath,
      urlFor,
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

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

async function startSingleLocalG7Server() {
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

  let issuer = "";
  let baseUrl = "";

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
    if (req.method === "POST" && url === "/api/v1/auth/token") {
      const contentType = String(req.headers["content-type"] ?? "");
      if (!contentType.includes("application/x-www-form-urlencoded")) {
        res.statusCode = 415;
        res.setHeader("content-type", "application/problem+json");
        res.end(JSON.stringify({ code: "UNSUPPORTED_MEDIA_TYPE" }));
        return;
      }
      const params = new URLSearchParams(await readRawBody(req));
      const grantType = params.get("grant_type");
      const clientId = params.get("client_id") ?? "";
      const clientSecret = params.get("client_secret") ?? "";
      const scope = (params.get("scope") ?? "").trim();
      const allowedClients = new Map([
        [
          "promotions-svc",
          {
            secrets: new Set(["e2e-promotions-secret", "e2e-promotions-h5-secret"]),
            scopes: new Set([
              "ventas:pedidos:evidencia-cupon:leer",
              "inventario:reservas:estado:leer",
              "catalogo:leer",
              "inventario:leer",
            ]),
          },
        ],
        [
          "modulo-productos",
          {
            secrets: new Set([
              "e2e-promotions-secret",
              "e2e-promotions-h5-secret",
              "e2e-catalog-secret",
            ]),
            scopes: new Set(["catalogo:leer", "inventario:leer"]),
          },
        ],
        [
          "modulo-ventas",
          {
            secrets: new Set(["e2e-ventas-secret"]),
            scopes: new Set([
              "cupones:consumir",
              "cupones:restaurar",
              "cupones:operaciones:leer",
              "inventario:reservar",
              "inventario:operaciones:leer",
              "inventario:reservas:estado:leer",
              "catalogo:leer",
              "inventario:leer",
            ]),
          },
        ],
      ]);
      const requestedScopes = scope.split(/\s+/).filter(Boolean);
      const clientPolicy = allowedClients.get(clientId);
      const validSecret = clientPolicy?.secrets.has(clientSecret) ?? false;
      const validScopes =
        requestedScopes.length > 0 &&
        requestedScopes.every((s) => clientPolicy?.scopes.has(s) ?? false);
      const wantsVentas = requestedScopes.includes("ventas:pedidos:evidencia-cupon:leer");
      const mixedAudience = wantsVentas && requestedScopes.length > 1;
      if (grantType !== "client_credentials" || !validSecret || !validScopes || mixedAudience) {
        res.statusCode = 401;
        res.setHeader("content-type", "application/problem+json");
        res.end(JSON.stringify({ code: "CLIENT_AUTH_INVALID" }));
        return;
      }
      const audience = wantsVentas ? "api-ventas" : "api-productos";
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          accessToken: issueAccessToken({
            sub: clientId,
            tipo: "servicio",
            aud: [audience],
            roles: [],
            scope,
          }),
          tokenType: "Bearer",
          expiresIn: 600,
          scopes: requestedScopes,
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
  issuer = baseUrl;
  return {
    issuer,
    baseUrl,
    jwksUrl: `${baseUrl}/jwks`,
    discoveryUrl: `${baseUrl}/.well-known/openid-configuration`,
    tokenUrl: `${baseUrl}/api/v1/auth/token`,
    publicKey,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

function verifyTechnicalG7Bearer(authHeader, publicKey, requiredAudience, requiredScope) {
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, code: "TOKEN_INVALIDO" };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, status: 401, code: "TOKEN_INVALIDO" };
  }
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    if (header?.alg !== "RS256") {
      return { ok: false, status: 401, code: "TOKEN_INVALIDO" };
    }
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    if (!verifier.verify(publicKey, Buffer.from(sigB64, "base64url"))) {
      return { ok: false, status: 401, code: "TOKEN_INVALIDO" };
    }
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= now) {
      return { ok: false, status: 401, code: "TOKEN_EXPIRADO" };
    }
    const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audList.includes(requiredAudience)) {
      return { ok: false, status: 403, code: "AUDIENCIA_INVALIDA" };
    }
    if (payload.tipo !== "servicio" || payload.sub !== "promotions-svc") {
      return { ok: false, status: 403, code: "CLIENTE_NO_AUTORIZADO" };
    }
    const scopes = String(payload.scope ?? "")
      .split(/\s+/)
      .filter(Boolean);
    if (!scopes.includes(requiredScope)) {
      return { ok: false, status: 403, code: "SCOPE_INSUFICIENTE" };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, status: 401, code: "TOKEN_INVALIDO" };
  }
}

async function startLocalG5EvidenceServer({ g7PublicKey, seedInventoryStock }) {
  const g5CertDir = mkdtempSync(join(tmpdir(), "g6-e2e-g5-tls-"));
  const g5KeyPath = join(g5CertDir, "server.key");
  const g5CertPath = join(g5CertDir, "server.crt");

  await exec(
    "docker",
    [
      "run",
      "--rm",
      "--entrypoint",
      "sh",
      "-v",
      `${g5CertDir}:/out`,
      POSTGRES_IMAGE,
      "-c",
      'apk add --no-cache openssl >/dev/null && openssl req -x509 -newkey rsa:2048 -nodes -keyout /out/server.key -out /out/server.crt -days 1 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" && chmod 644 /out/server.crt && chmod 600 /out/server.key',
    ],
    { timeout: 60_000 },
  );

  const snapshots = new Map();
  const httpsServer = createHttpsServer(
    {
      cert: readFileSync(g5CertPath),
      key: readFileSync(g5KeyPath),
    },
    (req, res) => {
      const url = req.url ?? "/";
      const match = /^\/api\/v1\/integraciones\/productos\/pedidos\/([^/]+)\/evidencia-cupon$/.exec(
        url,
      );
      if (req.method === "GET" && match) {
        const authResult = verifyTechnicalG7Bearer(
          req.headers["authorization"],
          g7PublicKey,
          "api-ventas",
          "ventas:pedidos:evidencia-cupon:leer",
        );
        if (!authResult.ok) {
          res.statusCode = authResult.status;
          res.setHeader("content-type", "application/problem+json");
          res.end(JSON.stringify({ code: authResult.code }));
          return;
        }
        const orderId = decodeURIComponent(match[1]);
        const snap = snapshots.get(orderId);
        if (!snap) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(snap));
        return;
      }
      res.statusCode = 404;
      res.end();
    },
  );

  const seedServer = createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (req.method === "POST" && url === "/__test/g5-snapshots") {
      const body = await readJsonBody(req);
      if (typeof body.order_id !== "string" || !body.order_id) {
        res.statusCode = 400;
        res.end();
        return;
      }
      snapshots.set(body.order_id, body);
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "POST" && url === "/__test/inventory-stock") {
      const body = await readJsonBody(req);
      const sku = typeof body.sku === "string" ? body.sku.trim() : "";
      const onHand = Number(body.on_hand);
      if (!/^[A-Za-z0-9_-]{3,64}$/.test(sku) || !Number.isInteger(onHand) || onHand < 0) {
        res.statusCode = 400;
        res.end();
        return;
      }
      await seedInventoryStock(sku, onHand);
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, sku, on_hand: onHand }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  httpsServer.listen(0, "127.0.0.1");
  await once(httpsServer, "listening");
  const httpsAddr = httpsServer.address();
  if (!httpsAddr || typeof httpsAddr === "string") {
    rmSync(g5CertDir, { recursive: true, force: true });
    throw new Error("No se pudo iniciar servidor HTTPS local de evidencia G5.");
  }

  seedServer.listen(0, "127.0.0.1");
  await once(seedServer, "listening");
  const seedAddr = seedServer.address();
  if (!seedAddr || typeof seedAddr === "string") {
    httpsServer.close();
    rmSync(g5CertDir, { recursive: true, force: true });
    throw new Error("No se pudo iniciar servidor seed HTTP local de evidencia G5.");
  }

  return {
    baseUrl: `https://127.0.0.1:${httpsAddr.port}`,
    seedOrigin: `http://127.0.0.1:${seedAddr.port}`,
    caCertPath: g5CertPath,
    close: async () => {
      await Promise.all([
        new Promise((r) => httpsServer.close(() => r())),
        new Promise((r) => seedServer.close(() => r())),
      ]);
      rmSync(g5CertDir, { recursive: true, force: true });
    },
  };
}

async function main() {
  const port = Number(process.env.PLAYWRIGHT_REAL_PORT ?? 4173);
  const viteOrigin = `http://127.0.0.1:${port}`;
  const backendRoot = resolve(
    process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
  );
  const docsRoot = resolve(
    process.env.G6_DOCS_ROOT ?? resolve(process.cwd(), "../docs"),
  );

  let pg;
  let g7;
  let g5Evidence;
  const children = [];

  const cleanup = async (vite) => {
    vite?.kill("SIGTERM");
    for (const child of children) child.kill("SIGTERM");
    await g5Evidence?.close();
    await g7?.close();
    await pg?.stop();
    rmSync(MANIFEST_PATH, { force: true });
  };

  try {
    pg = await startDisposablePostgresWithTls(backendRoot, docsRoot);
    g7 = await startSingleLocalG7Server();
    g5Evidence = await startLocalG5EvidenceServer({
      g7PublicKey: g7.publicKey,
      seedInventoryStock: async (sku, onHand) => {
        const sql = `
          INSERT INTO inventory.stock_balance (sku_id, location_id, on_hand, reserved, blocked, stock_version)
          VALUES ('${sku}', '00000000-0000-4000-8000-000000000101', ${onHand}, 0, 0, 1)
          ON CONFLICT (sku_id, location_id)
          DO UPDATE SET on_hand = EXCLUDED.on_hand, reserved = 0, blocked = 0;
        `;
        await runPsql(pg.containerName, "g6_e2e_test", sql, `seed-stock:${sku}`);
      },
    });

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
        PGUSER: "taxonomy_app",
        DATABASE_URL: pg.urlFor("taxonomy_app"),
      },
      "pricing-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["pricing-svc"]),
        PGUSER: "pricing_app",
        DATABASE_URL: pg.urlFor("pricing_app"),
        PRICING_SERVICE_TOKEN_URL: g7.tokenUrl,
        PRICING_SERVICE_CLIENT_SECRET: "e2e-pricing-secret",
        PRICING_CATALOG_URL: serviceUrls["catalog-svc"],
      },
      "price-audit-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["price-audit-svc"]),
        PGUSER: "price_audit_app",
        DATABASE_URL: pg.urlFor("price_audit_app"),
      },
      "promotions-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["promotions-svc"]),
        NODE_EXTRA_CA_CERTS: g5Evidence.caCertPath,
        PGUSER: "promotions_app",
        G6_DATABASE_SCHEMA: "promotions",
        G6_CONNECTION_MODE: "session",
        MESSAGING_PROVIDER: "AZURE_SERVICE_BUS",
        PROMOTIONS_H5_COUPON_COMMANDS_ENABLED: "true",
        PROMOTIONS_H5_ISOLATED_BUS: "1",
        GATEWAY_CATALOG_SVC_URL: serviceUrls["catalog-svc"],
        GATEWAY_INVENTORY_SVC_URL: serviceUrls["inventory-svc"],
        PROMOTIONS_G5_COUPON_EVIDENCE_ORIGIN: g5Evidence.baseUrl,
        PROMOTIONS_SERVICE_TOKEN_URL: g7.tokenUrl,
        PROMOTIONS_SERVICE_CLIENT_SECRET: "e2e-promotions-secret",
        PROMOTIONS_H5_SERVICE_CLIENT_SECRET: "e2e-promotions-h5-secret",
        DATABASE_URL: pg.urlFor("promotions_app"),
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
        PGUSER: "inventory_app",
        DATABASE_URL: pg.urlFor("inventory_app"),
        G7_JWT_ISSUER: g7.issuer,
        G7_JWT_JWKS_URL: g7.jwksUrl,
      },
      "bulk-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["bulk-svc"]),
        PGUSER: "bulk_app",
        DATABASE_URL: pg.urlFor("bulk_app"),
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

    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(
        {
          gatewayUrl,
          g7ApiBase: g7.baseUrl,
          g7Issuer: g7.issuer,
          g7JwksUrl: g7.jwksUrl,
          g5EvidenceOrigin: g5Evidence.baseUrl,
          g5SeedOrigin: g5Evidence.seedOrigin,
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
