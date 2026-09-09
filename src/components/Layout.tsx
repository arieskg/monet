import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { mappingsNeedingReview, searchWorkspace } from "../domain";
import { isSearchResultVisible } from "../featureVisibility";
import { Modal } from "./Modal";
import { AppearanceSwitch } from "./AppearanceSwitch";
import { useWorkspace } from "../WorkspaceContext";

/**
 * Three groups in the order the product itself works: decide the design system, keep the
 * inspiration it came from, then hand the result to something that builds with it.
 */
const sections = [
  { label: "Design system", icon: "design-system", links: [["/principles", "Principles"], ["/foundations", "Foundations"], ["/components", "Components"], ["/patterns", "Patterns"], ["/themes", "Themes"]] },
  { label: "Inspiration", icon: "inspiration", links: [["/sources", "Sources"], ["/references", "References"]] },
  { label: "Build with it", icon: "build", links: [["/preview", "Preview"], ["/agent", "Agent context"], ["/gaps", "Gaps"], ["/export", "Export"]] },
] as const;

const monetLogo = "/monet-logo.png";

function navClass({ isActive }: { isActive: boolean }): string { return isActive ? "nav-link active" : "nav-link"; }

function NavigationIcon({ name }: { name: typeof sections[number]["icon"] | "settings" }) {
  if (name === "design-system") return <svg aria-hidden="true" viewBox="0 0 16 16"><rect x="2" y="2" width="4" height="4" rx="1" /><rect x="10" y="2" width="4" height="4" rx="1" /><rect x="2" y="10" width="4" height="4" rx="1" /><rect x="10" y="10" width="4" height="4" rx="1" /></svg>;
  if (name === "inspiration") return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 1.75a4.75 4.75 0 0 0-2.85 8.55c.55.41.85.85.85 1.45h4c0-.6.3-1.04.85-1.45A4.75 4.75 0 0 0 8 1.75Z" /><path d="M6.5 14h3" /></svg>;
  if (name === "build") return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M6 3.5 2.25 8 6 12.5" /><path d="m10 3.5 3.75 4.5L10 12.5" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.25" /><path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.88.88M11.72 11.72l.88.88M12.6 3.4l-.88.88M4.28 11.72l-.88.88" /></svg>;
}

function SidebarNavigation({ reviewCount }: { reviewCount: number }) {
  return <nav className="sidebar-navigation" aria-label="Primary navigation">{sections.map(({ label, icon, links }) => <div className="nav-group" key={label}><span className="nav-label"><NavigationIcon name={icon} />{label}</span><div className="nav-items">{links.map(([to, name]) => <NavLink className={navClass} key={to} to={to}><span>{name}</span>{to === "/sources" && reviewCount > 0 && <i className="nav-count" title={`${reviewCount} mappings waiting for review`}>{reviewCount}</i>}</NavLink>)}</div></div>)}</nav>;
}

function SidebarFooter() {
  return <div className="sidebar-footer">
    <AppearanceSwitch />
    <NavLink className={({ isActive }) => `sidebar-settings ${isActive ? "active" : ""}`} to="/settings"><NavigationIcon name="settings" /><span>Settings</span></NavLink>
  </div>;
}

export function Layout() {
  const { workspace, environment } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => workspace ? searchWorkspace(workspace, query).filter((result) => isSearchResultVisible(result.type)) : [], [workspace, query]);
  // A count badge should mean "you have work waiting". On the bundled example that work is not the
  // reader's, and it would be the only badge a first-time user ever sees, so it stays off there.
  const reviewCount = useMemo(() => workspace && !environment?.bundled ? mappingsNeedingReview(workspace).length : 0, [workspace, environment]);
  useEffect(() => { setOpen(false); setMenuOpen(false); setQuery(""); }, [location.pathname]);
  useEffect(() => {
    document.body.classList.toggle("navigation-open", menuOpen || open);
    return () => document.body.classList.remove("navigation-open");
  }, [menuOpen, open]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true); requestAnimationFrame(() => input.current?.focus()); }
      if (event.key === "Escape") { setOpen(false); setMenuOpen(false); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/" className="brand" aria-label="Monet home"><img className="brand-mark" src={monetLogo} alt="" /><b>Monet</b></NavLink>
      <button className="search-trigger" onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}><span>Search the system</span><kbd>⌘ K</kbd></button>
      <SidebarNavigation reviewCount={reviewCount} />
      <SidebarFooter />
    </aside>
    <main className="main-shell"><div className="mobile-bar"><button className="mobile-menu-button" type="button" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(true)}>Menu</button><NavLink to="/" className="brand"><img className="brand-mark" src={monetLogo} alt="" /><b>Monet</b></NavLink><button type="button" onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}>Search</button></div><Outlet /></main>
    {menuOpen && <Modal className="mobile-navigation-backdrop" label="Mobile navigation" onClose={() => setMenuOpen(false)}><aside className="mobile-navigation" id="mobile-navigation"><header><NavLink to="/" className="brand"><img className="brand-mark" src={monetLogo} alt="" /><b>Monet</b></NavLink><button className="dialog-close" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}>×</button></header><SidebarNavigation reviewCount={reviewCount} /><SidebarFooter /></aside></Modal>}
    {open && <Modal className="search-backdrop" label="Search Monet" onClose={() => setOpen(false)}><section className="search-dialog"><div className="search-input-row"><span aria-hidden="true">⌕</span><input autoFocus ref={input} aria-label="Search the design system" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search principles, foundations, components…" /><button className="dialog-close" type="button" aria-label="Close search" onClick={() => setOpen(false)}>×</button></div><div className="search-results">{!query && <div className="search-hint"><b>Find design knowledge</b><p>Try “layout”, “button”, “menu”, or an upstream item name.</p></div>}{query && results.length === 0 && <div className="search-hint"><b>No matches</b><p>Try a broader concept or alias.</p></div>}{results.map((result) => <button key={`${result.type}-${result.id}`} onClick={() => { void navigate(result.route); }}><span><small>{result.type}</small><b>{result.title}</b><p>{result.description}</p></span><i aria-hidden="true">→</i></button>)}</div></section></Modal>}
  </div>;
}
