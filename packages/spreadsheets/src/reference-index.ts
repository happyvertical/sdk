import { checkLimit, invalid, type SpreadsheetLimits } from './errors.js';
import { directReference, type FormulaScanner } from './formula.js';
import type {
  DefinedName,
  Point,
  Reference,
  Table,
  Workbook,
} from './model.js';

interface IndexedTable {
  sheet: string;
  table: Table;
  columns: Map<string, number>;
}
interface TableInterval {
  start: number;
  end: number;
  value: IndexedTable;
}
interface Selector {
  table: string;
  columns: string[];
  thisRow: boolean;
  headers: boolean;
  all: boolean;
}

/** Built once per read/profile. All per-reference lookups use maps or binary search. */
export class WorkbookIndex {
  private readonly globals = new Map<string, DefinedName>();
  private readonly locals = new Map<string, Map<string, DefinedName>>();
  private readonly tables = new Map<string, IndexedTable>();
  private readonly contextual = new Map<string, Map<number, TableInterval[]>>();
  private readonly selectors = new Map<string, Selector | undefined>();
  constructor(
    workbook: Workbook,
    limits: SpreadsheetLimits,
    scanner: FormulaScanner,
    private readonly spend: (n?: number) => void,
  ) {
    checkLimit(workbook.sheets.length, 'maxSheets', limits);
    checkLimit(workbook.definedNames.length, 'maxDefinedNames', limits);
    for (let defined of workbook.definedNames) {
      spend(defined.name.length + (defined.scope?.length ?? 0) + 1);
      const name = defined.name.toLowerCase();
      if (!defined.reference)
        defined = {
          ...defined,
          reference: directReference(defined.text, scanner),
        };
      if (defined.scope === undefined) {
        if (this.globals.has(name)) invalid('Duplicate defined name.');
        this.globals.set(name, defined);
      } else {
        const scope = defined.scope.toLowerCase();
        let names = this.locals.get(scope);
        if (!names) {
          names = new Map();
          this.locals.set(scope, names);
        }
        if (names.has(name)) invalid('Duplicate defined name.');
        names.set(name, defined);
      }
    }
    let count = 0;
    let merges = 0;
    let validations = 0;
    for (const sheet of workbook.sheets) {
      merges += sheet.merges.length;
      checkLimit(sheet.validations.length, 'maxDataValidations', limits);
      for (const validation of sheet.validations) {
        spend();
        validations += Math.max(1, validation.ranges.length);
      }
      checkLimit(merges, 'maxMerges', limits);
      checkLimit(validations, 'maxDataValidations', limits);
      let cols = this.contextual.get(sheet.name.toLowerCase());
      if (!cols) {
        cols = new Map();
        this.contextual.set(sheet.name.toLowerCase(), cols);
      }
      for (const table of sheet.tables) {
        checkLimit(++count, 'maxTables', limits);
        spend(table.name.length + 1);
        const indexed: IndexedTable = {
          sheet: sheet.name,
          table,
          columns: new Map(),
        };
        table.columns.forEach((name, i) => {
          spend(name.length + 1);
          indexed.columns.set(name.toLowerCase(), i);
        });
        const key = table.name.toLowerCase();
        if (this.tables.has(key)) invalid('Duplicate table name.');
        this.tables.set(key, indexed);
        checkLimit(table.range.end.col, 'maxColumns', limits);
        for (
          let col = table.range.start.col;
          col <= table.range.end.col;
          col++
        ) {
          spend();
          let intervals = cols.get(col);
          if (!intervals) {
            intervals = [];
            cols.set(col, intervals);
          }
          intervals.push({
            start: table.range.start.row,
            end: table.range.end.row,
            value: indexed,
          });
        }
      }
    }
    for (const cols of this.contextual.values())
      for (const intervals of cols.values()) {
        intervals.sort((a, b) => {
          spend();
          return a.start - b.start;
        });
        for (let i = 1; i < intervals.length; i++) {
          spend();
          if (intervals[i].start <= intervals[i - 1].end)
            invalid('Overlapping tables.');
        }
      }
  }
  resolve(
    reference: Reference,
    sheet: string,
    origin: Point,
  ): Reference | undefined {
    if (reference.name === '#REF!') return undefined;
    if (!reference.name) {
      this.spend();
      return reference;
    }
    const original = reference.name;
    let current = reference;
    let local = reference.sheet ?? sheet;
    // Bounded alias traversal, without recursion or repeated workbook scans.
    for (let depth = 0; depth < 32; depth++) {
      const text = current.name;
      if (!text)
        return { ...current, sheet: current.sheet ?? local, name: original };
      this.spend(text.length + local.length + 1);
      const key = text.toLowerCase();
      const scope = (current.sheet ?? local).toLowerCase();
      const defined = this.locals.get(scope)?.get(key) ?? this.globals.get(key);
      if (defined?.reference) {
        local = defined.scope ?? local;
        current = defined.reference;
        continue;
      }
      const selector = this.selector(text);
      if (!selector) return undefined;
      const found = selector.table
        ? this.tables.get(selector.table)
        : this.at(scope, origin);
      if (!found) return undefined;
      const r = found.table.range;
      let start = r.start.col;
      let end = r.end.col;
      if (selector.columns.length) {
        start = 16384;
        end = 0;
        for (const name of selector.columns) {
          this.spend(name.length + 1);
          const col = found.columns.get(name);
          if (col === undefined) return undefined;
          start = Math.min(start, r.start.col + col);
          end = Math.max(end, r.start.col + col);
        }
      }
      return {
        ...reference,
        sheet: found.sheet,
        range: {
          start: {
            row: selector.thisRow
              ? origin.row
              : selector.headers || selector.all
                ? r.start.row
                : r.start.row + (found.table.headerRow ? 1 : 0),
            col: start,
          },
          end: {
            row: selector.thisRow
              ? origin.row
              : selector.headers
                ? r.start.row
                : selector.all
                  ? r.end.row
                  : r.end.row - (found.table.totalsRow ? 1 : 0),
            col: end,
          },
        },
      };
    }
    // Cyclic names remain unresolved. The fixed traversal depth bounds each lookup.
    return undefined;
  }
  private at(sheet: string, origin: Point): IndexedTable | undefined {
    const rows = this.contextual.get(sheet)?.get(origin.col);
    if (!rows) return undefined;
    let lo = 0;
    let hi = rows.length - 1;
    while (lo <= hi) {
      this.spend();
      const mid = (lo + hi) >>> 1;
      const interval = rows[mid];
      if (origin.row < interval.start) hi = mid - 1;
      else if (origin.row > interval.end) lo = mid + 1;
      else return interval.value;
    }
    return undefined;
  }
  private selector(text: string): Selector | undefined {
    if (this.selectors.has(text)) return this.selectors.get(text);
    this.spend(text.length);
    const open = text.indexOf('[');
    if (open < 0 || !text.endsWith(']')) {
      this.selectors.set(text, undefined);
      return undefined;
    }
    const selector: Selector = {
      table: text.slice(0, open).toLowerCase(),
      columns: [],
      thisRow: false,
      headers: false,
      all: false,
    };
    let part = '';
    const flush = () => {
      let name = part.trim();
      part = '';
      if (!name) return;
      if (name.startsWith('@')) {
        selector.thisRow = true;
        name = name.slice(1);
      }
      if (name === '#This Row') selector.thisRow = true;
      else if (name === '#Headers') selector.headers = true;
      else if (name === '#All') selector.all = true;
      else if (!name.startsWith('#') && name)
        selector.columns.push(name.toLowerCase());
    };
    for (let i = open + 1; i < text.length; i++) {
      const c = text[i];
      if (c === '[' || c === ']' || c === ',' || c === ':') flush();
      else part += c;
    }
    flush();
    this.selectors.set(text, selector);
    return selector;
  }
}
