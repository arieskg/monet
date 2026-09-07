/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Environment } from "./api";
import { applyAppearance, readAppearance, resolveAppearance, writeAppearance, type Appearance, type ResolvedAppearance } from "./appearance";
import type { Workspace } from "./domain";

interface WorkspaceState {
  workspace: Workspace | null;
  /** Null until the file service answers, and after a service that predates the route. */
  environment: Environment | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  appearance: Appearance;
  resolvedAppearance: ResolvedAppearance;
  setAppearance: (value: Appearance) => void;
}
const WorkspaceContext = createContext<WorkspaceState | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [appearance, setAppearanceState] = useState<Appearance>(() => readAppearance());
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  const reload = useCallback(async () => {
    setError("");
    try {
      // The environment is informational, so a failure there must not block the workspace.
      const [next, running] = await Promise.all([api.workspace(), api.environment().catch(() => null)]);
      setWorkspace(next);
      setEnvironment(running);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load Monet."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => { applyAppearance(appearance, document.documentElement); }, [appearance]);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_QUERY);
    const listen = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener("change", listen);
    return () => query.removeEventListener("change", listen);
  }, []);

  const setAppearance = useCallback((value: Appearance) => { writeAppearance(value); setAppearanceState(value); }, []);
  const resolvedAppearance = resolveAppearance(appearance, prefersDark);
  const value = useMemo(
    () => ({ workspace, environment, loading, error, reload, appearance, resolvedAppearance, setAppearance }),
    [workspace, environment, loading, error, reload, appearance, resolvedAppearance, setAppearance],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is missing.");
  return value;
}
