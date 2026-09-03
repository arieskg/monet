import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../server/fileStore.js";
import { createMonetService } from "./service.js";

const service = createMonetService({ loadWorkspace });

describe("Monet canonical catalog integrity", () => {
  it("keeps component decisions and pattern links attached to canonical IDs", async () => {
    const workspace = await service.getWorkspace();
    const components = await service.listComponents();
    const componentIds = new Set(components.map((item) => item.id));
    const foundationIds = new Set(workspace.foundations.map((item) => item.id));

    expect(workspace.components.filter((item) => !componentIds.has(item.id)).map((item) => item.id)).toEqual([]);
    expect(workspace.patterns.flatMap((item) => (item.components ?? []).filter((id) => !componentIds.has(id)).map((id) => `${item.id}:${id}`))).toEqual([]);
    expect(workspace.patterns.flatMap((item) => (item.foundations ?? []).filter((id) => !foundationIds.has(id)).map((id) => `${item.id}:${id}`))).toEqual([]);
  });

  it("loads a joined component and query context from the real file store", async () => {
    const component = await service.getComponent("button");
    const context = await service.getDesignContext({ componentIds: ["button"] });

    expect(component).toMatchObject({ id: "button", decision: { id: "button" } });
    expect(context.components.map((item) => item.id)).toContain("button");
    expect(context.foundations.length).toBeGreaterThan(0);
    expect(context.principles.length).toBeGreaterThan(0);
    expect(context.warnings).toEqual([]);
  });
});
