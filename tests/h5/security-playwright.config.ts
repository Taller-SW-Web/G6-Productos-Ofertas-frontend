import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";
export default defineConfig(base, {
  testDir: ".",
  testMatch: "security-boundary.spec.ts",
  use: { ...base.use, trace: "off", screenshot: "off", video: "off" },
});
