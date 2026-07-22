---
'@happyvertical/sql': minor
---

**Breaking:** condition keys are now validated as plain SQL identifiers whether or not they carry an operator suffix. Previously a key ending in a recognised operator (`>`, `like`, `in`, …) suppressed identifier validation for the whole key, so everything before the operator was emitted as raw SQL — `{ "name = '' OR 1=1 --  =": x }` was accepted and injected. Keys *without* an operator suffix were already validated, which made the escape hatch easy to cross by accident: the same condition object was safe or unsafe depending on whether the caller appended an operator.

Expression keys now require the new `raw()` marker, which states that the SQL is caller-authored:

```typescript
import { buildWhere, raw } from '@happyvertical/sql';

buildWhere({ 'LOWER(status) =': 'paid' });          // now throws
buildWhere({ [raw('LOWER(status) =')]: 'paid' });   // WHERE LOWER(status) = $1
```

`raw()` prefixes the expression with a fixed, non-secret marker that `buildWhere` strips before emitting SQL. The point is worth stating plainly: this stops an expression key being used *by accident* — the shape of the key no longer grants raw access, only a call to `raw()` does — but it is not a sanitizer. A caller that maps an entire attacker-controlled string into a key, marker included, can still reach raw SQL, so continue to validate at your own trust boundary. The marker holds no secret, so keys stay readable in errors, logs and `DatabaseError` context, and wrapping one expression never changes what an unmarked key means elsewhere.

This also removes an inconsistency inside the package: `buildAggregate` already validated where-keys regardless of operator suffix and rejected the expression shape `buildWhere` accepted. Both builders now behave the same, `buildAggregate` composes its `HAVING` expressions through `raw()`, and a `raw()` key in `having` is emitted verbatim instead of being expanded as a select alias.

**Scope of the break.** This is not limited to callers of `buildWhere` and `buildAggregate`. Every adapter routes the caller's `where` through `buildWhere`, so `get`, `list`, `update`, `delete`, `count` and `getOrInsert` on the PostgreSQL, SQLite, sqlite-native, DuckDB and JSON adapters are affected too — `db.list('users', { 'LOWER(email) =': x })` now throws. (`upsert` matches on `conflictColumns`, not a `where`, so it is unaffected.)

To migrate, wrap developer-authored expression keys in `raw()`. Plain identifiers, with or without operator suffixes (`'price >'`, `'orders.total <='`), are unaffected. Note that enforcement is at runtime: `WhereClause` keys are plain `string`, so TypeScript will not flag an unmarked expression key at the call site.
