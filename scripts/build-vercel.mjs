import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const defaults = {
  VITE_DATA_MODE: "api",
  VITE_GATEWAY_ORIGIN: "https://api-gateway.calmgrass-aec0b33c.chilecentral.azurecontainerapps.io",
  VITE_G7_API_BASE: "https://g7-auth-service.onrender.com/api/v1",
  VITE_G6_READ_DEMO: "false",
};

export function vercelBuildEnvironment(environment) {
  const configured = { ...environment };
  for (const [name, value] of Object.entries(defaults)) configured[name] ??= value;
  return configured;
}

export function buildVercel(environment = process.env, run = spawnSync) {
  // A constant command works with npm on Linux and npm.cmd on Windows.
  // Environment values are passed separately, never interpolated into the shell.
  const result = run("npm run build", {
    env: vercelBuildEnvironment(environment),
    stdio: "inherit",
    shell: true,
  });
  if (result.error) console.error("No se pudo iniciar el build de Vercel.");
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = buildVercel();
}
