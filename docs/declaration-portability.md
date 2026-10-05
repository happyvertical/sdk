# Published TypeScript declarations

The shared Vite configuration and utils' custom browser build emit unbundled declarations using the workspace's
pinned TypeScript compiler. Relative references are normalized during declaration
emission to Node ESM file names, including directory imports (`./models/index.js`).
Package imports and explicit runtime or asset suffixes retain their spelling.
Compiler-generated declaration maps describe the rewritten output accurately.

AI's root and `@happyvertical/ai/node` entries, files, and SQL support strict
TypeScript consumers using either `moduleResolution: "Bundler"` or
`moduleResolution: "NodeNext"`, with `skipLibCheck: false`. NodeNext consumers use
`module: "NodeNext"` and an ESM package (`"type": "module"`).

Run `pnpm test:ci-scripts` for emission, path-resolution, declaration-map, and
invalid-source regressions. After `pnpm build`, run `pnpm test:declarations-packed`
for strict consumers of real AI, files, SQL, and their workspace dependencies.
The latter installs actual package tarballs into a temporary consumer with clean
ancestor directories. Workspace packages use local tarball overrides; direct
external dependency versions match the producer installation. The consumer adds
only TypeScript and Node types, without producer dependency links or development
type packages. Its install skips dependency lifecycle scripts because it only
executes TypeScript; the normal workspace install and build gates retain theirs. It checks public factories and rejects
silently erased types without contacting providers or databases.

As with the previous `vite-plugin-dts` integration, the emitter reports semantic
compiler diagnostics and leaves source validation to the separate `pnpm typecheck`
gate. Configuration, syntax, or declaration-emission errors fail the build. The
strict packed-consumer gate checks the published declaration graph independently;
no `skipLibCheck` suppression is applied to that consumer. Set
`SDK_DECLARATIONS_EVIDENCE_DIR` to retain its tarballs, package manifest, lockfile,
installed dependency inventory, and install output.

The secrets package's Git-dependency prepare hook builds its declared workspace
dependency closure first, so a clean install emits secrets against the actual utils
and SQL declarations instead of reporting missing prerequisites.

Utils publishes `@types/pluralize` as a dependency because its exported
pluralization functions retain the complete upstream callable type. Consumers
do not need to add a development-only type dependency on utils' behalf.
