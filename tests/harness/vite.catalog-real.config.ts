import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const gatewayOrigin = process.env.CATALOG_REAL_GATEWAY_ORIGIN;
if (gatewayOrigin) {
  const target = new URL(gatewayOrigin);
  if (
    target.protocol !== "http:" ||
    target.hostname !== "127.0.0.1" ||
    !target.port
  )
    throw new Error("CATALOG_REAL_GATEWAY_ORIGIN_MUST_BE_LOOPBACK_HTTP");
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    strictPort: true,
    hmr: false,
    ...(gatewayOrigin
      ? { proxy: { "/api/v1": { target: gatewayOrigin, changeOrigin: false } } }
      : {}),
  },
});
