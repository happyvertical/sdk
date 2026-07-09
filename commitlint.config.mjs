/**
 * Commitlint configuration for conventional commits.
 *
 * Consumed by:
 *  - lefthook `commit-msg` hook (local pre-commit validation)
 *  - `.github/workflows/on-pull-request.yml` `validate-commits` job
 *    (wagoid/commitlint-github-action against this file, plus a
 *    second `pnpm exec commitlint` step that validates the PR title
 *    after a root-only, scripts-disabled install)
 *
 * Single source of truth for commit message rules and scope validation
 * — see `.commitlintrc.json` deletion for context. Note:
 * `scripts/release-helper.js` still calls
 * `scripts/validate-conventional-commits.js`, which uses its own
 * hardcoded regex (permissive scope, 50-char subject limit) and does
 * NOT consult this file. Retiring that script is a follow-up; for now
 * treat any commit message that passes the release-helper preflight as
 * still subject to the
 * stricter commitlint rules below.
 * Two configs existed previously and their `scope-enum`s had drifted:
 *   - only in `.commitlintrc.json`: `comfyui`, `directory`, `social`, `video`
 *   - only in `commitlint.config.js`: `email`, `encryption`, `github-actions`,
 *     `sdk-mcp`, `secrets`
 *   - missing from both: `languages` (a spec-only placeholder
 *     directory — `packages/languages/` has SPEC.md but no
 *     package.json or source yet, so NOT added here either. This
 *     follows the same "no proactive scopes" rule that kept `payments`
 *     out until `packages/payments` landed with real package metadata.
 *     Add new placeholder scopes only when the package is actually
 *     scaffolded.)
 *
 * Reconciled below against the actual `packages/*` directory list plus
 * the small set of non-package and historical scopes that recent commit
 * history justifies. When a new package directory lands under
 * `packages/`, add its name here too (otherwise the first
 * `feat(<name>):` commit will fail CI). Do NOT add scopes proactively
 * for packages on other branches — keep the enum a description of
 * present-tense reality and recent compatibility, not a forecast.
 *
 * https://commitlint.js.org/
 * https://www.conventionalcommits.org/
 */

export default {
  extends: ['@commitlint/config-conventional'],

  rules: {
    // Type enum - allowed commit types
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation changes
        'style', // Code style changes (formatting, missing semicolons, etc.)
        'refactor', // Code refactoring (neither fixes a bug nor adds a feature)
        'perf', // Performance improvements
        'test', // Adding or updating tests
        'build', // Changes to build system or dependencies
        'ci', // Changes to CI configuration files and scripts
        'chore', // Other changes that don't modify src or test files
        'revert', // Reverts a previous commit
      ],
    ],

    // Scope enum - reconciled against `packages/*` directory list as of
    // SDK v0.74.x. When adding a new package, add its directory name
    // here too. Non-package scopes (`ci`, `config`, `deps`, `release`,
    // `smrt`) cover cross-cutting commits that don't belong to a single
    // package surface.
    'scope-enum': [
      2,
      'always',
      [
        // Actual packages under packages/* (alphabetical)
        'accounting',
        'ai',
        'analytics',
        'auth',
        'cache',
        'comfyui',
        'directory',
        'documents',
        'email',
        'encryption',
        'files',
        'geo',
        'github-actions',
        'graphql',
        'images',
        'jobs',
        'json',
        'logger',
        'messages',
        'payments',
        'projects',
        'repos',
        'sdk-mcp',
        'secrets',
        'social',
        'speech',
        'sql',
        'translator',
        'utils',
        'video',
        'weather',
        // External-catalog packages — separate repos whose versions
        // are managed in this monorepo via pnpm-workspace.yaml's
        // `catalog:` block (`@happyvertical/{ocr,pdf,spider}`). Recent
        // commits like `fix(spider):` / `feat(pdf):` reference these
        // even though they don't live under `packages/`.
        'ocr',
        'pdf',
        'spider',
        // Historical scopes from recently removed or externalized
        // package surfaces. Keeping these avoids rejecting in-flight
        // work and recently-used commit subjects while the repo history
        // still references them.
        'content',
        'gnode',
        'products',
        // Non-package cross-cutting scopes
        'ci', // CI / workflow changes
        'config', // Repo-wide configuration changes (commitlint, biome, tsconfig)
        'deps', // Dependency updates (used by Renovate)
        'git', // Git hooks and repository metadata
        'release', // Release-related changes (chore(release): version bumps)
        'smrt', // Downstream-SMRT-sync commits (sdk -> smrt version bumps)
      ],
    ],

    // Subject case - allow sentence-case, lowercase, kebab-case, etc.
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],

    // Subject full stop - no period at the end
    'subject-full-stop': [2, 'never', '.'],

    // Subject empty - must have a subject
    'subject-empty': [2, 'never'],

    // Type case - must be lowercase
    'type-case': [2, 'always', 'lowercase'],

    // Type empty - must have a type
    'type-empty': [2, 'never'],

    // Header max length - limit to 100 characters
    'header-max-length': [2, 'always', 100],

    // Body leading blank - require blank line before body
    'body-leading-blank': [2, 'always'],

    // Footer leading blank - disabled to allow flexible commit message formatting
    'footer-leading-blank': [0, 'always'],

    // Body max length - disable for semantic-release commits with long changelogs
    'body-max-length': [0],

    // Body max line length - disable for semantic-release commits
    'body-max-line-length': [0],
  },
};
