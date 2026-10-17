import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolveDataMode } from "./src/app/config/dataMode.ts";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (command === "build")
    resolveDataMode(process.env.VITE_DATA_MODE ?? env.VITE_DATA_MODE, false);
  const demo =
    process.env.VITE_G6_READ_DEMO ?? env.VITE_G6_READ_DEMO ?? "false";
  if (!["true", "false"].includes(demo))
    throw new Error("VITE_G6_READ_DEMO debe ser true/false.");
  if (
    demo === "true" &&
    (process.env.VITE_DATA_MODE ?? env.VITE_DATA_MODE) !== "api"
  )
    throw new Error("La demo de lectura real requiere VITE_DATA_MODE=api.");
  const target =
    process.env.G6_DEMO_GATEWAY_TARGET ??
    "https://g6-productos-ofertas.duckdns.org";
  const origin = new URL(target);
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(origin.hostname)
      ))
  )
    throw new Error(
      "G6_DEMO_GATEWAY_TARGET debe ser un origen HTTPS o loopback HTTP.",
    );
  return {
    plugins: [react()],
    server: {
      proxy:
        demo === "true"
          ? { "/api/v1": { target: origin.origin, changeOrigin: true } }
          : undefined,
    },
  };
});
