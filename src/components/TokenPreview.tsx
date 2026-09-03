import type { CSSProperties } from "react";
import type { ResolvedToken, Token } from "../domain";

export function TokenVisual({ token, resolved }: { token: Token; resolved?: string | number | null }) {
  const value = resolved ?? token.value;
  const stringValue = String(value);
  let style: CSSProperties | undefined;
  let content = "";
  if (token.type === "color") style = { background: stringValue };
  if (token.type === "dimension" || token.type === "breakpoint") style = token.name.includes("radius") ? { borderRadius: stringValue } : { width: stringValue };
  if (token.type === "shadow") style = { boxShadow: stringValue };
  if (token.type === "border") style = { border: stringValue };
  if (token.type === "font-family") { style = { fontFamily: stringValue }; content = "Ag"; }
  if (token.type === "font-size") { style = { fontSize: stringValue }; content = "Ag"; }
  if (token.type === "font-weight") { style = { fontWeight: stringValue }; content = "Ag"; }
  if (token.type === "number" && token.name.includes("opacity")) style = { opacity: Number(value) };
  if (token.type === "z-index") content = String(value);
  if (token.type === "duration" || token.type === "cubic-bezier") content = "→";
  return <span className={`token-visual type-${token.type}`} style={style}>{content}</span>;
}

export function TokenPreviewCard({ token }: { token: ResolvedToken }) {
  return <article className={`registry-token ${token.valid ? "" : "invalid"}`}><TokenVisual token={token} resolved={token.resolved_value} /><div><span><b>{token.name}</b><i>{token.level}</i></span><code>{String(token.value)}</code>{String(token.value) !== String(token.resolved_value) && token.resolved_value !== null && <small>Resolves to {String(token.resolved_value)}</small>}{token.modes?.dark !== undefined && <small>Dark: {String(token.modes.dark)}</small>}<p>{token.description || `${token.type} token`}</p></div></article>;
}
