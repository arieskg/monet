import { createServer } from "node:http";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

/**
 * A throwaway loopback file server for capturing a static or built project without running any
 * project code in Node. It serves regular files beneath one directory, refuses traversal and
 * symlink escapes, lists nothing, and exists only for the duration of one capture.
 */
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".map": "application/json", ".webmanifest": "application/manifest+json", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg" };
const MAX_FILE = 16 * 1024 * 1024;

export interface StaticServer { origin: string; port: number; close: () => Promise<void> }

export async function startStaticServer(projectRoot: string, directory: string): Promise<StaticServer> {
  const root = await realpath(projectRoot);
  if (directory.split(/[\\/]/).some((p) => p === "..") || path.isAbsolute(directory)) throw Object.assign(new Error("Static directory must be relative to the project."), { status: 400 });
  const base = await realpath(path.join(root, directory));
  if (base !== root && !base.startsWith(root + path.sep)) throw Object.assign(new Error("Static directory escapes the project root."), { status: 400 });
  const index = path.join(base, "index.html");
  const spa = await lstat(index).then((s) => s.isFile(), () => false);
  async function resolve(pathname: string): Promise<{ file: string; type: string } | null> {
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); } catch { return null; }
    // No traversal, and no dotfiles: `.env`, `.git` and similar never reach the capture browser.
    if (decoded.includes("\0") || decoded.split("/").some((p) => p === ".." || p.startsWith(".") && p !== ".well-known")) return null;
    const candidates = [decoded.endsWith("/") ? decoded + "index.html" : decoded];
    // Clean URLs for static pages (`/about` → about.html, `/docs` → docs/index.html), then the history
    // fallback for client-side routes: extension-less paths without a trailing slash only.
    if (!path.extname(decoded) && !decoded.endsWith("/")) { candidates.push(decoded + ".html", decoded + "/index.html"); if (spa) candidates.push("/index.html"); }
    for (const candidate of candidates) {
      const target = path.join(base, candidate);
      if (target !== base && !target.startsWith(base + path.sep)) continue;
      let real: string; try { real = await realpath(target); } catch { continue; }
      if (real !== base && !real.startsWith(base + path.sep)) continue;
      const stat = await lstat(real).catch(() => null);
      if (!stat?.isFile() || stat.size > MAX_FILE) continue;
      return { file: real, type: TYPES[path.extname(real).toLowerCase()] ?? "application/octet-stream" };
    }
    return null;
  }
  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host ?? "";
      if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host) || request.method !== "GET" && request.method !== "HEAD") { response.writeHead(403); response.end(); return; }
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const found = await resolve(url.pathname);
      if (!found) { response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }); response.end("Not found"); return; }
      const contents = await readFile(found.file);
      response.writeHead(200, { "content-type": found.type, "content-length": contents.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : contents);
    } catch { response.writeHead(500); response.end(); }
  });
  server.requestTimeout = 10_000; server.headersTimeout = 5_000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { origin: `http://127.0.0.1:${port}`, port, close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
