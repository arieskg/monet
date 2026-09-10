import { createServer, request as forward, type IncomingHttpHeaders } from "node:http";
import { loopbackOrigin } from "../shared/projects.js";

/** Browser interception misses redirect hops. Enforce the destination again at the socket boundary.
 * Resolve localhost ourselves to loopback; never delegate target DNS or forward CONNECT tunnels.
 */
export async function startCaptureProxy(targetUrl: string, blocked: (url: string) => void) {
  const target = loopbackOrigin(targetUrl);
  const server = createServer((req, res) => {
    let url: URL;
    try { url = new URL(req.url ?? ""); } catch { res.writeHead(403).end(); return; }
    if (url.protocol !== "http:" || url.username || url.password || url.hostname !== target.hostname || Number(url.port || 80) !== target.port) {
      blocked(url.href); res.writeHead(403).end(); return;
    }
    const headers: IncomingHttpHeaders = { ...req.headers, host: url.host };
    delete headers["proxy-authorization"]; delete headers["proxy-connection"];
    const upstream = forward({ hostname: target.hostname === "[::1]" ? "::1" : "127.0.0.1", port: target.port, method: req.method, path: url.pathname + url.search, headers }, (reply) => {
      reply.on("error", () => res.destroy());
      res.writeHead(reply.statusCode ?? 502, reply.headers); reply.pipe(res);
    });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    res.on("close", () => upstream.destroy());
    req.on("error", () => upstream.destroy());
    req.pipe(upstream);
  });
  // HMR is unnecessary for a snapshot. No WebSocket or arbitrary TCP tunnel is opened.
  server.on("connect", (req, socket) => { blocked(`connect://${req.url}`); socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); });
  server.on("upgrade", (req, socket) => { blocked(req.url ?? "websocket:"); socket.destroy(); });
  server.requestTimeout = 10_000; server.headersTimeout = 5_000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = (server.address() as { port: number }).port;
  return { server: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
