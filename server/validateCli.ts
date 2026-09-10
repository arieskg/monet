import { runValidate } from "./validate.js";

import { resolveWorkspaceRoot, resolveExpectedProfileId, withProfile } from "./workspace.js";
import { readOnlyProfileScope } from "./profileRegistry.js";
const scope = await readOnlyProfileScope(resolveWorkspaceRoot(), resolveExpectedProfileId());
process.exitCode = await withProfile(scope, () => runValidate());
