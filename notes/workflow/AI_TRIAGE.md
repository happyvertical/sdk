# AI Triage

AI-powered issue triage is retired from CI.

Current issue automation is deterministic:

- `on-issue-opened.yml` syncs new issues to the configured GitHub Project status `New`.
- `on-issue-closed.yml` syncs closed issues to the configured GitHub Project status `Done`.
- Labels, priority, size, planning, and implementation assignment are handled manually.

The historical AI triage script and composite action have been removed from `.github/`.
