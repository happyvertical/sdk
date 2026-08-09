# @happyvertical/jobs

## 0.86.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.86.1
  - @happyvertical/sql@0.86.1

## 0.86.0

### Patch Changes

- @happyvertical/sql@0.86.0
- @happyvertical/utils@0.86.0

## 0.85.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.85.5
  - @happyvertical/sql@0.85.5

## 0.85.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.85.4
  - @happyvertical/sql@0.85.4

## 0.85.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.85.3
  - @happyvertical/sql@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.85.2
  - @happyvertical/sql@0.85.2

## 0.85.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.85.1
  - @happyvertical/sql@0.85.1

## 0.85.0

### Patch Changes

- @happyvertical/sql@0.85.0
- @happyvertical/utils@0.85.0

## 0.84.0

### Patch Changes

- Updated dependencies [867a83c]
  - @happyvertical/sql@0.84.0
  - @happyvertical/utils@0.84.0

## 0.83.0

### Patch Changes

- Updated dependencies [f3a5a10]
  - @happyvertical/sql@0.83.0
  - @happyvertical/utils@0.83.0

## 0.82.0

### Patch Changes

- cc813d0: Stop `update()` in the SQLite and PostgreSQL job stores from resolving caller-supplied keys through the prototype chain.

  Both adapters mapped each update key to a column with `const column = fieldMap[key]; if (!column) continue;`. `fieldMap` is a plain object literal, so the falsy guard ran against a lookup that falls through to `Object.prototype`: `update(id, { constructor: 1 })` resolved to the native `Object` constructor and interpolated `function Object() { [native code] } = ?` into the `SET` clause, and under prototype pollution elsewhere in the process an inherited string was spliced straight into the clause, rewriting an unrelated column on the targeted row. Values were always bound, but the column name was not. The column lookup now guards with `Object.hasOwn`.

  The status-change event branch had the same shape: it read `updates.status` directly, which also traverses the prototype chain, so a polluted `Object.prototype.status` could make an unrelated update emit a spurious `job.completed`, `job.failed`, or `job.cancelled`. It now reads `status` only when it is an own property of `updates`.

- Updated dependencies [e806b9f]
- Updated dependencies [0a09b0e]
  - @happyvertical/sql@0.82.0
  - @happyvertical/utils@0.82.0

## 0.81.0

### Patch Changes

- 7369685: Resolve both halves of the `ORDER BY` clause in `BaseJobStore.buildOrderBy` against an allowlist, so only allowlisted text is interpolated. `JobFilter`'s literal types are erased at runtime, so a JavaScript caller — or TypeScript casting parsed JSON to `JobFilter`, the usual shape for a "list jobs" endpoint — controls both. `orderDir` was uppercased and concatenated straight in: `'desc, (SELECT name FROM sqlite_master)'` produced `ORDER BY created_at DESC, (SELECT NAME FROM SQLITE_MASTER)` and `list()` executed it. `orderBy` was looked up via `fieldMap[field] ?? 'created_at'` on a plain object literal, which inherits from `Object.prototype`, so `'constructor'` resolved to a truthy inherited value, the fallback never fired, and a stringified native function reached the statement — a broken query alone, but an injection sink under prototype pollution. The direction is now checked against `ASC`/`DESC` and the field lookup uses `Object.hasOwn`; `list()` throws `Invalid job order direction` for anything else. Both fixes are in the shared base method, so they cover the PostgreSQL and SQLite adapters.

  Behavior change: a blank or whitespace-only `orderDir` is now treated as unspecified and sorts `DESC`, matching an omitted `orderDir`. It previously emitted no direction token, which both engines default to `ASC`, so blank and omitted disagreed. Callers passing `?orderDir=` from an unfilled form field will see rows in the opposite order from 0.80.6.

- Updated dependencies [7d993be]
- Updated dependencies [b9aff6e]
- Updated dependencies [2ac632c]
- Updated dependencies [e0f8551]
- Updated dependencies [e0f8551]
- Updated dependencies [e0f8551]
- Updated dependencies [e0f8551]
  - @happyvertical/sql@0.81.0
  - @happyvertical/utils@0.81.0

## 0.80.6

### Patch Changes

- Updated dependencies [2e114bd]
  - @happyvertical/sql@0.80.6
  - @happyvertical/utils@0.80.6

## 0.80.5

### Patch Changes

- Updated dependencies [37d91cb]
  - @happyvertical/sql@0.80.5
  - @happyvertical/utils@0.80.5

## 0.80.4

### Patch Changes

- Updated dependencies [218c316]
  - @happyvertical/sql@0.80.4
  - @happyvertical/utils@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.80.3
  - @happyvertical/sql@0.80.3

## 0.80.2

### Patch Changes

- @happyvertical/sql@0.80.2
- @happyvertical/utils@0.80.2

## 0.80.1

### Patch Changes

- 85cca70: Upgrade Video and Images validation to Sharp 0.35.3 and Jobs validation to BullMQ 5.80.4.
  - @happyvertical/sql@0.80.1
  - @happyvertical/utils@0.80.1

## 0.80.0

### Patch Changes

- @happyvertical/sql@0.80.0
- @happyvertical/utils@0.80.0

## 0.79.0

### Patch Changes

- @happyvertical/sql@0.79.0
- @happyvertical/utils@0.79.0

## 0.78.3

### Patch Changes

- @happyvertical/sql@0.78.3
- @happyvertical/utils@0.78.3

## 0.78.2

### Patch Changes

- @happyvertical/sql@0.78.2
- @happyvertical/utils@0.78.2

## 0.78.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.78.1
  - @happyvertical/sql@0.78.1

## 0.78.0

### Patch Changes

- @happyvertical/sql@0.78.0
- @happyvertical/utils@0.78.0

## 0.77.0

### Patch Changes

- @happyvertical/sql@0.77.0
- @happyvertical/utils@0.77.0

## 0.76.2

### Patch Changes

- @happyvertical/sql@0.76.2
- @happyvertical/utils@0.76.2

## 0.76.1

### Patch Changes

- @happyvertical/sql@0.76.1
- @happyvertical/utils@0.76.1

## 0.76.0

### Patch Changes

- @happyvertical/sql@0.76.0
- @happyvertical/utils@0.76.0

## 0.75.0

### Patch Changes

- @happyvertical/sql@0.75.0
- @happyvertical/utils@0.75.0

## 0.74.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.11
  - @happyvertical/sql@0.74.11

## 0.74.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.10
  - @happyvertical/sql@0.74.10

## 0.74.9

### Patch Changes

- @happyvertical/sql@0.74.9
- @happyvertical/utils@0.74.9

## 0.74.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.8
  - @happyvertical/sql@0.74.8

## 0.74.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.7
  - @happyvertical/sql@0.74.7

## 0.74.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.6
  - @happyvertical/sql@0.74.6

## 0.74.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.5
  - @happyvertical/sql@0.74.5

## 0.74.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.4
  - @happyvertical/sql@0.74.4

## 0.74.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.3
  - @happyvertical/sql@0.74.3

## 0.74.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.2
  - @happyvertical/sql@0.74.2

## 0.74.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.1
  - @happyvertical/sql@0.74.1

## 0.74.0

### Patch Changes

- Updated dependencies [a6730c1]
  - @happyvertical/sql@0.74.0
  - @happyvertical/utils@0.74.0

## 0.73.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.73.4
  - @happyvertical/sql@0.73.4

## 0.73.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.73.3
  - @happyvertical/sql@0.73.3

## 0.73.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.73.2
  - @happyvertical/sql@0.73.2

## 0.73.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.73.1
  - @happyvertical/sql@0.73.1

## 0.73.0

### Patch Changes

- @happyvertical/sql@0.73.0
- @happyvertical/utils@0.73.0

## 0.72.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.72.3
  - @happyvertical/sql@0.72.3

## 0.72.2

### Patch Changes

- Updated dependencies
  - @happyvertical/sql@0.72.2
  - @happyvertical/utils@0.72.2

## 0.72.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.72.1
  - @happyvertical/sql@0.72.1

## 0.72.0

### Patch Changes

- @happyvertical/sql@0.72.0
- @happyvertical/utils@0.72.0

## 0.71.34

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.34
  - @happyvertical/sql@0.71.34

## 0.71.33

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.33
  - @happyvertical/sql@0.71.33

## 0.71.32

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.32
  - @happyvertical/sql@0.71.32

## 0.71.31

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.31
  - @happyvertical/sql@0.71.31

## 0.71.30

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.30
  - @happyvertical/sql@0.71.30

## 0.71.29

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.29
  - @happyvertical/sql@0.71.29

## 0.71.28

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.28
  - @happyvertical/sql@0.71.28

## 0.71.27

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.27
  - @happyvertical/sql@0.71.27

## 0.71.26

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.26
  - @happyvertical/sql@0.71.26

## 0.71.25

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.25
  - @happyvertical/sql@0.71.25

## 0.71.24

### Patch Changes

- @happyvertical/sql@0.71.24
- @happyvertical/utils@0.71.24

## 0.71.23

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.23
  - @happyvertical/sql@0.71.23

## 0.71.22

### Patch Changes

- @happyvertical/sql@0.71.22
- @happyvertical/utils@0.71.22

## 0.71.20

### Patch Changes

- @happyvertical/sql@0.71.20
- @happyvertical/utils@0.71.20

## 0.71.19

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.19
  - @happyvertical/sql@0.71.19

## 0.71.18

### Patch Changes

- @happyvertical/sql@0.71.18
- @happyvertical/utils@0.71.18

## 0.71.17

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.17
  - @happyvertical/sql@0.71.17

## 0.71.16

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.16
  - @happyvertical/sql@0.71.16

## 0.71.15

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.15
  - @happyvertical/sql@0.71.15

## 0.71.14

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.14
  - @happyvertical/sql@0.71.14

## 0.71.13

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.13
  - @happyvertical/sql@0.71.13

## 0.71.12

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.12
  - @happyvertical/sql@0.71.12

## 0.71.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.11
  - @happyvertical/sql@0.71.11

## 0.71.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.10
  - @happyvertical/sql@0.71.10

## 0.71.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.9
  - @happyvertical/sql@0.71.9

## 0.71.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.8
  - @happyvertical/sql@0.71.8

## 0.71.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.7
  - @happyvertical/sql@0.71.7

## 0.71.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.6
  - @happyvertical/sql@0.71.6

## 0.71.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.5
  - @happyvertical/sql@0.71.5

## 0.71.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.4
  - @happyvertical/sql@0.71.4

## 0.71.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.3
  - @happyvertical/sql@0.71.3

## 0.71.2

### Patch Changes

- Updated dependencies [8202b19]
  - @happyvertical/utils@0.71.2
  - @happyvertical/sql@0.71.2

## 0.71.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.1
  - @happyvertical/sql@0.71.1

## 0.71.0

### Patch Changes

- Updated dependencies [dac9026]
  - @happyvertical/sql@0.71.0
  - @happyvertical/utils@0.71.0

## 0.70.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.7
  - @happyvertical/sql@0.70.7

## 0.70.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.6
  - @happyvertical/sql@0.70.6

## 0.70.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.5
  - @happyvertical/sql@0.70.5

## 0.70.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.4
  - @happyvertical/sql@0.70.4

## 0.70.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.3
  - @happyvertical/sql@0.70.3

## 0.70.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.2
  - @happyvertical/sql@0.70.2

## 0.70.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.1
  - @happyvertical/sql@0.70.1

## 0.70.0

### Patch Changes

- Updated dependencies [919efea]
  - @happyvertical/sql@0.70.0
  - @happyvertical/utils@0.70.0

## 0.69.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.9
  - @happyvertical/sql@0.69.9

## 0.69.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.8
  - @happyvertical/sql@0.69.8

## 0.69.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.7
  - @happyvertical/sql@0.69.7

## 0.69.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.6
  - @happyvertical/sql@0.69.6

## 0.69.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.5
  - @happyvertical/sql@0.69.5

## 0.69.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.4
  - @happyvertical/sql@0.69.4

## 0.69.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.3
  - @happyvertical/sql@0.69.3

## 0.69.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.2
  - @happyvertical/sql@0.69.2

## 0.69.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.1
  - @happyvertical/sql@0.69.1

## 0.69.0

### Patch Changes

- @happyvertical/sql@0.69.0
- @happyvertical/utils@0.69.0

## 0.68.13

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.13
  - @happyvertical/sql@0.68.13

## 0.68.12

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.12
  - @happyvertical/sql@0.68.12

## 0.68.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.11
  - @happyvertical/sql@0.68.11

## 0.68.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.10
  - @happyvertical/sql@0.68.10

## 0.68.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.9
  - @happyvertical/sql@0.68.9

## 0.68.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.8
  - @happyvertical/sql@0.68.8

## 0.68.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.7
  - @happyvertical/sql@0.68.7

## 0.68.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.6
  - @happyvertical/sql@0.68.6

## 0.68.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.5
  - @happyvertical/sql@0.68.5

## 0.68.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.4
  - @happyvertical/sql@0.68.4

## 0.68.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.3
  - @happyvertical/sql@0.68.3

## 0.68.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.2
  - @happyvertical/sql@0.68.2

## 0.68.1

### Patch Changes

- Updated dependencies [34f0da0]
  - @happyvertical/sql@0.68.1
  - @happyvertical/utils@0.68.1

## 0.68.0

### Patch Changes

- @happyvertical/sql@0.68.0
- @happyvertical/utils@0.68.0

## 0.67.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.9
  - @happyvertical/sql@0.67.9

## 0.67.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.8
  - @happyvertical/sql@0.67.8

## 0.67.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.7
  - @happyvertical/sql@0.67.7

## 0.67.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.6
  - @happyvertical/sql@0.67.6

## 0.67.5

### Patch Changes

- @happyvertical/sql@0.67.5
- @happyvertical/utils@0.67.5

## 0.67.4

### Patch Changes

- Updated dependencies [db40a0a]
  - @happyvertical/utils@0.67.4
  - @happyvertical/sql@0.67.4

## 0.67.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.3
  - @happyvertical/sql@0.67.3

## 0.67.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.2
  - @happyvertical/sql@0.67.2

## 0.67.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.1
  - @happyvertical/sql@0.67.1

## 0.67.0

### Minor Changes

- 9fef9e5: Add Claude Code context installation CLI for each package

  Each SDK package now ships with Claude Code context files that can be installed into downstream projects:

  - **CLI command**: Run `npx have-{pkgname}-context` (e.g., `npx have-ai-context`)
  - **CLAUDE.md**: Full documentation for AI-assisted development
  - **.claude-meta.json**: Concise metadata with key exports, patterns, and pitfalls

  Files are installed to the downstream project's `.claude/` directory as `have-{pkgname}.md` and `have-{pkgname}.meta.json`.

### Patch Changes

- Updated dependencies [9fef9e5]
  - @happyvertical/sql@0.67.0
  - @happyvertical/utils@0.67.0

## 0.66.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.11
  - @happyvertical/sql@0.66.11

## 0.66.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.10
  - @happyvertical/sql@0.66.10

## 0.66.9

### Patch Changes

- Updated dependencies [8f80804]
  - @happyvertical/sql@0.66.9
  - @happyvertical/utils@0.66.9

## 0.66.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.8
  - @happyvertical/sql@0.66.8

## 0.66.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.7
  - @happyvertical/sql@0.66.7
