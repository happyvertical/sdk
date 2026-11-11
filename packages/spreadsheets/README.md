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
`maxColumnPairs` (100,000), and `maxDependencyChecks` (1,000,000). Work-limit
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
| maxEntryBytes | 32 MiB |
| maxTotalBytes | 128 MiB |
| maxCompressionRatio | 200 |
| maxPathBytes | 1,024 |
| maxXmlDepth | 64 |
| maxXmlText (UTF-16 code units, text and attributes per part) | 8,388,608 |
| maxXmlNodes (per part) | 2,000,000 |
| maxSheets | 128 |
| maxCells (also bounds column-width expansion) | 1,000,000 |
| maxSharedStrings | 500,000 |
| maxFormulaLength | 8,192 |
| maxRows | 1,048,576 |
| maxColumns | 16,384 |

The private ZIP manifest implementation mirrors `packages/files/src/archive.ts`
because `@happyvertical/files` exposes it through a Node-only root. It rejects
traversal, collisions, symlinks/special files, encryption, ZIP64, and multi-disk
archives. It accepts standard data descriptors only at the exact centrally
declared boundary. Inflation runs in small chunks with actual-byte checks and
CRC verification. No path is extracted to the filesystem. Output uses stored
ZIP entries, avoiding compression-ratio rejection on its own exports.

The only runtime dependency is **fflate**, imported through its browser entry.
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
