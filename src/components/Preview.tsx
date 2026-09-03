import type { Candidate } from "../domain";
import { RegisteredPreview } from "./previewAdapters";

const sourceClass: Record<string, string> = {
  "github-primer": "primer preview-source-primer",
  "material-ui": "material preview-source-material",
  "shadcn": "shadcn preview-source-shadcn",
  "shopify-polaris": "polaris preview-source-polaris",
  "ibm-carbon": "carbon preview-source-carbon",
  "ant-design": "preview-source-ant",
  "mantine": "preview-source-mantine",
  "react-aria": "preview-source-react-aria",
  "atlassian-design": "preview-source-atlassian",
  "chakra-ui": "preview-source-chakra",
};

export function ComponentPreview({ componentId, candidate, large = false }: { componentId: string; candidate?: Candidate; large?: boolean }) {
  const theme = candidate ? sourceClass[candidate.source] ?? "monet" : "monet";
  const className = `candidate-demo component-preview ${theme} ${large ? "large" : ""}`;
  return <div className={className}><RegisteredPreview componentId={componentId} sourceId={candidate?.source} /></div>;
}

export function CandidatePreview({ componentId, candidate }: { componentId: string; candidate: Candidate }) {
  const className = `candidate-demo ${sourceClass[candidate.source] ?? "reference"}`;
  if (candidate.preview === "snippet" && candidate.snippet) return <div className={`${className} snippet-preview`}><span>{candidate.language ?? "text"}</span><pre><code>{candidate.snippet}</code></pre></div>;
  return <ComponentPreview componentId={componentId} candidate={candidate} />;
}
