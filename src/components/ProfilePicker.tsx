import { useEffect, useState } from "react";
import type { ProfileLibrary } from "../../shared/profiles";
import { profileApi, switchProfile } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { Modal } from "./Modal";

export function ProfilePicker() {
  const { environment } = useWorkspace();
  const [library, setLibrary] = useState<ProfileLibrary | null>(null);
  const [open, setOpen] = useState(false), [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [kind, setKind] = useState<"scratch" | "monet-starter" | "fork">("monet-starter");
  const [references, setReferences] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { let live = true; void profileApi.list().then((value) => { if (live) setLibrary(value); }).catch(() => undefined); return () => { live = false; }; }, []);
  if (!library) return null;
  const active = environment?.profile?.id ?? new URLSearchParams(window.location.search).get("profile") ?? library.defaultProfileId ?? library.originalProfileId;
  return <div className="profile-picker"><label>Profile<select aria-label="Profile" value={active} onChange={(e) => switchProfile(e.target.value)}>{library.profiles.map((p) => <option key={p.identity.id} value={p.identity.id}>{p.identity.name}{p.unavailable ? " (unavailable)" : ""}</option>)}</select></label>
    <div className="profile-actions"><button className="button ghost micro" type="button" onClick={() => { setRenaming(false); setName(""); setOpen(true); }}>New profile</button><button className="button ghost micro" type="button" onClick={() => { setRenaming(true); setName(environment?.profile?.name ?? ""); setOpen(true); }}>Rename profile</button></div>
    {open && <Modal className="profile-dialog-backdrop" label={renaming ? "Rename profile" : "Create independent profile"} onClose={() => { if (!busy) setOpen(false); }}><form className="profile-dialog" onSubmit={(event) => {
      event.preventDefault(); setBusy(true); setError("");
      if (renaming) { void profileApi.rename(active, name).then(() => switchProfile(active)).catch((e: unknown) => { setError(e instanceof Error ? e.message : "Rename failed."); setBusy(false); }); return; }
      void profileApi.create({ name, kind, ...(kind === "fork" ? { sourceProfileId: active, includeReferences: references } : {}) }).then((p) => switchProfile(p.identity.id)).catch((e: unknown) => { setError(e instanceof Error ? e.message : "Creation failed."); setBusy(false); });
    }}><h2>{renaming ? "Rename profile" : "Create independent profile"}</h2><p>Each Profile owns its design knowledge and history. Switching closes open editors; work already submitted finishes in its original Profile.</p>
      <label>Name<input autoFocus required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
      {!renaming && <label>Start with<select aria-label="Start with" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="monet-starter">Monet starter</option><option value="scratch">Empty profile</option><option value="fork">Copy current profile’s knowledge</option></select></label>}
      {!renaming && kind === "fork" && <label><input type="checkbox" checked={references} onChange={(e) => setReferences(e.target.checked)} /> Include References and their assets</label>}
      <p>{kind === "scratch" ? "Begin without design decisions. Add Foundations, modes and guidance as you go." : "An independent starting copy. Later changes to its source do not update this Profile."}</p>
      {error && <p role="alert">{error}</p>}<button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button> <button className="button" disabled={busy || !name.trim()}>{busy ? "Saving…" : renaming ? "Save name" : "Create profile"}</button>
    </form></Modal>}
  </div>;
}
