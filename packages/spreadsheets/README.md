# @happyvertical/spreadsheets

Bounded, network-free XLSX and CSV adapters for Node and browsers. Read workbook
structure, retain formulas and cached values, export a workbook, and profile the
evidence in its cells. Formulas are never evaluated.

```ts
import {
  getSpreadsheets,
  profileWorkbook,
  createWorkbook,
  createSheet,
  parseFormula,
} from '@happyvertical/spreadsheets';

const xlsx = await getSpreadsheets({ type: 'xlsx', maxCells: 100_000 });
const workbook = await xlsx.read(bytes); // Uint8Array or ArrayBuffer
const profile = profileWorkbook(workbook);
const output = await xlsx.write(workbook, {
  boldHeaderRow: true,
  columnWidths: [24, 16, 16],
});

const sheet = createSheet('Orders');
sheet.cells.set('A1', { type: 'text', value: 'Quantity' });
sheet.cells.set(2, 1, { type: 'number', value: 3 });
sheet.cells.set('B2', {
  type: 'number', value: 30, // cached value supplied by the caller
  formula: parseFormula('A2*10'),
  numberFormat: '$#,##0.00',
});
await xlsx.write(createWorkbook([sheet]));
```

## Model

All coordinates are **one-based**. Ranges have inclusive `start` and `end`
coordinates. `SparseCells` supports `get('A1')`, `get(row, col)`, matching `set`
overloads, `[point, cell]` iteration, and `rows()` yielding sorted
`[row, ReadonlyMap<column, Cell>]` pairs. Empty dimensions never allocate dense
arrays. Use `point`, `address`, `range`, and `rangeAddress` to convert A1 notation.

The workbook carries sheets, defined names, a date system, and source format.
Sheets carry visibility, dimensions, merges, tables, validation rules, frozen
panes, and optional column widths. Cells carry typed values, number formats,
format kinds, errors, and formula metadata. Formula text omits its leading `=`;
its dialect is `excel-a1`. Shared formulas expand per cell; array anchors retain
`arrayRange`. The formula cell's value is its cached result, or null when absent.

References retain absolute flags, quoted sheet names, A1 ranges, whole-column/
row ranges, and defined/table names. Named references resolve against local then
global names and common table selectors, including `[@Column]`. Unresolved names
retain `name`; their placeholder range must not be treated as a resolved target.
Arbitrary Excel expressions and external-workbook references are not evaluated.
Original formula text is always retained; profiling exposes only resolved edges.

Dates are UTC `Date` values derived from number formats and the 1900/1904 flag.
`raw` preserves the serial. Excel's fictitious serial 60 maps to 1900-02-28 in
JavaScript; `raw: 60` distinguishes it from serial 59 and is retained on export
while the value remains unchanged. Time-only formats use the same serial epoch.

## CSV

```ts
const csv = await getSpreadsheets({ type: 'csv' });
const workbook = await csv.read(bytes); // comma, semicolon, tab or pipe detection
const output = await csv.write(workbook, { delimiter: ',', bom: true });
```

CSV supports RFC 4180 quoting, embedded newlines, escaped quotes, UTF-8 BOM,
ragged/empty rows, and explicit delimiters. Detection counts separators outside
quotes on the first record. There is one sheet; multi-sheet CSV writes fail.
Numbers with leading zeroes, surrounding whitespace, more than 15 digits or
unsafe magnitude stay text. Booleans and valid ISO dates/UTC timestamps are
typed. Every parsed field retains `originalText`; writing preserves it while it
still represents the current value. CSV text beginning with `=` stays text.
Output uses CRLF. Expanding sparse coordinates into CSV is bounded by `maxCells`.

## Profiling

`profileWorkbook` is pure and deterministic. It reports four-neighbor connected
blocks of occupied cells as rectangular regions. Up to the first three rows
are header candidates when at least 60% of columns contain nonformula text;
the first candidate is excluded from statistics. Trailing rows with `SUM`,
`SUBTOTAL`, or `AGGREGATE` references into the block above are totals candidates
and are also excluded from column statistics. These are explicit structural
heuristics, not inferred business meanings.

Column statistics include headers, type and blank counts, distinct nonblank
values, uniqueness (distinct / nonblank), samples, dominant format kind, and
formula counts by R1C1-relative pattern. Min/max use numeric, chronological,
lexical, or boolean order for homogeneous values; mixed types omit extrema.
Dependency edges run **from the formula column to the column it reads**.
Lookup evidence covers direct VLOOKUP/XLOOKUP and INDEX with MATCH arguments;
aggregate evidence covers SUMIF(S), COUNTIF(S), and AVERAGEIF(S). Dynamic targets
remain unresolved. Cross-sheet overlaps are directional, type-sensitive shares
of distinct values, with a default threshold of 0.5.

Options: `overlapThreshold` (0–1), `sampleSize` (5), `maxProfileCells` (2,000,000),
`maxColumnPairs` (100,000), `maxDependencyChecks` (8,000,000), and
`maxProfileWork` (256,000,000). Structural and formula limits from the adapter
limits below can also be supplied to profiling. Work-limit
exhaustion throws `SpreadsheetError` rather than returning partial evidence.

## Safety and limits

`SpreadsheetError.code` is a closed union: `UNSUPPORTED_FORMAT`, `INVALID_INPUT`,
`INVALID_ZIP`, `UNSAFE_ZIP`, `UNSUPPORTED_ZIP`, `INVALID_XML`, `LIMIT_EXCEEDED`,
`INVALID_WORKBOOK`. Errors never include cell contents or archive paths.
All adapter limits can be set at construction or overridden per read/write:

| Option | Default |
| --- | ---: |
| maxInputBytes | 32 MiB |
| maxEntries | 10,000 |
| maxEntryBytes | 128 MiB |
| maxTotalBytes | 256 MiB |
| maxCompressionRatio | 1,000 |
| compressionRatioFloorBytes | 8 MiB |
| maxPathBytes | 1,024 |
| maxXmlDepth | 64 |
| maxXmlText (UTF-16 code units, text and attributes per part) | 33,554,432 |
| maxXmlNodes (per part) | 5,000,000 |
| maxSheets | 128 |
| maxCells (also bounds column-width expansion) | 1,000,000 |
| maxSharedStrings | 500,000 |
| maxFormulaLength | 8,192 |
| maxDefinedNames (workbook) | 10,000 |
| maxTables (workbook) | 1,000 |
| maxDataValidations (rules and cumulative target ranges) | 10,000 |
| maxMerges (workbook) | 10,000 |
| maxPartReferences (per archive part) | 1 |
| maxReadWork (reader/serialization operation units) | 268,435,456 |
| maxFormulaWork (operation units per read/profile) | 128,000,000 |
| maxFormulaDepth | 128 |
| maxFormulaTokens (per formula) | 2,048 |
| maxFormulaCacheEntries (per read/profile) | 50,000 |
| maxRows | 1,048,576 |
| maxColumns | 16,384 |

Names are indexed by lowercased name and scope once per read/profile. Tables
have name/column maps and a per-sheet column/row index for contextual selectors;
references never rebuild or scan the workbook's name/table arrays. XML parts
are parsed once, and repeated references are limited. Raising
`maxPartReferences` permits repeated tablePart references while retaining one
parsed table; repeated worksheet parts remain invalid.

The formula tokenizer makes one character pass and one pass over its tokens,
using a cache keyed by formula text for each read/profile operation. References,
function/argument spans and relative patterns reuse that scan. Unclosed strings
remain verbatim; excessive nesting/tokens/work fail with typed
`LIMIT_EXCEEDED`. Cache saturation stops retaining new scans; it never rejects a
formula. Uncached scans still charge their full work. Shared-formula expansion
charges generated text before copying. Error literals are atomic tokens;
`#REF!` and sheet-qualified broken references retain `name: '#REF!'` with an
unresolved placeholder range, and never produce dependency edges. References
and functions following an error literal are still extracted.

Work budgets charge XML node/attribute allocation, inner loops, sorting
comparisons or conservative sort
bounds, visited reference/column pairs, and processed/output string lengths.
Profiling uses sets for totals membership and distinct samples, visits each
region cell once during discovery, and preflights cross-sheet overlap products.
Shared long values, wide tables, formula copies, CSV fields and output expansion
consume budgets even when their input strings were shared. Exceeding a budget
returns no partial result.

Default work ceilings are sized from the structural caps: `maxReadWork` equals
the default aggregate inflated-byte cap (256 Mi units), covering the CSV reader's
two character passes over its 32 MiB input cap and XML allocation/sorting charges.
`maxFormulaWork` allows 128 units per default `maxCells` (128 million);
`maxProfileWork` allows 128 units per default `maxProfileCells` (256 million),
and `maxDependencyChecks` allows eight checks per default `maxCells`.
These are fixed defaults; changing a size cap does not automatically raise a
work cap. A million short numeric/formula cells fit these operation ceilings;
longer formulas, many regions and shared large values can still exhaust them.
The 128 MiB part, five-million XML-node and 32 Mi-code-unit text/attribute caps
allow a million ordinary numeric or inline-string cells, including one cell per row; the former
32 MiB/two-million/eight-million caps did not. The node ceiling allows five nodes per default cell: four for each inline-string
row/cell/is/t chain plus wrapper and metadata headroom. Long inline text remains bounded
independently of cell count.

The reader builds an XML tree and a sparse cell model in memory. Million-cell
read/write is a heavyweight Node batch workload (roughly 2 GiB peak RSS in the
regression run), not an interactive browser sizing target. Applications can start
with a lower admission policy such as `{ maxCells: 250_000 }` for interactive or
browser uploads, then measure their own content and device memory; this is not a
browser capacity guarantee. Smaller browser-root
round trips remain covered by the browser Web API smoke test. These limits may
reject otherwise valid large files;
raise the relevant option explicitly for a trusted workload.

ZIP metadata inspection reuses the browser-safe `@happyvertical/files/archive`
subpath. It rejects
traversal, collisions, symlinks/special files, encryption, ZIP64, and multi-disk
archives. It accepts standard data descriptors only at the exact centrally
declared boundary. Inflation runs in small chunks with actual-byte checks and
CRC verification. Absolute per-entry and aggregate inflated-byte caps are
enforced on every output chunk independently of declared sizes. The per-entry
ratio check is secondary: it compares actual inflated bytes with compressed
entry bytes only after the actual size exceeds `compressionRatioFloorBytes`.
The 8 MiB floor and 1,000:1 ratio are configurable at construction or per read.
Small repetitive XML parts are accepted regardless of ratio while absolute caps
remain active. No path is extracted to the filesystem. Output uses DEFLATE at
fflate's default compression level.

Runtime dependencies are the SDK's `@happyvertical/files/archive` entry and
**fflate**, imported through its browser entry.
A purpose-built UTF-8 XML tokenizer handles OOXML's needed grammar with bounded
depth, text, and nodes; it rejects all DTD/declaration markup, unknown entities,
and malformed nesting. Only the five predefined XML entities and numeric
character references are decoded. It never fetches external entities or parts.
This avoids another parser dependency and any configurable entity expansion.

XLSX writing supports typed values, formulas, number formats, optional bold
headers, widths, multiple sheets, merges, names, tables, validation lists, and
panes. Unsupported artwork, charts, pivots, comments, macros and other OOXML
parts are ignored on read and omitted on write. This is a structural data export,
not a lossless document editor. ODS, XLS and service adapters are outside scope.

## Development

```bash
pnpm install --frozen-lockfile
pnpm --filter @happyvertical/spreadsheets build
pnpm --filter @happyvertical/spreadsheets test
pnpm --filter @happyvertical/spreadsheets typecheck
pnpm --filter @happyvertical/spreadsheets lint
```

Tests build detailed fixtures in code, check hostile archives/XML, profile a
small-business workbook, and bundle/run the root with browser Web APIs and no
Node imports. Small independent Excel, LibreOffice and Google Sheets fixtures
from readxl have [pinned provenance and license](test/fixtures/README.md).
Opening exports in the actual three applications remains a separate manual
interoperability check.
