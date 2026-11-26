import { rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { startIsolatedRealStack } from "./realStackOrchestrator.ts";
import { REAL_STACK_MANIFEST_PATH } from "./realStackPreflight.ts";

async function main() {
  const port = Number(process.env.PLAYWRIGHT_REAL_PORT ?? 4173);
  const stack = await startIsolatedRealStack();

  writeFileSync(
    REAL_STACK_MANIFEST_PATH,
    JSON.stringify(
      {
        gatewayUrl: stack.gatewayUrl,
        g7ApiBase: stack.g7ApiBase,
        databaseUrl: process.env.G6_REAL_PG_URL,
        g7Issuer: stack.g7Issuer,
        g7JwksUrl: stack.g7JwksUrl,
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
        ...process.env,
        VITE_DATA_MODE: "api",
        VITE_G6_ADMIN_API_ENABLED: "true",
        VITE_GATEWAY_ORIGIN: stack.gatewayUrl,
        VITE_G7_API_BASE: stack.g7ApiBase,
      },
    },
  );

  const cleanup = async () => {
    vite.kill("SIGTERM");
    await stack.stop();
    rmSync(REAL_STACK_MANIFEST_PATH, { force: true });
  };

  process.on("SIGINT", () => void cleanup().then(() => process.exit(0)));
  process.on("SIGTERM", () => void cleanup().then(() => process.exit(0)));
  vite.on("exit", (code) => {
    void cleanup().then(() => process.exit(code ?? 0));
  });
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
