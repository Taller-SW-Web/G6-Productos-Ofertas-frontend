import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildAdminPerformanceCommand } from "./lib/admin-performance-command.mjs";

const playwrightCli = resolve(fileURLToPath(new URL("..", import.meta.url)), "node_modules/playwright/cli.js");
const scenario = process.argv.includes("--h5-perf06") ? "h5-perf06" : "legacy";
const command = buildAdminPerformanceCommand(scenario);
const result = spawnSync(process.execPath, [playwrightCli, ...command.args], {
  stdio: "inherit",
  env: { ...process.env, ...command.env, G6_PERF_HARNESS: "1" },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
