import { createMonetService, type MonetService } from "../shared/service.js";
import * as files from "./fileStore.js";
import * as proposals from "./proposalStore.js";
import * as applications from "./applicationStore.js";
import * as surfaces from "./surfaceStore.js";
import { withWorkspaceRead } from "./writeLock.js";
import { withProfile, type ProfileScope } from "./workspace.js";

/** Bind an entire adapter at construction. Async continuations inherit this immutable scope. */
function bind<T extends object>(scope: ProfileScope, target: T, consistentRead = false): T {
  return new Proxy(target, { get(object, key) {
    const method: unknown = Reflect.get(object, key);
    if (typeof method !== "function") return method;
    return (...args: unknown[]) => withProfile(scope, async () => {
      await scope.verify?.();
      const run = async () => Reflect.apply(method, object, args) as unknown;
      const result = await (consistentRead ? withWorkspaceRead(run) : run());
      await scope.verify?.();
      return result;
    });
  } });
}
export function createProfileStore(scope: ProfileScope) {
  const fileOperations = {
    loadWorkspace: files.loadWorkspace, initializeStore: files.initializeStore, regenerateExports: files.regenerateExports,
    savePrinciple: files.savePrinciple, saveFoundation: files.saveFoundation, saveMarkdown: files.saveMarkdown, deleteMarkdown: files.deleteMarkdown,
    saveComponents: files.saveComponents, savePrimitive: files.savePrimitive, savePrimitiveTaxonomy: files.savePrimitiveTaxonomy, mergePrimitive: files.mergePrimitive,
    saveTheme: files.saveTheme, deleteTheme: files.deleteTheme, duplicateTheme: files.duplicateTheme, setDefaultTheme: files.setDefaultTheme,
    saveSource: files.saveSource, deleteSource: files.deleteSource, refreshSourceMappings: files.refreshSourceMappings,
    saveReference: files.saveReference, deleteReference: files.deleteReference, readReferenceAsset: files.readReferenceAsset,
    analyzeSavedReference: files.analyzeSavedReference, analyzeReferences: files.analyzeReferences, saveReferenceAnalysis: files.saveReferenceAnalysis,
    createGap: files.createGap, listGaps: files.listGaps, getGap: files.getGap, deleteGap: files.deleteGap,
    diagnoseSavedGap: files.diagnoseSavedGap, saveGapReview: files.saveGapReview, readGapImage: files.readGapImage,
  };
  const { proposalInternals: _internals, ...proposalOperations } = proposals;
  return Object.freeze({ scope, files: bind(scope, fileOperations), proposals: bind(scope, proposalOperations), applications: bind(scope, applications), surfaces: bind(scope, surfaces) });
}
/** Multi-read conformance/context calls keep one owned read boundary for their entire operation. */
export function createProfileService(scope: ProfileScope): MonetService {
  return bind(scope, Object.assign(createMonetService({ loadWorkspace: files.loadWorkspace }), { profileId: scope.identity?.id }), true);
}
