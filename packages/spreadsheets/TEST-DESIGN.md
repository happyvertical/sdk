# Issue 1510 test design

All cases use untrusted local bytes and a single caller, without persistence,
transactions, authentication, services, or retries (N/A: pure parsing/profiling
and in-memory serialization). Runtime target: Node and browser Web APIs.
Command for every row: `pnpm --filter @happyvertical/spreadsheets test`.

| Behavior / reachable trigger | Positive case | Failure case | Level / external edge |
| --- | --- | --- | --- |
| Factory called with options | xlsx/csv, optional limits | unknown type, invalid limits | unit / open adapter options |
| XLSX ZIP bytes | classic stored/deflated archives | bombs, forged size, traversal, truncation, encryption, ZIP64, multidisk, counts | unit / untrusted ZIP |
| XML parts | namespaces, escaped Unicode, rich text | DTD/entities, malformed tags, excessive depth/text/nodes | unit / untrusted XML |
| Workbook read | shared/array formulas, names, tables, validation, dates, states, panes | bad relationships, bounds, missing parts, limits | integration / OOXML |
| XLSX output | multiple sheets, typed values, styles, formulas, widths/header | invalid models and output limits | round trip / OOXML consumers |
| CSV bytes | quoting, multiline, BOM, delimiters, conservative types and originals | malformed quotes, oversized fields/rows/cells | unit / RFC 4180 |
| Profiling | business workbook regions/stats/patterns/dependencies/lookups/aggregates/overlaps | sparse/ragged/empty sheets, strings resembling formulas | unit / facts only |
| Browser root import | browser bundle loads with Web APIs | transitive Node builtin imports | bundle smoke / browser module graph |

The suite includes three unmodified, licensed producer files from readxl (Excel,
LibreOffice and Google Sheets; provenance in `test/fixtures/README.md`). All three
read and round-trip. Browser coverage bundles the entire root, rejects Node
builtin imports, and executes XLSX/CSV and profiling in a VM with browser Web
APIs. It is not a real browser-engine run. Opening exports in the actual three
applications was not performed. Base-regression comparison is N/A: this package
does not exist on the base revision.

Final validation: all 26 package tests passed; package build and typecheck passed.
Root `pnpm test:ci-scripts` passed all 85 tests; `pnpm agent:check` passed.
Root `pnpm build`, `pnpm typecheck`, and `pnpm lint` passed with
`--filter=@happyvertical/spreadsheets... --filter=@happyvertical/sdk-mcp...`.
The affected build graph contains spreadsheets, sdk-mcp, ai, files and utils;
Turbo executes only tasks those packages define. `pnpm install` and
`pnpm install --frozen-lockfile` passed. Workspace consistency, a built-root
consumer smoke, `git diff --check`, and a control-byte scan of changed text and
the new package's dist output also passed.

Self-review covered the full change, including mirrored ZIP policy differences,
actual inflation bounds, descriptor/CRC checks, XML rejection and resource limits,
formula handling, serialization, profiling, and the browser import graph.
Independent integrated review and publication belong to the coordinating session;
this implementation worker did not change claims, push or open a PR.
