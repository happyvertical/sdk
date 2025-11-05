---
---

Add dependency cascade trigger to changesets workflow.

When packages are published via the changesets workflow, the cascade now triggers to update downstream repositories (SMRT, Praeco, Caelus). This was accidentally removed when implementing changesets in #372.
