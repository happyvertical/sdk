---
"@happyvertical/sql": minor
---

Add aliased joins, closed row expressions, expression grouping keys, row predicates and filtered aggregates to `buildAggregate()`. Specs without the new fields compile as before. A dotted column with no `as` now aliases to its last segment, and duplicate select aliases are rejected.
