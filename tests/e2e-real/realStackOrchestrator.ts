import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import {
  assertRealStackPreflight,
  assertSafeLocalUrl,
  startLocalG7Server,
  verifyGatewayAndServicesReady,
  type LocalG7Server,
} from "./realStackPreflight.ts";

export interface OrchestratedStack {
  gatewayUrl: string;
  g7ApiBase: string;
  g7Issuer: string;
  g7JwksUrl: string;
  serviceUrls: Record<string, string>;
  stop: () => Promise<void>;
}

const SERVICE_NAMES = [
  "catalog-svc",
  "taxonomy-svc",
  "pricing-svc",
  "price-audit-svc",
  "promotions-svc",
  "combos-svc",
  "inventory-svc",
  "bulk-svc",
] as const;

async function reserveLocalPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
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

async function waitForHttpReady(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry until deadline
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`PREFLIGHT_BLOCKED: Servicio no respondió listo en ${url}`);
}

/**
 * Orquestador aislado para pruebas reales E2E (Windows PowerShell compatible).
 * Solo se invoca cuando el auditor autoriza ejecutar `playwright.real.config.ts`.
 * No se ejecuta durante la fase estática pre-pruebas.
 */
export async function startIsolatedRealStack(): Promise<OrchestratedStack> {
  const pgUrl = process.env.G6_REAL_PG_URL;
  if (!pgUrl) {
    throw new Error(
      "PREFLIGHT_BLOCKED: G6_REAL_PG_URL es obligatorio y debe apuntar a PostgreSQL local descartable.",
    );
  }
  assertSafeLocalUrl(pgUrl, "G6_REAL_PG_URL");

  const backendRoot = resolve(
    process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
  );
  const g7Server: LocalG7Server = await startLocalG7Server();
  const children: ChildProcess[] = [];

  try {
    const serviceUrls: Record<string, string> = {};
    const servicePorts: Record<string, number> = {};
    for (const svc of SERVICE_NAMES) {
      const port = await reserveLocalPort();
      servicePorts[svc] = port;
      serviceUrls[svc] = `http://127.0.0.1:${port}`;
    }
    const gatewayPort = await reserveLocalPort();
    const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;

    const sharedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "test",
      G6_SECURITY_MODE: "G7_AUTHENTICATED",
      GATEWAY_G5_H5_ENABLED: "true",
      AUTH_ISSUER: g7Server.issuer,
      AUTH_JWKS_URL: g7Server.jwksUrl,
      DATABASE_URL: pgUrl,
      CATALOG_DATABASE_URL: pgUrl,
      TAXONOMY_DATABASE_URL: pgUrl,
      PRICING_DATABASE_URL: pgUrl,
      PRICE_AUDIT_DATABASE_URL: pgUrl,
      PROMOTIONS_DATABASE_URL: pgUrl,
      COMBOS_DATABASE_URL: pgUrl,
      INVENTORY_DATABASE_URL: pgUrl,
      BULK_DATABASE_URL: pgUrl,
    };

    for (const svc of SERVICE_NAMES) {
      const child = spawn(
        process.execPath,
        ["dist/apps/" + svc + "/src/main.js"],
        {
          cwd: backendRoot,
          env: {
            ...sharedEnv,
            PORT: String(servicePorts[svc]),
          },
          stdio: "pipe",
        },
      );
      children.push(child);
    }

    const gatewayChild = spawn(
      process.execPath,
      ["dist/apps/api-gateway/src/main.js"],
      {
        cwd: backendRoot,
        env: {
          ...sharedEnv,
          PORT: String(gatewayPort),
          GATEWAY_CATALOG_SVC_URL: serviceUrls["catalog-svc"],
          GATEWAY_TAXONOMY_SVC_URL: serviceUrls["taxonomy-svc"],
          GATEWAY_PRICING_SVC_URL: serviceUrls["pricing-svc"],
          GATEWAY_PRICE_AUDIT_SVC_URL: serviceUrls["price-audit-svc"],
          GATEWAY_PROMOTIONS_SVC_URL: serviceUrls["promotions-svc"],
          GATEWAY_COMBOS_SVC_URL: serviceUrls["combos-svc"],
          GATEWAY_INVENTORY_SVC_URL: serviceUrls["inventory-svc"],
          GATEWAY_BULK_SVC_URL: serviceUrls["bulk-svc"],
        },
        stdio: "pipe",
      },
    );
    children.push(gatewayChild);

    for (const svc of SERVICE_NAMES) {
      await waitForHttpReady(`${serviceUrls[svc]}/health/ready`);
    }
    await waitForHttpReady(`${gatewayUrl}/health/ready`);

    process.env.VITE_DATA_MODE = "api";
    process.env.VITE_GATEWAY_ORIGIN = gatewayUrl;
    process.env.G6_REAL_GATEWAY_URL = gatewayUrl;
    process.env.VITE_G7_API_BASE = g7Server.baseUrl;
    process.env.G6_REAL_G7_ISSUER = g7Server.issuer;
    process.env.G6_REAL_G7_JWKS_URL = g7Server.jwksUrl;

    assertRealStackPreflight();
    await verifyGatewayAndServicesReady(gatewayUrl);

    return {
      gatewayUrl,
      g7ApiBase: g7Server.baseUrl,
      g7Issuer: g7Server.issuer,
      g7JwksUrl: g7Server.jwksUrl,
      serviceUrls,
      stop: async () => {
        for (const child of children) {
          child.kill("SIGTERM");
        }
        await g7Server.close();
      },
    };
  } catch (error) {
    for (const child of children) {
      child.kill("SIGTERM");
    }
    await g7Server.close();
    throw error;
  }
}
