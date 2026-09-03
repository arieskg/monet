import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadWorkspace } from "../server/fileStore.js";
import { isBundledWorkspace, resolveWorkspaceRoot, setWorkspaceRoot } from "../server/workspace.js";
import { createMonetService } from "../shared/service.js";
import { createMonetMcpServer } from "./server.js";

// Resolve the workspace before the first read so `--root` and MONET_ROOT take effect.
const root = resolveWorkspaceRoot();
setWorkspaceRoot(root);

const service = createMonetService({ loadWorkspace });
const handle = serveStdio(() => createMonetMcpServer(service), {
  onerror: (error) => console.error("Monet MCP error:", error.message),
});

// Protocol traffic owns stdout, so every human-readable line goes to stderr.
console.error(`Monet MCP server listening on stdio (workspace: ${root}${isBundledWorkspace(root) ? " — bundled starter workspace" : ""})`);

process.on("SIGINT", () => { void handle.close(); });
process.on("SIGTERM", () => { void handle.close(); });
