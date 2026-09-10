import { describe, expect, it } from "vitest";
import { captureRequestAllowed, humanizeRoute, loopbackOrigin, matchScreens, tokenize, type ProjectScreen } from "./projects.js";

const screen = (id: string, route: string, source: string, hints: string[] = [], extra: Partial<ProjectScreen> = {}): ProjectScreen => ({ id, label: humanizeRoute(route), route, source, kind: /:/.test(route) ? "dynamic_route" : "route", parameters: [...route.matchAll(/:(\w+)/g)].map((m) => m[1]!), hints, ...extra });
const inventory = [
  screen("home", "/", "src/pages/HomePage.tsx", ["Practice a difficult conversation", "Choose a scenario"]),
  screen("sessions", "/sessions", "src/pages/SessionsPage.tsx", ["Your past sessions", "Delete session"]),
  screen("settings", "/settings", "src/pages/SettingsPage.tsx", ["Voice provider", "Microphone"]),
  screen("transcript", "/transcript/:sessionId", "src/pages/TranscriptPage.tsx", ["Transcript"]),
];

describe("deterministic screen matching", () => {
  it("tokenizes camelCase, kebab-case and paths without stop words", () => {
    expect(tokenize("the SettingsPage of /session-history")).toEqual(["settings", "session", "history"]);
  });
  it("ranks route and label matches above text hints and ignores nonsense", () => {
    const [first] = matchScreens(inventory, "settings page");
    expect(first?.screen_id).toBe("settings"); expect(first?.reasons).toContain("route matches");
    expect(matchScreens(inventory, "past sessions")[0]?.screen_id).toBe("sessions");
    expect(matchScreens(inventory, "microphone")[0]?.screen_id).toBe("settings");
    expect(matchScreens(inventory, "zzzz qqqq")).toEqual([]);
    expect(matchScreens(inventory, "the")).toEqual([]);
  });
  it("uses AI labels as ordinary text and never as identity", () => {
    const labelled = inventory.map((s) => s.id === "transcript" ? { ...s, ai_label: "Conversation review" } : s);
    expect(matchScreens(labelled, "conversation review")[0]?.screen_id).toBe("transcript");
    expect(matchScreens(labelled, "conversation review").every((m) => labelled.some((s) => s.id === m.screen_id))).toBe(true);
  });
  it("humanizes routes for labels", () => {
    expect(humanizeRoute("/")).toBe("Home"); expect(humanizeRoute("/session-history")).toBe("Session history"); expect(humanizeRoute("/exercise/:exerciseId")).toBe("Exercise"); expect(humanizeRoute("/about.html")).toBe("About");
  });
});

describe("loopback capture policy", () => {
  it("accepts only plain http loopback origins without credentials", () => {
    expect(loopbackOrigin("http://127.0.0.1:5173/").origin).toBe("http://127.0.0.1:5173");
    expect(loopbackOrigin("http://localhost:3000/app?x=1").origin).toBe("http://localhost:3000");
    expect(loopbackOrigin("http://[::1]:3000").port).toBe(3000);
    for (const bad of ["https://127.0.0.1:5173", "http://user:pw@127.0.0.1:5173", "http://10.0.0.5:3000", "http://evil.test", "ftp://127.0.0.1", "127.0.0.1:5173", "http://127.0.0.1:0", "http://localhost.evil.test:3000", "http://127.0.0.1.nip.io:3000"]) expect(() => loopbackOrigin(bad), bad).toThrow();
  });
  it("allows only the capture port on loopback plus inline data, blocking everything else", () => {
    expect(captureRequestAllowed("http://127.0.0.1:5173/assets/app.js", 5173)).toBe(true);
    expect(captureRequestAllowed("http://localhost:5173/", 5173)).toBe(true);
    expect(captureRequestAllowed("data:image/png;base64,AAAA", 5173)).toBe(true);
    expect(captureRequestAllowed("blob:http://127.0.0.1:5173/abc", 5173)).toBe(true);
    expect(captureRequestAllowed("ws://127.0.0.1:5173/?token=hmr", 5173)).toBe(true); expect(captureRequestAllowed("wss://127.0.0.1:5173/", 5173)).toBe(false); expect(captureRequestAllowed("ws://127.0.0.1:5174/", 5173)).toBe(false);
    for (const bad of ["http://127.0.0.1:43141/api/workspace", "http://127.0.0.1:43140/", "https://127.0.0.1:5173/", "http://evil.test/", "ws://evil.test/", "http://192.168.1.4:5173/", "file:///etc/passwd", "javascript:alert(1)", "not a url"]) expect(captureRequestAllowed(bad, 5173), bad).toBe(false);
  });
});
