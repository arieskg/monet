import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ErrorState } from "./components/Common";
import { featureVisibility } from "./featureVisibility";
import { useWorkspace } from "./WorkspaceContext";

const OverviewPage = lazy(() => import("./pages/OverviewPage").then((module) => ({ default: module.OverviewPage })));
const PrinciplesPage = lazy(() => import("./pages/DocumentPages").then((module) => ({ default: module.PrinciplesPage })));
const PatternsPage = lazy(() => import("./pages/DocumentPages").then((module) => ({ default: module.PatternsPage })));
const FoundationsPage = lazy(() => import("./pages/FoundationsPage").then((module) => ({ default: module.FoundationsPage })));
const TokenRegistryPage = lazy(() => import("./pages/TokenRegistryPage").then((module) => ({ default: module.TokenRegistryPage })));
const PrimitivesPage = lazy(() => import("./pages/PrimitivesPage").then((module) => ({ default: module.PrimitivesPage })));
const ComponentsPage = lazy(() => import("./pages/ComponentsPage").then((module) => ({ default: module.ComponentsPage })));
const ThemesPage = lazy(() => import("./pages/ThemesPage").then((module) => ({ default: module.ThemesPage })));
const SourcesPage = lazy(() => import("./pages/SourcesPage").then((module) => ({ default: module.SourcesPage })));
const ReviewQueuePage = lazy(() => import("./pages/NeedReviewPage").then((module) => ({ default: module.ReviewQueuePage })));
const DecisionsPage = lazy(() => import("./pages/DecisionsPage").then((module) => ({ default: module.DecisionsPage })));
const ExportPage = lazy(() => import("./pages/ExportPage").then((module) => ({ default: module.ExportPage })));
const PreviewPage = lazy(() => import("./pages/PreviewPage").then((module) => ({ default: module.PreviewPage })));
const ReferencesPage = lazy(() => import("./pages/ReferencesPage").then((module) => ({ default: module.ReferencesPage })));
const SurfacesPage = lazy(() => import("./pages/SurfacesPage").then((module) => ({ default: module.SurfacesPage })));
const GapsPage = lazy(() => import("./pages/GapsPage").then((module) => ({ default: module.GapsPage })));
const ProposalPage = lazy(() => import("./pages/ProposalPage").then((module) => ({ default: module.ProposalPage })));
const AgentContextPage = lazy(() => import("./pages/AgentContextPage").then((module) => ({ default: module.AgentContextPage })));
const SettingsPage = lazy(() => import("./pages/UtilityPages").then((module) => ({ default: module.SettingsPage })));

function BootState({ children }: { children: ReactNode }) {
  return <div className="boot-state"><img className="brand-mark" src="/monet-logo.png" alt="" />{children}</div>;
}

export default function App() {
  const { workspace, loading, error, reload } = useWorkspace();
  if (loading) return <BootState><b>Monet</b><p>Reading design-system files…</p></BootState>;
  if (error || !workspace) return <BootState><ErrorState message={error} retry={() => void reload()} /></BootState>;
  return <Suspense fallback={<div className="route-loading" role="status"><i aria-hidden="true" /><span>Opening…</span></div>}><Routes><Route element={<Layout />}><Route index element={<OverviewPage />} /><Route path="preview/:view?" element={<PreviewPage />} /><Route path="principles/:id?" element={<PrinciplesPage />} /><Route path="foundations/:id?" element={<FoundationsPage />} />{featureVisibility.tokenRegistry && <Route path="tokens" element={<TokenRegistryPage />} />}{featureVisibility.primitives && <Route path="primitives/:id?" element={<PrimitivesPage />} />}<Route path="components/:id?" element={<ComponentsPage />} /><Route path="patterns/:id?" element={<PatternsPage />} /><Route path="themes" element={<ThemesPage />} /><Route path="review" element={<Navigate to="/sources/review" replace />} /><Route path="sources/review" element={<ReviewQueuePage />} /><Route path="sources/:id?" element={<SourcesPage />} /><Route path="references/:id?" element={<ReferencesPage />} /><Route path="surfaces/:id?" element={<SurfacesPage />} /><Route path="gaps/:id?" element={<GapsPage />} /><Route path="proposals/:id" element={<ProposalPage />} /><Route path="proposals" element={<Navigate to="/gaps" replace />} /><Route path="agent" element={<AgentContextPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="decisions" element={<DecisionsPage />} /><Route path="export" element={<ExportPage />} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes></Suspense>;
}
