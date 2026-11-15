import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const playwrightCli = resolve(fileURLToPath(new URL("..", import.meta.url)), "node_modules/playwright/cli.js");
const result = spawnSync(process.execPath, [playwrightCli,
  "test", "tests/admin-performance.spec.ts",
  "--grep", "benchmark opt-in", "--workers=1", "--reporter=line",
], { stdio: "inherit", env: { ...process.env, G6_PERF_HARNESS: "1" } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
