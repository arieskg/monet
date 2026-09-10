import type { IncomingMessage } from "node:http";

/** One browser boundary for every API, including read endpoints exposing private evidence. */
export function protectApi(request: IncomingMessage): void {
  const host = request.headers.host ?? "";
  const origin = request.headers.origin;
  const editor = process.env.MONET_EDITOR_ORIGIN ?? "http://127.0.0.1:43140";
  const local = /^(127\.0\.0\.1|localhost):\d+$/.test(host);
  if (!local || request.headers["sec-fetch-site"] === "cross-site" || origin && ![editor, `http://${host}`].includes(origin)) {
    throw Object.assign(new Error("Monet only accepts requests from this editor origin and a loopback Host."), { status: 403 });
  }
  // Empty native-client commands remain compatible. Browser mutations always require JSON.
  const mutation = !["GET", "HEAD"].includes(request.method ?? "");
  const hasBody = request.headers["transfer-encoding"] || Number(request.headers["content-length"] ?? 0) > 0;
  if (mutation && (origin || hasBody) && request.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
    throw Object.assign(new Error("Monet mutations require application/json."), { status: 415 });
  }
}
