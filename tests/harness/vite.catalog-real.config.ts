import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const gateway = process.env.CATALOG_REAL_GATEWAY_ORIGIN;
if (!gateway) throw new Error("CATALOG_REAL_GATEWAY_ORIGIN es obligatorio.");
const target = new URL(gateway);
if (target.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || target.username || target.password || target.pathname !== "/") throw new Error("Proxy de prueba permitido solo hacia Gateway HTTP loopback.");

const catalogHttpBridge = {
  name: "catalog-http-real-test-bridge",
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use((request, response, next) => {
      if (!request.url?.startsWith("/api/v1/")) return next();
      void (async () => {
        try {
          const body: Buffer[] = [];
          const method = request.method ?? "GET";
          if (method !== "GET" && method !== "HEAD")
            for await (const chunk of request) body.push(Buffer.from(chunk));
          const headers = new Headers();
          for (const name of ["authorization", "content-type", "x-correlation-id", "retry-after"]) {
            const value = request.headers[name];
            if (typeof value === "string") headers.set(name, value);
          }
          const upstream = await fetch(new URL(request.url!, target.origin), {
            method,
            headers,
            redirect: "manual",
            signal: AbortSignal.timeout(30_000),
            ...(method === "GET" || method === "HEAD" || body.length === 0 ? {} : { body: Buffer.concat(body) }),
          });
          response.statusCode = upstream.status;
          for (const name of ["content-type", "x-correlation-id", "retry-after", "cache-control"]) {
            const value = upstream.headers.get(name);
            if (value) response.setHeader(name, value);
          }
          response.end(Buffer.from(await upstream.arrayBuffer()));
        } catch {
          response.statusCode = 502;
          response.setHeader("content-type", "application/problem+json");
          response.end(JSON.stringify({ code: "LOCAL_E2E_GATEWAY_UNAVAILABLE" }));
        }
      })();
    });
  },
};

export default defineConfig({
  plugins: [react(), catalogHttpBridge],
  server: { host: "127.0.0.1", strictPort: true },
});
