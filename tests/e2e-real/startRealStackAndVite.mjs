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
const POSTGRES_IMAGE = "postgres:17-alpine";
let failNextCatalogTokenCount = 0;
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
      { root: "backend", path: "apps/bulk-svc/migrations/0009_h5_outbox_delivery_all_destinations.sql" },
    ],
  },
};

function runPsql(containerName, database, sqlContent, label, extraArgs = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        containerName,
        "psql",
        "-X",
        ...extraArgs,
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
  let lastInfo = "no response";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      const body = await res.text().catch(() => "");
      lastInfo = `HTTP ${res.status}: ${body.slice(0, 300)}`;
    } catch (err) {
      lastInfo = err instanceof Error ? err.message : String(err);
    }
    await delay(250);
  }
  throw new Error(`PREFLIGHT_BLOCKED: Servicio no respondió listo en ${url} (${lastInfo})`);
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

    let sslStatus = "";
    for (let i = 0; i < 80; i += 1) {
      try {
        sslStatus = await runPsql(
          containerName,
          "g6_e2e_test",
          "SHOW ssl;",
          "verify-ssl-on",
        );
        break;
      } catch {
        if (i === 79) throw new Error("PostgreSQL descartable no estuvo listo.");
        await delay(300);
      }
    }
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
      GRANT CREATE ON DATABASE g6_e2e_test TO po_taxonomy_owner, po_catalog_owner, po_pricing_owner, po_price_audit_owner, po_promotions_owner, po_combos_owner, po_inventory_owner, po_bulk_owner;

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

    // 4. Ejecutar SQL oficial de cada servicio bajo su rol owner (archivo por archivo)
    for (const [service, spec] of Object.entries(SQL_INVENTORY_BY_SERVICE)) {
      const pre = spec.preSql ? `${spec.preSql}\n` : "";
      for (const entry of spec.files) {
        const base = entry.root === "docs" ? docsRoot : backendRoot;
        const fullPath = resolve(base, entry.path);
        if (!existsSync(fullPath)) {
          throw new Error(`SQL_MISSING (${service}): ${fullPath}`);
        }
        const fileSql = readFileSync(fullPath, "utf8");
        const hasOwnTx = /^\s*BEGIN\s*;/im.test(fileSql);
        const wrapped = hasOwnTx
          ? `SET ROLE ${spec.ownerRole};\n${fileSql.replace(/^\s*BEGIN\s*;/im, `BEGIN;\n${pre}`)}\nRESET ROLE;`
          : `SET ROLE ${spec.ownerRole};\nBEGIN;\n${pre}${fileSql}\nCOMMIT;\nRESET ROLE;`;
        await runPsql(
          containerName,
          "g6_e2e_test",
          wrapped,
          `migrate:${service}:${entry.path}`,
        );
      }
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
  const inactiveUserId = randomUUID();
  const blockedUserId = randomUUID();
  const gestorScopes =
    "catalogo:leer catalogo:escribir taxonomia:leer taxonomia:escribir precios:leer precios:escribir auditoria-precios:leer auditoria-precios:exportar promociones:leer promociones:escribir cupones:leer cupones:escribir combos:leer combos:escribir inventario:leer inventario:escribir carga-masiva:leer carga-masiva:escribir INVENTARIO_TRASLADOS_LEER INVENTARIO_TRASLADOS_RECIBIR";

  const labUsers = new Map([
    [
      "gestor@example.test",
      {
        id: gestorId,
        password: "isolated-g7-password",
        nombreCompleto: "Gestor Comercial E2E",
        roles: ["GESTOR_COMERCIAL"],
        permisos: gestorScopes.split(" "),
        scope: gestorScopes,
        status: "ACTIVO",
      },
    ],
    [
      "sinrol@example.test",
      {
        id: noRoleId,
        password: "isolated-sinrol-password",
        nombreCompleto: "Usuario Sin Rol",
        roles: [],
        permisos: [],
        scope: "",
        status: "ACTIVO",
      },
    ],
    [
      "inactivo@example.test",
      {
        id: inactiveUserId,
        password: "isolated-inactivo-password",
        nombreCompleto: "Usuario Inactivo",
        roles: ["GESTOR_COMERCIAL"],
        permisos: gestorScopes.split(" "),
        scope: gestorScopes,
        status: "INACTIVO",
      },
    ],
    [
      "bloqueado@example.test",
      {
        id: blockedUserId,
        password: "isolated-bloqueado-password",
        nombreCompleto: "Usuario Bloqueado",
        roles: ["GESTOR_COMERCIAL"],
        permisos: gestorScopes.split(" "),
        scope: gestorScopes,
        status: "BLOQUEADO",
      },
    ],
  ]);

  const issuedTokens = new Map();
  const revokedJtis = new Set();
  const refreshTokens = new Map();

  let issuer = "";
  let baseUrl = "";

  function issueAccessToken(claims = {}) {
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", kid: jwk.kid, typ: "JWT" }),
    ).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const jti = randomUUID();
    const payloadObj = {
      iss: issuer,
      sub: gestorId,
      tipo: "acceso",
      aud: ["api-productos"],
      roles: ["GESTOR_COMERCIAL"],
      scope: gestorScopes,
      iat: now,
      exp: now + 600,
      jti,
      ...claims,
    };
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const sig = sign(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      privateKey,
    ).toString("base64url");
    const token = `${header}.${payload}.${sig}`;
    issuedTokens.set(token, payloadObj);
    return token;
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
          token_endpoint: `${baseUrl}/api/v1/auth/token`,
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
      const correo = typeof body.correo === "string" ? body.correo.trim().toLowerCase() : "";
      const contrasena =
        typeof body.contrasena === "string" ? body.contrasena : "";
      const user = labUsers.get(correo);
      if (
        !user ||
        user.password !== contrasena ||
        body.formatoAcceso !== "JWS" ||
        user.status !== "ACTIVO"
      ) {
        res.statusCode = 401;
        res.setHeader("content-type", "application/problem+json");
        res.end(
          JSON.stringify({
            code:
              user?.status === "INACTIVO"
                ? "USUARIO_INACTIVO"
                : user?.status === "BLOQUEADO"
                  ? "USUARIO_BLOQUEADO"
                  : "CREDENCIALES_INVALIDAS",
          }),
        );
        return;
      }
      const refreshToken = `refresh-${randomUUID()}`;
      refreshTokens.set(refreshToken, {
        correo,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          tokenType: "Bearer",
          accessToken: issueAccessToken({
            sub: user.id,
            roles: user.roles,
            scope: user.scope,
            email: correo,
          }),
          refreshToken,
          expiresIn: 600,
          usuario: {
            id: user.id,
            nombreCompleto: user.nombreCompleto,
            correo,
            roles: user.roles,
          },
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
              "e2e-pricing-secret",
              "e2e-combos-secret",
              "e2e-gateway-secret",
            ]),
            scopes: new Set([
              "catalogo:leer",
              "precios:leer",
              "inventario:leer",
              "tokens:introspeccion",
              "carga-masiva:contenidos:leer",
              "inventario:reservas:evidencia-cupon:leer",
              "catalogo:contexto-sku:leer",
              "catalogo:skus:filtrar",
              "taxonomia:leer",
              "inventario:disponibilidad:leer",
            ]),
          },
        ],
        [
          "modulo-marketplace",
          {
            secrets: new Set(["e2e-marketplace-secret"]),
            scopes: new Set([
              "catalogo:leer",
              "precios:leer",
              "promociones:evaluar",
              "promociones:leer",
              "cupones:validar",
              "recomendaciones:leer",
              "combos:leer",
              "inventario:disponibilidad:leer",
            ]),
          },
        ],
        [
          "modulo-chatbot",
          {
            secrets: new Set(["e2e-chatbot-secret"]),
            scopes: new Set(["catalogo:leer", "precios:leer", "promociones:evaluar", "combos:leer", "inventario:disponibilidad:leer"]),
          },
        ],
        [
          "catalog-svc",
          {
            secrets: new Set(["e2e-catalog-secret"]),
            scopes: new Set(["carga-masiva:contenidos:leer", "catalogo:leer"]),
          },
        ],
        [
          "bulk-svc",
          {
            secrets: new Set(["e2e-bulk-secret"]),
            scopes: new Set(["catalogo:leer", "precios:leer", "inventario:disponibilidad:leer"]),
          },
        ],
        [
          "inventory-svc",
          {
            secrets: new Set(["e2e-inventory-secret"]),
            scopes: new Set(["catalogo:leer"]),
          },
        ],
        [
          "modulo-retail",
          {
            secrets: new Set(["e2e-retail-secret"]),
            scopes: new Set([
              "catalogo:leer",
              "precios:leer",
              "promociones:evaluar",
              "combos:leer",
              "inventario:disponibilidad:leer",
              "inventario:incidencias:reportar",
              "inventario:incidencias:resolver",
            ]),
          },
        ],
        [
          "modulo-postventa",
          {
            secrets: new Set(["e2e-postventa-secret"]),
            scopes: new Set(["inventario:disponibilidad:leer", "inventario:reintegrar", "inventario:reintegros:escribir"]),
          },
        ],
        [
          "modulo-despacho",
          {
            secrets: new Set(["e2e-despacho-secret"]),
            scopes: new Set(["inventario:disponibilidad:leer", "catalogo:leer", "productos:fisicos:leer"]),
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
              "inventario:consumir",
              "inventario:liberar",
              "inventario:conciliar-offline",
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
      const wantsSeguridad = requestedScopes.includes("tokens:introspeccion");
      const mixedAudience =
        (wantsVentas && requestedScopes.length > 1) ||
        (wantsSeguridad && requestedScopes.length > 1);
      if (grantType !== "client_credentials" || !validSecret || !validScopes || mixedAudience) {
        res.statusCode = 401;
        res.setHeader("content-type", "application/problem+json");
        res.end(JSON.stringify({ code: "CLIENT_AUTH_INVALID" }));
        return;
      }
      if (
        clientId === "modulo-productos" &&
        requestedScopes.includes("catalogo:leer") &&
        failNextCatalogTokenCount > 0
      ) {
        failNextCatalogTokenCount -= 1;
        console.error(`[g7-stub] returning 503 for ${clientId} scope=${scope}`);
        res.statusCode = 503;
        res.setHeader("content-type", "application/problem+json");
        res.end(JSON.stringify({ code: "G7_TEMPORARY_UNAVAILABLE" }));
        return;
      }
      const audience = wantsVentas
        ? "api-ventas"
        : wantsSeguridad
          ? "api-seguridad"
          : "api-productos";
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
            ...(clientId === "modulo-ventas" ? { store_ref: "TIENDA-CERT-01" } : {}),
          }),
          tokenType: "Bearer",
          expiresIn: 600,
          scopes: requestedScopes,
        }),
      );
      return;
    }
    if (req.method === "POST" && url === "/api/v1/auth/introspeccion") {
      const authResult = verifyTechnicalG7Bearer(
        req.headers["authorization"],
        publicKey,
        "api-seguridad",
        "tokens:introspeccion",
        "modulo-productos",
      );
      if (!authResult.ok) {
        res.statusCode = authResult.status;
        res.setHeader("content-type", "application/problem+json");
        res.end(JSON.stringify({ code: authResult.code }));
        return;
      }
      const body = await readJsonBody(req);
      const tokenToInspect = typeof body.token === "string" ? body.token : "";
      const parts = tokenToInspect.split(".");
      if (parts.length !== 3) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ activo: false, motivo: "FIRMA_INVALIDA" }));
        return;
      }
      try {
        const verifier = createVerify("RSA-SHA256");
        verifier.update(`${parts[0]}.${parts[1]}`);
        verifier.end();
        if (!verifier.verify(publicKey, Buffer.from(parts[2], "base64url"))) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ activo: false, motivo: "FIRMA_INVALIDA" }));
          return;
        }
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf8"),
        );
        const now = Math.floor(Date.now() / 1000);
        if (typeof payload.exp !== "number" || payload.exp <= now) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ activo: false, motivo: "TOKEN_VENCIDO" }));
          return;
        }
        if (typeof payload.jti === "string" && revokedJtis.has(payload.jti)) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ activo: false, motivo: "TOKEN_REVOCADO" }));
          return;
        }
        const userEntry = Array.from(labUsers.values()).find(
          (u) => u.id === payload.sub,
        );
        if (userEntry?.status === "INACTIVO") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ activo: false, motivo: "USUARIO_INACTIVO" }));
          return;
        }
        if (userEntry?.status === "BLOQUEADO") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ activo: false, motivo: "USUARIO_BLOQUEADO" }));
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            activo: true,
            sub: payload.sub,
            tipo: payload.tipo,
            roles: Array.isArray(payload.roles) ? payload.roles : [],
            permisos: userEntry ? userEntry.permisos : [],
            exp: payload.exp,
            ...(typeof payload.email === "string"
              ? { email: payload.email }
              : {}),
          }),
        );
        return;
      } catch {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ activo: false, motivo: "FIRMA_INVALIDA" }));
        return;
      }
    }
    if (req.method === "POST" && url === "/auth/refresh") {
      const body = await readJsonBody(req);
      const token =
        typeof body.refreshToken === "string" ? body.refreshToken : "";
      const record = refreshTokens.get(token);
      const now = Math.floor(Date.now() / 1000);
      if (!record || record.expiresAt <= now) {
        refreshTokens.delete(token);
        res.statusCode = 401;
        res.setHeader("content-type", "application/problem+json");
        res.end(JSON.stringify({ code: "TOKEN_INVALIDO" }));
        return;
      }
      const user = labUsers.get(record.correo);
      if (!user || user.status !== "ACTIVO") {
        refreshTokens.delete(token);
        res.statusCode = 401;
        res.setHeader("content-type", "application/problem+json");
        res.end(JSON.stringify({ code: "TOKEN_INVALIDO" }));
        return;
      }
      // Rotar refresh token
      refreshTokens.delete(token);
      const nextRefreshToken = `refresh-${randomUUID()}`;
      refreshTokens.set(nextRefreshToken, {
        correo: record.correo,
        expiresAt: now + 3600,
      });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          tokenType: "Bearer",
          accessToken: issueAccessToken({
            sub: user.id,
            roles: user.roles,
            scope: user.scope,
            email: record.correo,
          }),
          refreshToken: nextRefreshToken,
          expiresIn: 600,
          usuario: {
            id: user.id,
            nombreCompleto: user.nombreCompleto,
            correo: record.correo,
            roles: user.roles,
          },
        }),
      );
      return;
    }
    if (req.method === "POST" && url === "/auth/logout") {
      const body = await readJsonBody(req);
      if (typeof body.refreshToken === "string") {
        refreshTokens.delete(body.refreshToken);
      }
      const authHeader = String(req.headers["authorization"] ?? "");
      if (authHeader.startsWith("Bearer ")) {
        const raw = authHeader.slice("Bearer ".length).trim();
        const parts = raw.split(".");
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(
              Buffer.from(parts[1], "base64url").toString("utf8"),
            );
            if (typeof payload.jti === "string") {
              revokedJtis.add(payload.jti);
            }
          } catch {
            // ignore malformed token on logout
          }
        }
      }
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
    gestorId,
    jwksUrl: `${baseUrl}/jwks`,
    discoveryUrl: `${baseUrl}/.well-known/openid-configuration`,
    tokenUrl: `${baseUrl}/api/v1/auth/token`,
    publicKey,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

function verifyTechnicalG7Bearer(
  authHeader,
  publicKey,
  requiredAudience,
  requiredScope,
  expectedSub = "promotions-svc",
) {
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
    if (payload.tipo !== "servicio" || payload.sub !== expectedSub) {
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

async function startLocalG5EvidenceServer({
  g7PublicKey,
  seedInventoryStock,
  seedCatalogActiveProduct,
  seedCatalogPendingPreparation,
  seedBulkMarkRetryable,
  pgQuery,
  seedInventoryStoreLocation,
  seedCatalogBarcode,
  seedInventoryTransfer,
}) {
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
    if (req.method === "POST" && url === "/__test/catalog-active-product") {
      const body = await readJsonBody(req);
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const skuRe = /^[A-Za-z0-9_-]{3,64}$/;
      const productId = typeof body.productId === "string" ? body.productId.trim() : "";
      const skuBase = typeof body.skuBase === "string" ? body.skuBase.trim() : "";
      const categoriaId = typeof body.categoriaId === "string" ? body.categoriaId.trim() : "";
      const marcaId = typeof body.marcaId === "string" ? body.marcaId.trim() : "";
      const tipoProductoId =
        typeof body.tipoProductoId === "string" ? body.tipoProductoId.trim() : "";
      if (
        !uuidRe.test(productId) ||
        !skuRe.test(skuBase) ||
        !uuidRe.test(categoriaId) ||
        !uuidRe.test(marcaId) ||
        !uuidRe.test(tipoProductoId)
      ) {
        res.statusCode = 400;
        res.end();
        return;
      }
      await seedCatalogActiveProduct({
        productId,
        skuBase,
        categoriaId,
        marcaId,
        tipoProductoId,
      });
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, productId, skuBase, estado: "ACTIVO" }));
      return;
    }
    if (req.method === "POST" && url === "/__test/inventory-store-location") {
      const body = await readJsonBody(req);
      const locationId = typeof body.locationId === "string" ? body.locationId.trim() : randomUUID();
      const code = typeof body.code === "string" ? body.code.trim() : "TIENDA-CERT-01";
      const externalRef = typeof body.external_ref === "string" ? body.external_ref.trim() : code;
      const sku = typeof body.sku === "string" ? body.sku.trim() : "";
      const onHand = Number.isInteger(Number(body.on_hand)) ? Number(body.on_hand) : 20;
      await seedInventoryStoreLocation({ locationId, code, externalRef, sku, onHand });
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, locationId, code, external_ref: externalRef }));
      return;
    }
    if (req.method === "POST" && url === "/__test/catalog-barcode") {
      const body = await readJsonBody(req);
      const sku = typeof body.sku === "string" ? body.sku.trim() : "";
      const barcode = typeof body.codigo_barras === "string" ? body.codigo_barras.trim() : "";
      if (!sku || !barcode) {
        res.statusCode = 400;
        res.end();
        return;
      }
      await seedCatalogBarcode({ sku, barcode });
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, sku, codigo_barras: barcode }));
      return;
    }
    if (req.method === "POST" && url === "/__test/inventory-transfer") {
      const body = await readJsonBody(req);
      const trasladoId = typeof body.trasladoId === "string" ? body.trasladoId.trim() : randomUUID();
      const sku = typeof body.sku === "string" ? body.sku.trim() : "";
      const targetLocationId = typeof body.targetLocationId === "string" ? body.targetLocationId.trim() : "";
      if (!sku || !targetLocationId) {
        res.statusCode = 400;
        res.end();
        return;
      }
      await seedInventoryTransfer({ trasladoId, sku, targetLocationId });
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, trasladoId }));
      return;
    }
    if (req.method === "POST" && url === "/__test/catalog-pending-preparation") {
      const body = await readJsonBody(req);
      const categoriaId = typeof body.categoriaId === "string" ? body.categoriaId.trim() : "";
      const marcaId = typeof body.marcaId === "string" ? body.marcaId.trim() : "";
      const tipoProductoId = typeof body.tipoProductoId === "string" ? body.tipoProductoId.trim() : "";
      const sourceVariantId = typeof body.sourceVariantId === "string" ? body.sourceVariantId.trim() : "";
      if (!categoriaId || !marcaId || !tipoProductoId || !sourceVariantId) {
        res.statusCode = 400;
        res.end();
        return;
      }
      const seeded = await seedCatalogPendingPreparation({ categoriaId, marcaId, tipoProductoId, sourceVariantId });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, ...seeded }));
      return;
    }
    if (req.method === "POST" && url === "/__test/bulk-mark-retryable") {
      const body = await readJsonBody(req);
      const batchId = typeof body.batchId === "string" ? body.batchId.trim() : "";
      if (!batchId) {
        res.statusCode = 400;
        res.end();
        return;
      }
      await seedBulkMarkRetryable({ batchId });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, batchId }));
      return;
    }
    if (req.method === "POST" && url === "/__test/g7-fail-next-catalog-token") {
      failNextCatalogTokenCount = 1;
      console.error("[g7-stub] armed failNextCatalogTokenCount=1");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "POST" && url === "/__test/pg-query") {
      try {
        const body = await readJsonBody(req);
        const querySql = typeof body.sql === "string" ? body.sql.trim() : "";
        if (!/^SELECT\s+/i.test(querySql) || querySql.includes(";")) {
          res.statusCode = 400;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "ONLY_SINGLE_SELECT_ALLOWED" }));
          return;
        }
        const wrapped = `SELECT coalesce(json_agg(t), '[]'::json)::text FROM (${querySql}) t;\n`;
        const out = await pgQuery(wrapped, ["-t", "-A"]);
        const jsonLine = out.trim() || "[]";
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ rows: JSON.parse(jsonLine) }));
      } catch (err) {
        console.error("[pg-query] error:", err instanceof Error ? err.message : String(err));
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "PG_QUERY_ERROR", detail: err instanceof Error ? err.message : String(err) }));
      }
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

async function startLocalIsolatedServiceBusBroker() {
  const queues = new Map();
  const dlq = new Map();
  const inflight = new Map();
  const storageObjects = new Map();
  const getQueue = (name) => {
    if (!queues.has(name)) queues.set(name, []);
    return queues.get(name);
  };
  const getDlq = (name) => {
    if (!dlq.has(name)) dlq.set(name, []);
    return dlq.get(name);
  };
  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/storage/v1/")) {
      if (req.method === "GET" && url.startsWith("/storage/v1/bucket/")) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ id: "bulk-e2e", name: "bulk-e2e", public: false }));
        return;
      }
      if (url.startsWith("/storage/v1/object/")) {
        const key = url.slice("/storage/v1/object/".length);
        if (req.method === "POST" || req.method === "PUT") {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          storageObjects.set(key, {
            body: Buffer.concat(chunks),
            contentType: req.headers["content-type"] ?? "application/octet-stream",
          });
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ Key: key }));
          return;
        }
        if (req.method === "GET") {
          const obj = storageObjects.get(key);
          if (!obj) {
            res.statusCode = 404;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ statusCode: "404", code: "NoSuchKey", message: "Object not found" }));
            return;
          }
          res.statusCode = 200;
          res.setHeader("content-type", obj.contentType);
          res.end(obj.body);
          return;
        }
      }
    }
    const match = /^\/queues\/([^/]+)\/(messages|receive|peek|dlq|complete|abandon|deadletter)(?:\/([^/]+))?$/.exec(
      url,
    );
    if (!match) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const queue = decodeURIComponent(match[1]);
    const action = match[2];
    const deliveryId = match[3] ? decodeURIComponent(match[3]) : undefined;

    if (req.method === "POST" && action === "messages") {
      const msg = await readJsonBody(req);
      getQueue(queue).push({ ...msg, deliveryCount: 0 });
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "POST" && action === "receive") {
      const q = getQueue(queue);
      if (q.length === 0) {
        res.statusCode = 204;
        res.end();
        return;
      }
      const next = q.shift();
      next.deliveryCount = (next.deliveryCount ?? 0) + 1;
      const id = randomUUID();
      inflight.set(id, { queue, msg: next });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ deliveryId: id, ...next }));
      return;
    }
    if (req.method === "GET" && action === "peek") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(getQueue(queue).slice(0, 10)));
      return;
    }
    if (req.method === "GET" && action === "dlq") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(getDlq(queue)));
      return;
    }
    if (req.method === "POST" && action === "complete" && deliveryId) {
      inflight.delete(deliveryId);
      res.statusCode = 200;
      res.end();
      return;
    }
    if (req.method === "POST" && action === "abandon" && deliveryId) {
      const entry = inflight.get(deliveryId);
      inflight.delete(deliveryId);
      if (entry) getQueue(entry.queue).push(entry.msg);
      res.statusCode = 200;
      res.end();
      return;
    }
    if (req.method === "POST" && action === "deadletter" && deliveryId) {
      const entry = inflight.get(deliveryId);
      inflight.delete(deliveryId);
      const reasonBody = await readJsonBody(req);
      if (entry) {
        getDlq(entry.queue).push({
          ...entry.msg,
          deadLetterReason: reasonBody.deadLetterReason ?? "DEAD_LETTERED",
          deadLetterErrorDescription: reasonBody.deadLetterErrorDescription ?? "",
          deadLetteredAt: new Date().toISOString(),
        });
      }
      res.statusCode = 200;
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
    throw new Error("No se pudo iniciar broker Service Bus aislado local.");
  }
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise((r) => server.close(() => r())),
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
  let isolatedBus;
  const children = [];

  const cleanup = async (vite) => {
    vite?.kill("SIGTERM");
    for (const child of children) child.kill("SIGTERM");
    await isolatedBus?.close();
    await g5Evidence?.close();
    await g7?.close();
    await pg?.stop();
    rmSync(MANIFEST_PATH, { force: true });
  };

  try {
    pg = await startDisposablePostgresWithTls(backendRoot, docsRoot);
    g7 = await startSingleLocalG7Server();
    isolatedBus = await startLocalIsolatedServiceBusBroker();
    const taxonomyLogoDir = mkdtempSync(join(tmpdir(), "g6-e2e-taxonomy-logos-"));
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
      seedInventoryStoreLocation: async ({ locationId, code, externalRef, sku, onHand }) => {
        const sql = `
          INSERT INTO inventory.locations (id, code, name, type, external_ref, active)
          VALUES ('${locationId}', '${code}', 'Tienda Cert ${code}', 'TIENDA', '${externalRef}', true)
          ON CONFLICT (id) DO UPDATE SET external_ref = EXCLUDED.external_ref, active = true;
          ${sku ? `
          INSERT INTO inventory.stock_balance (sku_id, location_id, on_hand, reserved, blocked, stock_version)
          VALUES ('${sku}', '${locationId}', ${onHand}, 0, 0, 1)
          ON CONFLICT (sku_id, location_id) DO UPDATE SET on_hand = EXCLUDED.on_hand, reserved = 0, blocked = 0;
          ` : ""}
        `;
        await runPsql(pg.containerName, "g6_e2e_test", sql, `seed-store:${code}`);
      },
      seedCatalogBarcode: async ({ sku, barcode }) => {
        const sql = `
          INSERT INTO catalog.sku_barcodes (codigo_barras, sku_identity_id, created_by)
          SELECT '${barcode}', id, 'cert-seed'
          FROM catalog.sku_identity
          WHERE sku = '${sku}'
          ON CONFLICT (codigo_barras) DO NOTHING;
        `;
        await runPsql(pg.containerName, "g6_e2e_test", sql, `seed-barcode:${barcode}`);
      },
      seedInventoryTransfer: async ({ trasladoId, sku, targetLocationId }) => {
        const sql = `
          INSERT INTO inventory.traslados (id, traslado_id, sku_id, source_location_id, target_location_id, quantity_shipped, quantity_received, estado)
          VALUES ('${trasladoId}', '${trasladoId}', '${sku}', '00000000-0000-4000-8000-000000000101', '${targetLocationId}', 5, 0, 'EN_TRANSITO')
          ON CONFLICT (id) DO NOTHING;
        `;
        await runPsql(pg.containerName, "g6_e2e_test", sql, `seed-transfer:${trasladoId}`);
      },
      seedCatalogActiveProduct: async ({
        productId,
        skuBase,
        categoriaId,
        marcaId,
        tipoProductoId,
      }) => {
        const slug = `prod-activo-${skuBase.toLowerCase()}`;
        const pricingOpId = randomUUID();
        const pricingCorrId = randomUUID();
        const pricingMsgId = randomUUID();
        const inventoryOpId = randomUUID();
        const inventoryCorrId = randomUUID();
        const inventoryMsgId = randomUUID();
        const sql = `
          BEGIN;
          INSERT INTO catalog.products (
            id, nombre, descripcion, categoria_id, tipo_producto_id, marca_id,
            sku_base, slug, tiene_variantes, estado, catalog_version
          ) VALUES (
            '${productId}',
            'Producto Activo N01 ${skuBase}',
            'Fixture comercial preprovisionada en PostgreSQL descartable para N01',
            '${categoriaId}',
            '${tipoProductoId}',
            '${marcaId}',
            '${skuBase}',
            '${slug}',
            false,
            'BORRADOR',
            0
          );
          INSERT INTO catalog.product_images (product_id, url, principal, posicion)
          VALUES ('${productId}', 'https://example.test/productos/${skuBase.toLowerCase()}.png', true, 0);
          INSERT INTO catalog.sku_physical_profiles (sku_identity_id, peso_kg, largo_cm, ancho_cm, alto_cm)
          SELECT id, 1.25, 20, 15, 10
          FROM catalog.sku_identity
          WHERE sku = '${skuBase}';
          INSERT INTO catalog.activation_checks (
            product_id, variant_id, sku, dependency, operation_id, correlation_id,
            request_payload, state, result_payload, result_message_id
          ) VALUES
          (
            '${productId}', NULL, '${skuBase}', 'PRICING',
            '${pricingOpId}', '${pricingCorrId}',
            '{"sku":"${skuBase}","dependencia":"PRICING"}'::jsonb,
            'COMPLETED',
            '{"ok":true,"estado":"COMPLETADA"}'::jsonb,
            '${pricingMsgId}'
          ),
          (
            '${productId}', NULL, '${skuBase}', 'INVENTORY',
            '${inventoryOpId}', '${inventoryCorrId}',
            '{"sku":"${skuBase}","dependencia":"INVENTORY"}'::jsonb,
            'COMPLETED',
            '{"ok":true,"estado":"COMPLETADA"}'::jsonb,
            '${inventoryMsgId}'
          );
          UPDATE catalog.products
          SET estado = 'ACTIVO', catalog_version = 1
          WHERE id = '${productId}';
          COMMIT;
        `;
        await runPsql(pg.containerName, "g6_e2e_test", sql, `seed-catalog:${skuBase}`);
      },
      seedCatalogPendingPreparation: async ({ categoriaId, marcaId, tipoProductoId, sourceVariantId }) => {
        const retryProdId = randomUUID();
        const retrySku = `SKU-RETRY-${retryProdId.slice(0, 6).toUpperCase()}`;
        const retryPricingOpId = randomUUID();
        const retryPricingCorrId = randomUUID();
        const retryPricingMsgId = randomUUID();
        const retryVarProdId = randomUUID();
        const retryVarId = randomUUID();
        const retryVarSku = `SKU-RETRYV-${retryVarId.slice(0, 6).toUpperCase()}`;
        const retryVarInvOpId = randomUUID();
        const retryVarInvCorrId = randomUUID();
        const retryVarInvMsgId = randomUUID();
        const sql = `
          BEGIN;
          INSERT INTO catalog.products (
            id, nombre, descripcion, categoria_id, tipo_producto_id, marca_id,
            sku_base, slug, tiene_variantes, estado, catalog_version
          ) VALUES (
            '${retryProdId}',
            'Producto Retry ${retrySku}',
            'Fixture retryable en estado BORRADOR',
            '${categoriaId}',
            '${tipoProductoId}',
            '${marcaId}',
            '${retrySku}',
            'prod-retry-${retrySku.toLowerCase()}',
            false,
            'BORRADOR',
            0
          ), (
            '${retryVarProdId}',
            'Producto Var Retry ${retryVarSku}',
            'Fixture variante retryable en estado BORRADOR',
            '${categoriaId}',
            '${tipoProductoId}',
            '${marcaId}',
            'SKU-BASE-${retryVarSku}',
            'prod-var-retry-${retryVarSku.toLowerCase()}',
            true,
            'BORRADOR',
            0
          );
          INSERT INTO catalog.variants (
            id, product_id, sku, identifying_key, estado, catalog_version
          )
          SELECT
            '${retryVarId}',
            '${retryVarProdId}',
            '${retryVarSku}',
            identifying_key,
            'BORRADOR',
            0
          FROM catalog.variants WHERE id = '${sourceVariantId}';
          INSERT INTO catalog.variant_attribute_values (
            variant_id, caracteristica_id, nombre_snapshot, valor_id, valor, es_identificador
          )
          SELECT
            '${retryVarId}',
            caracteristica_id,
            nombre_snapshot,
            valor_id,
            valor,
            es_identificador
          FROM catalog.variant_attribute_values WHERE variant_id = '${sourceVariantId}';
          INSERT INTO catalog.product_images (product_id, url, principal, posicion)
          VALUES ('${retryProdId}', 'https://example.test/pr.png', true, 0);
          INSERT INTO catalog.variant_images (variant_id, url)
          VALUES ('${retryVarId}', 'https://example.test/vr.png');
          INSERT INTO catalog.activation_checks (
            product_id, variant_id, sku, dependency, operation_id, correlation_id,
            request_payload, state
          ) VALUES (
            '${retryProdId}', NULL, '${retrySku}', 'PRICING',
            '${retryPricingOpId}', '${retryPricingCorrId}',
            '{"product_id":"${retryProdId}","sku_base":"${retrySku}","precio_regular":99.9,"moneda":"PEN","channel_id":null,"motivo_cambio":"ALTA_PRODUCTO"}'::jsonb,
            'PENDING'
          ), (
            '${retryVarProdId}', '${retryVarId}', '${retryVarSku}', 'INVENTORY',
            '${retryVarInvOpId}', '${retryVarInvCorrId}',
            '{"sku":"${retryVarSku}","product_id":"${retryVarProdId}","variant_id":"${retryVarId}","default_location_id":"00000000-0000-4000-8000-000000000101"}'::jsonb,
            'PENDING'
          );
          INSERT INTO catalog.outbox (
            message_id, event_name, kind, schema_version, correlation_id,
            operation_id, occurred_at, payload, created_at, published_at
          ) VALUES (
            '${retryPricingMsgId}', 'pricing.product.initialization.requested', 'command', 1,
            '${retryPricingCorrId}', '${retryPricingOpId}', now() - interval '10 seconds',
            '{"product_id":"${retryProdId}","sku_base":"${retrySku}","precio_regular":99.9,"moneda":"PEN","channel_id":null,"motivo_cambio":"ALTA_PRODUCTO"}'::jsonb,
            now() - interval '10 seconds', now() - interval '10 seconds'
          ), (
            '${retryVarInvMsgId}', 'inventory.sku.initialization.requested', 'command', 1,
            '${retryVarInvCorrId}', '${retryVarInvOpId}', now() - interval '10 seconds',
            '{"sku":"${retryVarSku}","product_id":"${retryVarProdId}","variant_id":"${retryVarId}","default_location_id":"00000000-0000-4000-8000-000000000101"}'::jsonb,
            now() - interval '10 seconds', now() - interval '10 seconds'
          );
          COMMIT;
        `;
        await runPsql(pg.containerName, "g6_e2e_test", sql, `seed-pending-prep:${retryProdId}`);
        return { retryProdId, retryVarProdId, retryVarId };
      },
      seedBulkMarkRetryable: async ({ batchId }) => {
        const safeId = batchId.replaceAll("'", "''");
        const sql = `
          BEGIN;
          UPDATE bulk.batch_jobs
          SET status = 'COMPLETED', needs_reconciliation = true, completed_rows = 0, failed_rows = 1
          WHERE batch_id = '${safeId}';
          UPDATE bulk.batch_rows
          SET status = 'FAILED', applied_domains = '{}'::text[], failed_domain = 'CATALOGO',
              needs_reconciliation = false, error_code = 'CATALOG_AUTH_TEMPORARY_UNAVAILABLE'
          WHERE batch_job_id = (SELECT id FROM bulk.batch_jobs WHERE batch_id = '${safeId}');
          UPDATE bulk.row_domain_steps
          SET status = 'FAILED', error_code = 'CATALOG_AUTH_TEMPORARY_UNAVAILABLE'
          WHERE batch_row_id IN (
            SELECT id FROM bulk.batch_rows WHERE batch_job_id = (SELECT id FROM bulk.batch_jobs WHERE batch_id = '${safeId}')
          ) AND domain = 'CATALOGO';
          INSERT INTO bulk.domain_attempts (
            attempt_id, batch_row_id, domain, business_operation_id, attempt_number,
            status, effect_state, retriable, receipt_message_id, error_code
          )
          SELECT
            gen_random_uuid(),
            r.id,
            'CATALOGO',
            ((i.payload->'catalogCommands'->0)->>'operation_id')::uuid,
            1,
            'REJECTED',
            'NONE',
            true,
            gen_random_uuid(),
            'CATALOG_AUTH_TEMPORARY_UNAVAILABLE'
          FROM bulk.batch_rows r
          JOIN bulk.batch_jobs j ON j.id = r.batch_job_id
          JOIN bulk.inbox i ON i.message_id = j.batch_id::text AND i.handler = 'bulk.import.admission'
          WHERE j.batch_id = '${safeId}'
          ON CONFLICT DO NOTHING;
          COMMIT;
        `;
        await runPsql(pg.containerName, "g6_e2e_test", sql, `seed-bulk-retryable:${safeId}`);
      },
      pgQuery: async (sql, extraArgs = []) => runPsql(pg.containerName, "g6_e2e_test", sql, "pg-query", extraArgs),
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
        CATALOG_TAXONOMY_URL: serviceUrls["taxonomy-svc"],
        CATALOG_BULK_CONTENTS_URL: serviceUrls["bulk-svc"],
        CATALOG_BULK_CONTENT_TOKEN_URL: g7.tokenUrl,
        CATALOG_BULK_CONTENT_CLIENT_SECRET: "e2e-catalog-secret",
        CATALOG_PREPARATION_TIMEOUT_MS: "100",
        CATALOG_DEFAULT_LOCATION_ID: "00000000-0000-4000-8000-000000000101",
        CATALOG_BULK_RESULT_V2_ENABLED: "true",
        CATALOG_SERVICE_TOKEN_URL: g7.tokenUrl,
        CATALOG_SERVICE_CLIENT_SECRET: "e2e-catalog-secret",
        MESSAGING_PROVIDER: "AZURE_SERVICE_BUS",
        CATALOG_H5_DESTINATIONS: "g6.bulk.from.catalog,g6.pricing.from.catalog,g6.inventory.from.catalog,g6.taxonomy.from.catalog,g6.promotions.from.catalog,g6.combos.from.catalog",
        G6_ISOLATED_SERVICE_BUS_URL: isolatedBus.baseUrl,
      },
      "taxonomy-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["taxonomy-svc"]),
        PGUSER: "taxonomy_app",
        DATABASE_URL: pg.urlFor("taxonomy_app"),
        G6_DATABASE_SCHEMA: "taxonomy",
        G6_EXPECTED_ROLE: "taxonomy_app",
        G6_CONNECTION_MODE: "direct",
        TAXONOMY_LOGO_DIRECTORY: taxonomyLogoDir,
        TAXONOMY_LOGO_PUBLIC_BASE_URL: "https://logos.isolated.test/",
        MESSAGING_PROVIDER: "AZURE_SERVICE_BUS",
        TAXONOMY_SERVICE_BUS_ENABLED: "true",
        TAXONOMY_SERVICE_BUS_SEND_ENABLED: "true",
        TAXONOMY_SERVICE_BUS_RECEIVE_ENABLED: "true",
        SERVICE_BUS_NAMESPACE_FQDN: "g6-taxonomy-local.servicebus.windows.net",
        G6_ISOLATED_SERVICE_BUS_URL: isolatedBus.baseUrl,
      },
      "pricing-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["pricing-svc"]),
        PGUSER: "pricing_app",
        DATABASE_URL: pg.urlFor("pricing_app"),
        PRICING_SERVICE_TOKEN_URL: g7.tokenUrl,
        PRICING_SERVICE_CLIENT_SECRET: "e2e-pricing-secret",
        PRICING_CATALOG_URL: serviceUrls["catalog-svc"],
        MESSAGING_PROVIDER: "AZURE_SERVICE_BUS",
        G6_SERVICE_BUS_PILOT_ENABLED: "true",
        PRICING_PRICE_CHANGED_PUBLISH_ENABLED: "true",
        G6_ISOLATED_SERVICE_BUS_URL: isolatedBus.baseUrl,
      },
      "price-audit-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["price-audit-svc"]),
        PGUSER: "price_audit_app",
        DATABASE_URL: pg.urlFor("price-audit-app".replaceAll("-", "_")),
        MESSAGING_PROVIDER: "AZURE_SERVICE_BUS",
        G6_SERVICE_BUS_PILOT_ENABLED: "true",
        G6_ISOLATED_SERVICE_BUS_URL: isolatedBus.baseUrl,
        AUDIT_EXPORT_DIRECTORY: mkdtempSync(join(tmpdir(), "g6-e2e-price-audit-exports-")),
      },
      "promotions-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["promotions-svc"]),
        NODE_EXTRA_CA_CERTS: g5Evidence.caCertPath,
        PGUSER: "promotions_app",
        G6_DATABASE_SCHEMA: "promotions",
        G6_CONNECTION_MODE: "session",
        MESSAGING_PROVIDER: "AZURE_SERVICE_BUS",
        PROMOTIONS_DEPENDENCY_PROBES_ENABLED: "true",
        PROMOTIONS_H5_COUPON_COMMANDS_ENABLED: "true",
        PROMOTIONS_H5_ISOLATED_BUS: "1",
        GATEWAY_CATALOG_SVC_URL: serviceUrls["catalog-svc"],
        GATEWAY_PRICING_SVC_URL: serviceUrls["pricing-svc"],
        GATEWAY_TAXONOMY_SVC_URL: serviceUrls["taxonomy-svc"],
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
        COMBOS_CATALOG_CONTEXT_AUTHORIZED: "true",
        COMBOS_ALLOWED_ROLES_LISTAR_COMBOS_ADMIN: "GESTOR_COMERCIAL",
        COMBOS_ALLOWED_ROLES_OBTENER_COMBO: "GESTOR_COMERCIAL",
        COMBOS_ALLOWED_ROLES_CONSULTAR_DISPONIBILIDAD_COMBO: "GESTOR_COMERCIAL",
        COMBOS_ALLOWED_ROLES_CREAR_COMBO: "GESTOR_COMERCIAL",
        COMBOS_ALLOWED_ROLES_ACTUALIZAR_COMBO: "GESTOR_COMERCIAL",
        COMBOS_ALLOWED_ROLES_DESACTIVAR_COMBO: "GESTOR_COMERCIAL",
        COMBOS_ALLOWED_CLIENTS_COMBOS_READ:
          "modulo-marketplace,modulo-chatbot,modulo-retail",
      },
      "inventory-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["inventory-svc"]),
        PGUSER: "inventory_app",
        G7_JWT_ISSUER: g7.issuer,
        G7_JWT_JWKS_URL: g7.jwksUrl,
        INVENTORY_G7_TRANSFER_GRANTS: JSON.stringify({
          [g7.gestorId]: ["INVENTARIO_TRASLADOS_LEER", "INVENTARIO_TRASLADOS_RECIBIR"],
        }),
        MESSAGING_PROVIDER: "AZURE_SERVICE_BUS",
        G6_SERVICE_BUS_PILOT_ENABLED: "true",
        INVENTORY_SERVICE_BUS_PUBLISH_ENABLED: "true",
        INVENTORY_SERVICE_BUS_CONSUME_ENABLED: "true",
        G6_ISOLATED_SERVICE_BUS_URL: isolatedBus.baseUrl,
      },
      "bulk-svc": {
        ...controlledBaseEnv,
        PORT: String(servicePorts["bulk-svc"]),
        PGUSER: "bulk_app",
        DATABASE_URL: pg.urlFor("bulk_app"),
        G7_JWT_ISSUER: g7.issuer,
        G7_JWT_JWKS_URL: g7.jwksUrl,
        INVENTORY_G7_TRANSFER_GRANTS: JSON.stringify({
          [g7.gestorId]: ["INVENTARIO_TRASLADOS_LEER", "INVENTARIO_TRASLADOS_RECIBIR"],
        }),
        MESSAGING_PROVIDER: "AZURE_SERVICE_BUS",
        G6_ISOLATED_SERVICE_BUS_URL: isolatedBus.baseUrl,
        SUPABASE_URL: isolatedBus.baseUrl,
        SUPABASE_SERVICE_ROLE_KEY: "e2e-bulk-storage-key",
        BULK_STORAGE_BUCKET: "bulk-e2e",
        BULK_CORRELATION_RECONCILIATION_ENABLED: "true",
        BULK_CATALOG_V3_ENABLED: "true",
        BULK_CATALOG_V3_AUTHORIZATION_VERIFIED: "true",
        BULK_RETRY_CATALOG_V1_ENABLED: "true",
        BULK_EXPORT_CATALOG_URL: serviceUrls["catalog-svc"],
        BULK_EXPORT_PRICING_URL: serviceUrls["pricing-svc"],
        BULK_EXPORT_INVENTORY_URL: serviceUrls["inventory-svc"],
        BULK_EXPORT_TOKEN_URL: g7.tokenUrl,
        BULK_EXPORT_CLIENT_SECRET: "e2e-bulk-secret",
        BULK_DEFAULT_LOCATION_ID: "00000000-0000-4000-8000-000000000101",
      },
    };

    const serviceLogs = new Map();
    for (const svc of SERVICE_NAMES) {
      const child = spawn(process.execPath, [`dist/apps/${svc}/main.js`], {
        cwd: backendRoot,
        env: perServiceEnv[svc],
        stdio: "pipe",
      });
      let buf = "";
      child.stdout.on("data", (d) => {
        const s = d.toString();
        buf = (buf + s).slice(-3000);
        if (process.env.G6_STACK_DEBUG === "1" && /error|fail|exception|not_ready|warn|no disponible|503|401|403/i.test(s)) {
          process.stderr.write(`[${svc} out] ${s}`);
        }
      });
      child.stderr.on("data", (d) => {
        const s = d.toString();
        buf = (buf + s).slice(-3000);
        if ((svc === "bulk-svc" || svc === "catalog-svc" || process.env.G6_STACK_DEBUG === "1") && /error|fail|exception/i.test(s)) {
          process.stderr.write(`[${svc} stderr] ${s}`);
        }
      });
      serviceLogs.set(svc, () => buf);
      children.push(child);
    }

    const gatewayPort = await reserveLocalPort();
    const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
    const gatewayChild = spawn(process.execPath, ["dist/apps/api-gateway/main.js"], {
        cwd: backendRoot,
        env: {
          ...controlledBaseEnv,
          PORT: String(gatewayPort),
          GATEWAY_CORS_ALLOWED_ORIGINS: viteOrigin,
          GATEWAY_INVENTORY_LOCAL_GRANTS_ENABLED: "true",
          GATEWAY_SERVICE_TOKEN_URL: g7.tokenUrl,
          GATEWAY_SERVICE_CLIENT_SECRET: "e2e-gateway-secret",
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
          GATEWAY_INVENTORY_SVC_READINESS_PATH: "/health/readiness",
          GATEWAY_BULK_SVC_READINESS_PATH: "/health/readiness",
        },
        stdio: "pipe",
      });
    gatewayChild.stdout.on("data", () => {});
    gatewayChild.stderr.on("data", () => {});
    children.push(gatewayChild);

    const READINESS_PATH_BY_SERVICE = {
      "inventory-svc": "/health/readiness",
      "bulk-svc": "/health/readiness",
    };
    for (const svc of SERVICE_NAMES) {
      try {
        const readinessPath = READINESS_PATH_BY_SERVICE[svc] ?? "/health/ready";
        await waitForHttpReady(`${serviceUrls[svc]}${readinessPath}`);
      } catch (err) {
        const logs = serviceLogs.get(svc)?.() ?? "";
        throw new Error(`SERVICE_NOT_READY(${svc}): ${(err).message}\n--- LOGS(${svc}) ---\n${logs}`);
      }
    }
    await waitForHttpReady(`${gatewayUrl}/health`);

    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(
        {
          gatewayUrl,
          catalogServiceUrl: serviceUrls["catalog-svc"],
          serviceUrls,
          isolatedBusUrl: isolatedBus.baseUrl,
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

    if (process.argv.includes("--no-vite")) {
      console.log("G6_STACK_READY");
      process.on("SIGINT", () => void cleanup().then(() => process.exit(0)));
      process.on("SIGTERM", () => void cleanup().then(() => process.exit(0)));
      await new Promise(() => {});
      return;
    }

    const vite = spawn(
      process.execPath,
      [resolve(process.cwd(), "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
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
