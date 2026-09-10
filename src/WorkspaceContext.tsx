/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, type Environment } from "./api";
import type { ApplyResult } from "../shared/proposals";
import { applyAppearance, readAppearance, resolveAppearance, writeAppearance, type Appearance, type ResolvedAppearance } from "./appearance";
import type { Workspace } from "./domain";

interface WorkspaceState {
  workspace: Workspace | null;
  /** Null until the file service answers, and after a service that predates the route. */
  environment: Environment | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  editingBlocked: boolean;
  applyApprovedProposal: (id: string, approval: { revision: number; hash: string }) => Promise<ApplyResult>;
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
  const [editingBlocked, setEditingBlocked] = useState(false);
  const requestVersion = useRef(0);
  const applying = useRef(false);
  const [appearance, setAppearanceState] = useState<Appearance>(() => readAppearance());
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  const fetchWorkspace = useCallback(async (): Promise<boolean> => {
    if (applying.current) return false;
    const version = ++requestVersion.current;
    setError("");
    try {
      // The environment is informational, so a failure there must not block the workspace.
      const [next, running] = await Promise.all([api.workspace(), api.environment().catch(() => null)]);
      if (version !== requestVersion.current) return false;
      setWorkspace(next);
      setEnvironment(running);
      setEditingBlocked(false);
      return true;
    } catch (caught) { if (version === requestVersion.current) setError(caught instanceof Error ? caught.message : "Unable to load Monet."); return false; }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, []);
  const reload = useCallback(async () => { await fetchWorkspace(); }, [fetchWorkspace]);
  useEffect(() => { void reload(); }, [reload]);

  const applyApprovedProposal = useCallback(async (id: string, approval: { revision: number; hash: string }): Promise<ApplyResult> => {
    if (applying.current) throw new Error("An application is already in progress.");
    applying.current = true;
    ++requestVersion.current; // An older, still-pending GET must never restore the pre-Apply cache.
    setEditingBlocked(true); setWorkspace(null); setLoading(true); setError("");
    let result: ApplyResult;
    try { result = await api.applyProposal(id, approval); }
    catch (caught) {
      applying.current = false;
      await fetchWorkspace(); // Verified rollback may resume editing; unresolved recovery may not.
      throw caught;
    }
    applying.current = false;
    if (!await fetchWorkspace()) throw new ApiError("The application completed, but the workspace could not be refreshed. Editing remains blocked; reload before continuing.", 503, "write_failed", result.receipt);
    return result;
  }, [fetchWorkspace]);

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
    () => ({ workspace, environment, loading, error, reload, editingBlocked, applyApprovedProposal, appearance, resolvedAppearance, setAppearance }),
    [workspace, environment, loading, error, reload, editingBlocked, applyApprovedProposal, appearance, resolvedAppearance, setAppearance],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is missing.");
  return value;
}
