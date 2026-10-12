import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolveDataMode } from "./src/app/config/dataMode.ts";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (command === "build")
    resolveDataMode(process.env.VITE_DATA_MODE ?? env.VITE_DATA_MODE, false);
  return { plugins: [react()] };
});
