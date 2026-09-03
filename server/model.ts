// Compatibility entrypoint for existing server modules. Canonical domain types
// live in shared/model so browser, file service, and future transports agree.
export type * from "../shared/model.js";
