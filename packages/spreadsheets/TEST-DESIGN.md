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

Real producer files and desktop application interoperability require available
producer files/applications; generated test ZIPs alone cannot prove these.
