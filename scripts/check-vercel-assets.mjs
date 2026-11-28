// Isolated HTTP model using Vercel's official route conversion. No deployment.
// Run with npm exec --package=@vercel/routing-utils@6.6.1 -- node scripts/check-vercel-assets.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { createRequire } from "node:module";

const packageRoot = process.env.PATH.split(delimiter)
  .map(path => resolve(path, "../@vercel/routing-utils"))
  .find(path => existsSync(resolve(path, "package.json")));
assert.ok(packageRoot, "Run with the pinned @vercel/routing-utils package.");
const require = createRequire(import.meta.url);
const { getTransformedRoutes } = require(packageRoot);
const config = JSON.parse(await readFile("vercel.json", "utf8"));
const converted = getTransformedRoutes(config);
assert.equal(converted.error, null);
const fallback = converted.routes.find(route => route.dest === "/index.html");
assert.ok(fallback, "The official converter must retain the SPA fallback.");
const navigation = new RegExp(fallback.src);
const js = (await readdir("dist/assets")).find(file => file.endsWith(".js"));
assert.ok(js, "Build the application before validating its assets.");
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  for (const route of converted.routes) {
    if (route.headers && new RegExp(route.src).test(path)) {
      for (const [key, value] of Object.entries(route.headers)) response.setHeader(key, value);
    }
  }
  let file = resolve("dist", `.${path}`);
  if (!existsSync(file) && navigation.test(path)) file = resolve("dist/index.html");
  try {
    const content = await readFile(file);
    response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8");
    response.end(content);
  } catch { response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/inventario/umbrales", "/precios"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.match(await response.text(), /<script[^>]+src="\/assets\/.+\.js"/);
  }
  const asset = await fetch(`${base}/assets/${js}`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  assert.doesNotMatch((await asset.text()).slice(0, 100), /<!doctype html/i);
  const missing = await fetch(`${base}/assets/Missing-previous-version.js`);
  assert.equal(missing.status, 404);
  assert.doesNotMatch(missing.headers.get("content-type"), /html/);
  assert.doesNotMatch(await missing.text(), /<html|<!doctype/i);
  console.log("PASS: official Vercel route conversion; 2 deep routes HTML/no-store; hashed JS/MIME/immutable; absent chunk 404 without HTML. Local HTTP fixture only.");
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
