# Bundled preset data

`monet-starter.json` remains the existing frozen Monet-owned starter. The external
catalog is in `catalog/index.json` plus three versioned native package JSON files.
The index pins every byte of each package with SHA-256. The server loads only these
bundled packages, independent of the active workspace or `MONET_ROOT`.

`evidence/<preset-id>/source-NNN.txt` retains the exact bytes named by that package's
manifest. These are audit/reference material, never executed or imported into the
application bundle. A `.txt` extension does not change their upstream license:
look up each file's source ID in the adjacent package manifest for its original URL,
revision, license and hash. Preserve source copyright headers. Full notices are
also inside the manifest and copied to each resulting Profile.

Git attributes disable line-ending conversion for hashed packages/evidence and
exclude only upstream evidence from whitespace checks. Keep the original bytes,
including upstream trailing whitespace, so the recorded hashes remain meaningful.

## Updating a curated package

1. Read the research decision and inspect the precise upstream files, repository
   licenses, notices and separately licensed assets at a pinned revision.
2. Curate native records. Preserve source facts, explicitly label adaptations and
   Monet-authored additions, and state omissions. Do not add executable assets.
3. Retain byte-identical source evidence. Update its SHA-256/URL/revision/license
   and per-record provenance. Keep full notices and mark modifications.
4. Bump the package's semantic version and adaptation version when records change.
   Package/schema versions change only with a reviewed contract migration. Set the
   index digest to SHA-256 of the exact UTF-8 package bytes, including its newline.
5. Run `pnpm check`, `pnpm test:mcp`, and `pnpm test:surfaces:browser`. The preset
   tests verify every evidence hash, strict validation, offline independent creation,
   mode resolution, retained notices, recovery, updates/removal and scoped use.
6. Review the preview and source fidelity before releasing the catalog change.
   Existing Profiles are never rewritten or upgraded by this process.

The checked-in native JSON is the authoritative release. There is no general source
conversion script or runtime import path. The test catalog-directory constructor
is a server-side maintenance seam and is not exposed to clients.

[Usage and exact coverage](../docs/PRESETS.md) ·
[Research, candidate ranking and license decisions](../docs/research/preset-profiles-v1.md) ·
[Guidance corrections and release hashes](../docs/research/preset-guidance-corrections.md)
