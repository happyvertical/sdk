---
'@happyvertical/jobs': patch
---

Stop `update()` in the SQLite and PostgreSQL job stores from resolving caller-supplied keys through the prototype chain.

Both adapters mapped each update key to a column with `const column = fieldMap[key]; if (!column) continue;`. `fieldMap` is a plain object literal, so the falsy guard ran against a lookup that falls through to `Object.prototype`: `update(id, { constructor: 1 })` resolved to the native `Object` constructor and interpolated `function Object() { [native code] } = ?` into the `SET` clause, and under prototype pollution elsewhere in the process an inherited string was spliced straight into the clause, rewriting an unrelated column on the targeted row. Values were always bound, but the column name was not. The column lookup now guards with `Object.hasOwn`.

The status-change event branch had the same shape: it read `updates.status` directly, which also traverses the prototype chain, so a polluted `Object.prototype.status` could make an unrelated update emit a spurious `job.completed`, `job.failed`, or `job.cancelled`. It now reads `status` only when it is an own property of `updates`.
