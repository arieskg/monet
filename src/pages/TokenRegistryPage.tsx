import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Common";
import { TokenPreviewCard } from "../components/TokenPreview";
import type { TokenLevel, TokenType } from "../domain";
import { useWorkspace } from "../WorkspaceContext";

export function TokenRegistryPage() {
  const { workspace } = useWorkspace();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("token") ?? "");
  const [level, setLevel] = useState<TokenLevel | "all">("all");
  const [type, setType] = useState<TokenType | "all">("all");
  const tokens = useMemo(() => workspace?.resolvedTokens.filter((token) => (level === "all" || token.level === level) && (type === "all" || token.type === type) && `${token.name} ${token.description} ${token.alias ?? ""} ${token.value}`.toLowerCase().includes(query.toLowerCase())) ?? [], [workspace, query, level, type]);
  if (!workspace) return null;
  const types = [...new Set(workspace.resolvedTokens.map((token) => token.type))];
  return <div className="page token-registry-page"><PageHeader eyebrow="Machine-readable values" title="Token Registry" description="One aggregate view over the canonical token records maintained inside Foundations." action={<span className="registry-count">{tokens.length} of {workspace.resolvedTokens.length}</span>} />
    <div className="registry-toolbar"><input aria-label="Filter tokens" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by name, value, or description" /><select aria-label="Token level" value={level} onChange={(event) => setLevel(event.target.value as TokenLevel | "all")}><option value="all">All levels</option><option value="primitive">Primitive</option><option value="semantic">Semantic</option><option value="component">Component</option></select><select aria-label="Token type" value={type} onChange={(event) => setType(event.target.value as TokenType | "all")}><option value="all">All types</option>{types.map((item) => <option key={item}>{item}</option>)}</select></div>
    {workspace.tokenIssues.length > 0 && <section className="registry-warnings"><span className="eyebrow">Validation</span><h2>{workspace.tokenIssues.length} token {workspace.tokenIssues.length === 1 ? "issue" : "issues"}</h2>{workspace.tokenIssues.map((issue) => <Link to={`/foundations/${workspace.resolvedTokens.find((token) => token.name === issue.token)?.foundation ?? ""}`} key={`${issue.type}-${issue.token}`}><b>{issue.token}</b><span>{issue.message}</span></Link>)}</section>}
    <div className="registry-grid">{tokens.map((token) => <Link className="registry-link" to={`/foundations/${token.foundation}`} key={token.id}><TokenPreviewCard token={token} /></Link>)}</div>
  </div>;
}
