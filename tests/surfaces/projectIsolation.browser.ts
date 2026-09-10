import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { createSocket } from "node:dgram";
import { captureBusy, captureScreen } from "../../server/projectCapture.js";
import { sanitizeSurface, renderSurface } from "../../server/surfaceSanitizer.js";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as { port: number }).port;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test("capture blocks redirects, direct alternate-port requests and WebRTC UDP", async () => {
  const hits: string[] = [], packets: number[] = [];
  const sink = createServer((req, res) => { hits.push(req.url!); res.setHeader("Access-Control-Allow-Origin", "*"); res.end("outside application"); });
  const sinkPort = await listen(sink);
  const udp = createSocket("udp4");
  await new Promise<void>((resolve) => udp.bind(0, "127.0.0.1", resolve));
  udp.on("message", (bytes) => packets.push(bytes.length));
  const udpPort = udp.address().port;
  const app = createServer((req, res) => {
    if (req.url === "/redirect") { res.writeHead(302, { location: `http://127.0.0.1:${sinkPort}/redirect-leak` }); res.end(); return; }
    if (req.url === "/redirect-integer") { res.writeHead(307, { location: `http://2130706433:${sinkPort}/integer-redirect` }); res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(`<html><body><h1>App</h1><script>
      fetch('/redirect').catch(()=>{});
      fetch('/redirect-integer', {method:'POST',body:'secret'}).catch(()=>{});
      fetch('http://127.0.0.1:${sinkPort}/direct').catch(()=>{});
      fetch('http://2130706433:${sinkPort}/integer').catch(()=>{});
      fetch('http://user:secret@127.0.0.1:${sinkPort}/credentials').catch(()=>{});
      fetch('http://localhost.:${sinkPort}/trailing-dot').catch(()=>{});
      fetch('https://127.0.0.1:${sinkPort}/tls').catch(()=>{});
      try { new WebSocket('ws://127.0.0.1:${sinkPort}/socket') } catch {}
      try { navigator.serviceWorker.register('/worker.js') } catch {}
      window.open('http://127.0.0.1:${sinkPort}/popup');
      try { window.pc = new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:${udpPort}'}]}); pc.createDataChannel('probe'); pc.createOffer().then(o=>pc.setLocalDescription(o)); } catch {}
    </script></body></html>`);
  });
  const port = await listen(app);
  try {
    await captureScreen({ url: `http://127.0.0.1:${port}/`, port, width: 800, height: 600, mode: "light", strategy: "auto" });
    expect({ hits, packets }).toEqual({ hits: [], packets: [] });
  } finally { await close(app); await close(sink); udp.close(); }
});

test("capture proxy does not treat IPv6 on the same port as the selected IPv4 application", async () => {
  const hits: string[] = [];
  const app = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end(`<html><body>App<script>fetch('http://[::1]:${port}/other-app').catch(()=>{})</script></body></html>`); });
  const port = await listen(app);
  const ipv6 = createServer((req, res) => { hits.push(req.url!); res.end("Other local app"); });
  await new Promise<void>((resolve, reject) => { ipv6.once("error", reject); ipv6.listen(port, "::1", resolve); });
  try {
    await captureScreen({ url: `http://127.0.0.1:${port}/`, port, width: 800, height: 600, mode: "light", strategy: "auto" });
    expect(hits).toEqual([]);
    const v6 = await captureScreen({ url: `http://[::1]:${port}/`, port, width: 800, height: 600, mode: "light", strategy: "auto" });
    expect(v6.html).toContain("Other local app");
  } finally { await close(app); await close(ipv6); }
});

test("capture reports layer loss and preserves stylesheet media and dark appearance", async ({ page }) => {
  const app = createServer((req, res) => {
    if (req.url === "/light.css") { res.setHeader("Content-Type", "text/css"); res.end("body{background-color:rgb(255, 0, 0)}"); return; }
    res.setHeader("Content-Type", "text/html"); res.end('<html><head><style>@layer low {body{color:blue}}body{color:red;background-color:black}</style><link rel="stylesheet" href="/light.css" media="(prefers-color-scheme:light)"></head><body><svg width="10" height="10"></svg>Dark page</body></html>');
  });
  const port = await listen(app);
  try {
    const raw = await captureScreen({ url: `http://127.0.0.1:${port}/`, port, width: 800, height: 600, mode: "dark", strategy: "auto" });
    expect(raw.stylesheet_lossy).toBe(true);
    expect(raw.warnings.join(" ")).toMatch(/placeholders/);
    const snapshot = await sanitizeSurface({ title: "Media", context: "", html: raw.html, css: raw.css, width: 800, height: 600, mode: "dark", assets: [] });
    await page.setContent(renderSurface(snapshot).document);
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  } finally { await close(app); }
});

test("a hung renderer hits the capture deadline, rejects concurrent work and releases the slot", async () => {
  test.setTimeout(85_000);
  const app = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end('<html><body>Hung<script>setTimeout(()=>{while(true){}}, 100)</script></body></html>'); });
  const port = await listen(app), target = { url: `http://127.0.0.1:${port}/`, port, width: 800, height: 600, mode: "light" as const, strategy: "auto" as const };
  try {
    const started = Date.now();
    const running = captureScreen(target);
    await expect(captureScreen(target)).rejects.toMatchObject({ status: 429 });
    await expect(running).rejects.toMatchObject({ status: 504 });
    expect(Date.now() - started).toBeLessThan(75_000);
    expect(captureBusy()).toBe(false);
  } finally { await close(app); }
});

test("computed capture preserves zero margins and resets inherited normal text", async ({ page }) => {
  const app = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end('<html><body style="margin:0;font-style:italic"><p style="font-style:normal">Normal text</p></body></html>'); });
  const port = await listen(app);
  try {
    const raw = await captureScreen({ url: `http://127.0.0.1:${port}/`, port, width: 800, height: 600, mode: "light", strategy: "computed" });
    const snapshot = await sanitizeSurface({ title: "Computed", context: "", html: raw.computed_html, css: "", width: 800, height: 600, mode: "light", assets: [] });
    await page.setContent(renderSurface(snapshot).document);
    await expect(page.locator("body")).toHaveCSS("margin-top", "0px");
    await expect(page.locator("p")).toHaveCSS("font-style", "normal");
  } finally { await close(app); }
});
