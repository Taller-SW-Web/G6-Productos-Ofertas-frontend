import http from 'node:http';
import net from 'node:net';

export function isAllowedLoopbackOrigin(value, allowlist) {
  try {
    const url = new URL(value);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    return url.protocol === 'http:' && loopback && allowlist.includes(url.origin);
  } catch {
    return false;
  }
}

export async function startLoopbackOnlyProxy(allowlist) {
  if (!Array.isArray(allowlist) || allowlist.length === 0 || allowlist.some(origin => !isAllowedLoopbackOrigin(origin, allowlist)))
    throw new Error('PERF06_PROXY_ALLOWLIST_INVALID');
  let deniedRequests = 0;
  let upstreamFailures = 0;

  const reject = response => {
    deniedRequests += 1;
    response.writeHead(403, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    response.end('blocked');
  };
  const server = http.createServer((incoming, outgoing) => {
    let target;
    try { target = new URL(incoming.url ?? ''); } catch { reject(outgoing); return; }
    if (!isAllowedLoopbackOrigin(target.origin, allowlist)) { reject(outgoing); return; }
    const upstream = http.request({
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: Number(target.port),
      method: incoming.method,
      path: `${target.pathname}${target.search}`,
      headers: { ...incoming.headers, host: target.host },
    }, response => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => {
      upstreamFailures += 1;
      if (!outgoing.headersSent) outgoing.writeHead(502, { 'cache-control': 'no-store' });
      outgoing.end();
    });
    incoming.pipe(upstream);
  });

  server.on('connect', (request, client, head) => {
    const targetOrigin = `https://${request.url}`;
    if (!isAllowedLoopbackOrigin(targetOrigin, allowlist)) {
      deniedRequests += 1;
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const target = new URL(targetOrigin);
    const upstream = net.connect(Number(target.port), target.hostname.replace(/^\[|\]$/g, ''), () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => {
      upstreamFailures += 1;
      client.destroy();
    });
  });

  server.on('upgrade', (request, client, head) => {
    let target;
    try {
      const absolute = request.url?.startsWith('ws://') ? request.url : `ws://${request.headers.host}${request.url}`;
      target = new URL(absolute);
    } catch { client.destroy(); deniedRequests += 1; return; }
    const httpOrigin = `http://${target.host}`;
    if (target.protocol !== 'ws:' || !isAllowedLoopbackOrigin(httpOrigin, allowlist)) {
      client.destroy();
      deniedRequests += 1;
      return;
    }
    const upstreamRequest = http.request({
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: Number(target.port),
      method: request.method,
      path: `${target.pathname}${target.search}`,
      headers: request.headers,
    });
    upstreamRequest.on('upgrade', (response, upstream, upstreamHead) => {
      const headerLines = Object.entries(response.headers).flatMap(([name, value]) => (Array.isArray(value) ? value.map(item => `${name}: ${item}`) : value ? [`${name}: ${value}`] : []));
      client.write(`HTTP/1.1 101 ${response.statusMessage ?? 'Switching Protocols'}\r\n${headerLines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      if (upstreamHead.length) client.write(upstreamHead);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstreamRequest.on('error', () => { upstreamFailures += 1; client.destroy(); });
    upstreamRequest.end();
  });

  await new Promise((resolve, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('PERF06_PROXY_BIND_FAILED');
  return Object.freeze({
    url: `http://127.0.0.1:${address.port}`,
    stats: () => ({ deniedRequests, upstreamFailures }),
    close: () => new Promise((resolve, rejectPromise) => server.close(error => error ? rejectPromise(error) : resolve())),
  });
}
