ou are auditing and fixing documentation for a single package in a TypeScript SDK monorepo. The package is at: $ARGUMENTS
Do this in order. Do not skip steps.
1. Understand the package
Read the package's source files, package.json, and tsconfig.json. Identify:

What the package does (from code, not from existing README which may be stale)
All public exports (check the main entry point / exports field in package.json, then trace to the actual source)
Key patterns: base classes, adapters, decorators, factory functions
Dependencies on other @happyvertical packages

2. Audit the README
Read the existing README.md. Check:

Does the description match what the code actually does?
Are listed features/adapters/providers still present in the code?
Are code examples valid against the current API? Do the imports resolve? Do the method signatures match?
Are there features in the code NOT mentioned in the README?
Is the installation section correct (package name, registry, peer deps)?

Rewrite the README if anything is wrong or missing. Keep the same general structure but make it accurate. Do not pad with marketing language. The README should cover: what it is (one paragraph), installation, basic usage with a real example, available adapters/providers if applicable, and API overview of the main exports. Keep it under 150 lines.
3. Audit JSDoc comments
Check all publicly exported symbols (classes, functions, types, interfaces, enums). For each:

If it has no JSDoc: add one. Include a brief description, @param tags with types and descriptions, @returns, @throws if applicable, and @example if the usage is non-obvious.
If it has a JSDoc that is wrong or incomplete: fix it. Check param names match, types match, description is accurate.
If it has a correct JSDoc: leave it alone.

Do NOT add JSDoc to: private methods, internal helper functions, simple type aliases where the name is self-documenting, re-exports, or test files.
Do NOT use trivial JSDoc like /** The name */ on a field called name. Only add comments that provide information beyond what the type signature already tells you.
4. Verify
Run the package's build command to make sure nothing is broken. Run its tests if they exist.
5. Commit
Stage all changes in this package only. Commit with: docs(PACKAGENAME): update README and JSDoc comments
where PACKAGENAME is the short name (e.g. ai, sql, files).
