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

Initial implementation validation: all 26 package tests passed; package build and typecheck passed.
Root `pnpm test:ci-scripts` passed all 85 tests; `pnpm agent:check` passed.
Root `pnpm build`, `pnpm typecheck`, and `pnpm lint` passed with
`--filter=@happyvertical/spreadsheets... --filter=@happyvertical/sdk-mcp...`.
The affected build graph contains spreadsheets, sdk-mcp, ai, files and utils;
Turbo executes only tasks those packages define. `pnpm install` and
`pnpm install --frozen-lockfile` passed. Workspace consistency, a built-root
consumer smoke, `git diff --check`, and a control-byte scan of changed text and
the new package's dist output also passed.

Self-review covered the full change, including shared ZIP policy,
actual inflation bounds, descriptor/CRC checks, XML rejection and resource limits,
formula handling, serialization, profiling, and the browser import graph.
Independent integrated review and publication belong to the coordinating session;
this implementation worker did not change claims, push or open a PR.

## Coordinator feedback test additions

| Behavior / trigger | Positive case | Negative case | Runtime / level / command |
| --- | --- | --- | --- |
| Shared files archive entry | built subpath bundles and executes with Web APIs, signed/unsigned descriptors (including CRC/signature collision) | missing/misplaced/tampered descriptor, conflicting local metadata, overlap/path attacks | Node + browser-like VM / package integration / `pnpm --filter @happyvertical/files test` |
| Spreadsheet shared archive import | all existing producer and root browser tests | existing hostile archive cases | Node + browser-like VM / integration / `pnpm --filter @happyvertical/spreadsheets test` |

Actor/executor remain a single caller and in-memory bytes; authentication,
persistence and transactions are N/A. The browser check resolves the published
subpath after building files, rather than importing source directly.

| Compression behavior / trigger | Positive case | Negative case | Runtime / command |
| --- | --- | --- | --- |
| Writer's deflated worksheet above ratio floor | 200,000 repetitive cells read back with defaults; independent ratio/floor overrides; valid small worksheet above 200:1 | low ratio above floor fails with typed error | Node / `pnpm --filter @happyvertical/spreadsheets test` |
| Untrusted DEFLATE stream with understated ZIP sizes | ordinary deflated producer fixtures | real compressed bomb exceeds actual per-entry or total cap despite forged size and permissive ratio | Node / same command |

The primary protection is the actual inflated-byte count checked on every output
chunk. Ratio enforcement uses actual inflated bytes per entry only above an
8 MiB default floor, with a secondary default ratio of 1,000:1; both are options.

Coordinator-feedback validation: 29 spreadsheet tests pass, including the
200,000-cell compressed workbook, valid XML above 200:1, configurable ratio/floor,
and forged-size bombs hitting actual per-entry and aggregate caps. Files' 83
archive/browser tests and 210 tests excluding loopback/MinIO suites pass. Both
package builds and typechecks pass. Root CI-script tests (85), agent context,
affected-graph build/typecheck/lint, workspace consistency and built-root smoke
pass. A scan of 86 changed/generated text files found no stray control bytes.
The loopback suites await clarification of the earlier no-network-services
constraint; MinIO tests require containers and remain outside the allowed run.

## F2: bounded processing of hostile workbook structure

One untrusted local-byte caller; pure in-memory parsing/profiling. Authentication,
transactions and services are N/A. Node execution plus the existing browser-root
bundle check cover the runtime boundary. Command: package `pnpm test`.

| Invariant / reachable trigger | Positive | Negative | Level / external edge |
| --- | --- | --- | --- |
| Name/table resolution uses workbook indexes | scoped names and contextual table columns preserve existing evidence | 100k names × 100k named formulas finish or typed limit | hostile integration / OOXML + model |
| Structural metadata and part references are bounded | ordinary names/tables/validations/merges | configured limits and duplicate tablePart references | unit + hostile ZIP |
| Formula tokenization is linear and cached | quoted sheets, calls, arguments, references and normalized patterns reuse one scan | 8192-char nested calls and unclosed brackets/quotes across cells | hostile integration / formula text |
| Profile inner work is bounded | business workbook evidence unchanged | wide cross-sheet overlaps, disconnected regions, many totals and large shared values | unit + hostile model |
| CSV/format processing cannot amplify shared strings | ordinary conservative CSV types and format kinds | long fields/formats and sparse dense expansion stop within budget | unit / text + model |

Each hostile case records processing wall time and asserts under 5 seconds.
Regressions are checked with deterministic limit assertions as well as timings;
the new inner-work limits do not exist on the reviewed base.

F2 validation (processing times exclude fixture/model construction):

| Hostile processing case | Wall time (ms) |
| --- | ---: |
| 100k names × 100k formulas / defaults | 473.52 |
| 100k names × 100k formulas / indexed read + profile | 972.99 |
| 8192-char nested calls × 1000 cells | 394.23 |
| 8192-char unclosed brackets × 1000 cells | 285.31 |
| 8192-char unclosed quotes × 1000 cells | 283.72 |
| 100k duplicate tablePart references / default | 105.10 |
| 100k duplicate tablePart references / one parsed table | 137.14 |
| 16,384 × 16,384 overlap columns | 108.12 |
| 100k disconnected regions | 374.93 |
| 8192-char shared formula × 5000 followers | 36.40 |
| 1000 shared 1M-character values | 3.12 |
| 100k-char number format × 10k cells | 38.81 |
| 500k-character hostile CSV field | 18.50 |
| CSV repeated 1M-character values | 0.39 |

All timed cases assert less than 5,000 ms. The raised-name-limit case completes
both reading and profiling with all 100,000 names and formula cells; duplicate
parts with a raised reference limit produce exactly one table. Default limits
and the work/depth guards return `SpreadsheetError` / `LIMIT_EXCEEDED`.

Safe base regression: source from reviewed revision `7653a6c3` accepted two
names with `maxDefinedNames: 1`; the same bytes on this revision throw typed
`LIMIT_EXCEEDED` with `limit: maxDefinedNames`. The old large quadratic probe was
not run; the index and timing tests exercise the full large case on this fix.

Final commands: package `pnpm build`, `pnpm test` (40 passed), `pnpm typecheck`,
`pnpm lint`, root `pnpm install --frozen-lockfile`, and `pnpm agent:check` passed.
The lockfile was verified unchanged. The original 29 feature/interoperability
checks, including the 200,000-cell compressed export and browser entry check,
remain green. No container/network-service suites were needed for this fix.

## F3: default capacity and formula error evidence (Refs #1510)

Session train declaration: happyvertical/sdk, current SDK release line 0.111.x,
branch `feat/issue-1510-spreadsheets`; Task A (Refs #1510) precedes Task B
(Refs #1511). User scope excludes remote issue/claim/label/push/PR lifecycle,
containers/network services, manual changesets and lockfile edits. Integrated
review runs once after both tasks; this section records Task A's narrow evidence.

Risk: standard. One caller supplies untrusted local bytes or an in-memory model.
Executor/transaction: N/A, no persistence or service; authentication/tenancy,
retry/rollback: N/A, pure parsing/profile and in-memory serialization. Runtime:
Node 24.22.1 and browser Web APIs; large-scale execution measured on Node, while
browser coverage is the existing root bundle/VM smoke (not a browser engine or
million-cell browser memory certification). Release impact: corrected fixed
limit defaults and formula parsing; no new dependency, schema or export.

| Behavior/invariant | Reachable trigger | Positive | Negative/failure | External contract edge | Level / validation |
| --- | --- | --- | --- | --- | --- |
| Default capacity survives formula fill-down | 100k unique `A{row}*2` formulas | default read/profile, exact normalized pattern and dependency | cache cap 1 stays usable; repeated uncached scans exhaust explicit work cap | OOXML formula text, optional limits | regression / package test |
| Ordinary large data fits work and XML caps | 500k numeric rows; 1M numeric cells in a 1000×1000 sheet | read/profile 500k, write/read 1M with exact end value | original hostile structural/text/ZIP limit cases remain typed | untrusted OOXML and exported XLSX | integration round trip / package test |
| CSV within input cap fits character work | 20 MiB CSV, 20,480 text records | default read retains final record | existing malformed quoting, invalid UTF-8 and cell/field limits | RFC 4180 local bytes | regression / package test |
| Error literals do not corrupt extraction | bare and quoted/unquoted sheet-qualified `#REF!`, all common error constants followed by cells/functions | broken references retain unresolved `name: '#REF!'`; later A1/B2/C3 and SUM survive | no dependency edge from broken placeholders; existing unknown-format and invalid-limit tests remain | formula metadata, original text retained | unit / package test |
| Raised defaults keep amplification bounded | shared 8192-character formula × 20k followers and prior hostile corpus | ordinary capacity tests complete | formula work rejects expansion; all timed hostile cases below 5s | attacker-controlled XML/model/formula | hostile integration / package test |

All rows use `pnpm --filter @happyvertical/spreadsheets test`. Each row inherits
the actor, executor and runtime context above; package `build`, `typecheck` and
`lint` additionally validate exports and supported types. No network or browser
service is started.

Default budget arithmetic: reader work = default `maxTotalBytes` (256 Mi units),
formula work = 128 × default `maxCells` (128M), profile work = 128 × default
`maxProfileCells` (256M), dependency checks = 8 × default `maxCells` (8M).
The bounds stay fixed when callers change other options. For a million-cell,
one-column `A{row}*2` fill-down, length ≤10 and ≤3 lexemes, each uncached scan
costs ≤14 units. Parsing adds one reference unit; normalization adds ≤11;
profile's second scan adds ≤14. Formula work is therefore ≤39M per profile and
≤15M per read, below 128M even after the 50k cache fills. Sorting costs ≤20M;
XML allocations/attributes plus parsing and final reference resolution cost
under 60M reader units. One-region dependency processing costs four checks per
cell, below 8M; combined profile operations stay under 100M. This arithmetic
covers ordinary short formulas, not arbitrary formula text or many-region
cross-products; those retain independent guards. The measured formula test is
100k rows; a million formula cells were not allocated for this arithmetic check.

The former 32 MiB entry, two-million node and eight-million text/attribute caps
conflicted with million-cell sheets. Defaults now allow 128 MiB per part,
256 MiB aggregate, five-million XML nodes and 32 Mi UTF-16 text/attribute units.
The compressed/local input cap remains 32 MiB. Text-heavy workbooks may hit byte
or text caps before the cell cap. This preserves independent safety bounds.

Base regression: copied tracked source from `34bed575138ea4adbbb0eb6e44f37c0284fdb70e`
into `/tmp/sdk-1510-base` and ran the identical new `scale.test.ts` with
`pnpm --filter @happyvertical/spreadsheets exec vitest --config
/Users/will/Work/_trees/sdk/1510-spreadsheets/vitest.package.config.ts run --root
/tmp/sdk-1510-base --no-file-parallelism`. All six cases failed against base:
100k formulas/cache-cap probe hit `maxFormulaCacheEntries`; 500k rows and 20 MiB
CSV hit `maxReadWork`; 1M write hit `maxEntryBytes`; error-reference metadata was
incorrect. Full output: `/tmp/sdk-1510-base-test.log`.

Isolated scale commands prefix `/usr/bin/time -l` to
`pnpm --filter @happyvertical/spreadsheets test src/scale.test.ts -t '<pattern>'
--no-file-parallelism`. Each scenario runs in a separate process. Wall time below
measures processing only; peak RSS is the test worker's process-lifetime high
water mark, including fixture/model construction and Vitest overhead. RSS is
reported by Node `process.resourceUsage().maxRSS` in KiB. `/usr/bin/time` logs also
capture the command's memory counters; no RSS assertions depend on host load.

| Pattern / scenario | Processing wall ms | Peak RSS MiB | Log |
| --- | ---: | ---: | --- |
| `100000` / fill-down read + profile | 2,212.82 | 835.1 | `/tmp/sdk-1510-isolated-100k.log` |
| `500000` / plain read + profile | 7,443.68 | 1,455.2 | `/tmp/sdk-1510-isolated-500k.log` |
| `one million` / numeric write + read | 11,642.10 | 1,827.5 | `/tmp/sdk-1510-isolated-million.log` |
| `20 MiB` / CSV read | 753.87 | 219.4 | `/tmp/sdk-1510-isolated-csv.log` |

One million cells is practical only as a heavyweight Node batch workload with
adequate memory; roughly 1.8 GiB RSS is not a sane interactive/browser default
workload. The requested default capacity remains 1M. Applications can adopt a
lower upload admission policy (for example 250k cells) and measure their target
devices/content; no lower browser capacity guarantee is implied. The reader
retains an XML tree alongside the sparse model, rather than streaming cells.

Final Task A validation: package `build` passed (Vite 2.76s), `typecheck` passed,
`lint` passed (17 source files), and `git diff --check` passed. Final unmodified
package test command passed all 46 tests in 41.06s; full output is
`/tmp/sdk-1510-task-a-final-test.log`. The fourteen timed hostile probes ranged
from 0.53ms to 2,243.45ms, all below 5,000ms. Build/type/lint outputs are
`/tmp/sdk-1510-task-a-{build,typecheck,lint}.log`. Foreman separately completed
`pnpm install --frozen-lockfile`; this task did not alter the lockfile.

Intentional test adaptation: the unclosed-quote probe may now finish with empty
dependency evidence rather than hit the old eight-million XML-text ceiling;
it still asserts the same wall-time bound and accepts only typed limit errors
on failure. Shared-formula amplification now uses 20k followers rather than 5k
so that it deterministically exceeds the larger default formula-work budget.
All original feature/interoperability/browser-root checks remain green. No
containers, network services, remote lifecycle writes or Task B edits occurred.

Accepted review correction: the XML-node default is 5 × default maxCells (5M).
One inline-string cell per row consumes row+c+is+t = four nodes, so a million
rows plus worksheet/sheetData wrappers consume 4,000,002 nodes; the previous
4M ceiling was two nodes short. The focused `inline-string XML node headroom`
test asserts this default-cap arithmetic and parses a representative 1,000-row
fixture (4,002 nodes) with a proportional 5,000-node cap. The exact 4,002 cap
also passes and 4,001 throws typed LIMIT_EXCEEDED/maxXmlNodes. This tests the
parser's actual node accounting without another million-cell allocation.

Correction validation: `pnpm --filter @happyvertical/spreadsheets test
src/scale.test.ts -t 'inline-string XML node headroom'` passed (20ms test;
967ms runner), followed by package `build` (2.86s), `typecheck`, `lint` and
`git diff --check`, all green. Outputs are `/tmp/sdk-1510-node-headroom-*.log`.
The previous full 46-test/hostile evidence remains applicable; only the node
ceiling was raised, with one additional focused boundary test (47 total tests).
