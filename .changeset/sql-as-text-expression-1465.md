---
"@happyvertical/sql": minor
---

`buildAggregate` expressions gain `{ op: 'asText', operand }`, a cast to the dialect's text type, so a join can compare a text reference with a native uuid id on PostgreSQL (#1465).
