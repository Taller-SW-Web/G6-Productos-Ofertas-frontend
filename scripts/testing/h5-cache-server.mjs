import http from 'node:http';

let resourceRequests = 0;
const server = http.createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end('<!doctype html><html><body>H5 cache probe</body></html>');
    return;
  }
  if (request.url === '/resource.js') {
    resourceRequests += 1;
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=600', etag: '"h5-cache-probe-v1"' });
    response.end('globalThis.__H5_CACHE_PROBE__ = "synthetic";');
    return;
  }
  if (request.url === '/resource-count') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ resourceRequests }));
    return;
  }
  response.writeHead(404, { 'cache-control': 'no-store' });
  response.end();
});

const port = Number(process.env.G6_H5_CACHE_PORT ?? 5399);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('H5_CACHE_PORT_INVALID');
server.listen(port, '127.0.0.1');
