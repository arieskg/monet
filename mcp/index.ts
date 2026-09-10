import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { readOnlyProfileScope, legacyProfileId } from "../server/profileRegistry.js";
import { createProfileService } from "../server/profileService.js";
import { isBundledWorkspace, resolveWorkspaceRoot, resolveExpectedProfileId } from "../server/workspace.js";
import { createMonetMcpServer } from "./server.js";

// Resolve the workspace before the first read so `--root` and MONET_ROOT take effect.
const root = resolveWorkspaceRoot();
const expected = resolveExpectedProfileId();
const scope = await readOnlyProfileScope(root, expected);

const service = createProfileService(scope);
const handle = serveStdio(() => createMonetMcpServer(service, scope.identity?.id ?? legacyProfileId(scope.root)), {
  onerror: (error) => console.error("Monet MCP error:", error.message),
});

// Protocol traffic owns stdout, so every human-readable line goes to stderr.
console.error(`Monet MCP server listening on stdio (workspace: ${root}${isBundledWorkspace(root) ? " — bundled starter workspace" : ""})`);

process.on("SIGINT", () => { void handle.close(); });
process.on("SIGTERM", () => { void handle.close(); });
