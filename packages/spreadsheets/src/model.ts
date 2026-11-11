import { invalid } from './errors.js';

/** Coordinates are one-based throughout the public model. */
export interface Point {
  row: number;
  col: number;
}
export interface Range {
  start: Point;
  end: Point;
}
export interface Reference {
  sheet?: string;
  range: Range;
  absolute: {
    startRow: boolean;
    startCol: boolean;
    endRow: boolean;
    endCol: boolean;
  };
  name?: string;
}
export interface Formula {
  /** Formula text without a leading equals sign. No evaluation is performed. */
  text: string;
  dialect: 'excel-a1';
  references: Reference[];
  functions: string[];
  arrayRange?: Range;
}
export type CellType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'error'
  | 'empty';
export type FormatKind =
  | 'general'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'time'
  | 'datetime'
  | 'text';
export interface Cell {
  value: string | number | boolean | Date | null;
  type: CellType;
  raw?: number;
  /** Original lexical field for CSV. */
  originalText?: string;
  error?: string;
  formula?: Formula;
  numberFormat?: string;
  formatKind?: FormatKind;
}
export interface Table {
  name: string;
  range: Range;
  headerRow: boolean;
  totalsRow: boolean;
  columns: string[];
}
export interface DataValidation {
  ranges: Range[];
  kind: 'list' | 'whole' | 'decimal' | 'date' | 'textLength' | 'custom';
  values?: string[];
  source?: Reference;
  formula?: string;
}
export interface DefinedName {
  name: string;
  scope?: string;
  reference?: Reference;
  text: string;
}
export interface Sheet {
  name: string;
  state: 'visible' | 'hidden' | 'veryHidden';
  dimension?: Range;
  cells: SparseCells;
  merges: Range[];
  tables: Table[];
  validations: DataValidation[];
  frozen?: { rows: number; cols: number };
  columnWidths?: Record<number, number>;
}
export interface Workbook {
  sheets: Sheet[];
  definedNames: DefinedName[];
  dateSystem: 1900 | 1904;
  source: { format: string };
}

export function columnName(col: number): string {
  if (!Number.isInteger(col) || col < 1 || col > 16384)
    invalid('Invalid cell coordinate.');
  let result = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}
export function address(point: Point): string {
  return `${columnName(point.col)}${point.row}`;
}
export function point(a1: string): Point {
  const match = /^\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6})$/.exec(a1);
  if (!match) invalid('Invalid cell address.');
  let col = 0;
  for (const char of match[1].toUpperCase())
    col = col * 26 + char.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (col > 16384 || row > 1048576) invalid('Invalid cell coordinate.');
  return { row, col };
}
export function range(a1: string): Range {
  const parts = a1.split(':');
  if (parts.length > 2) invalid('Invalid cell range.');
  const start = point(parts[0]);
  const end = point(parts[1] ?? parts[0]);
  if (end.row < start.row || end.col < start.col)
    invalid('Invalid cell range.');
  return { start, end };
}
export function rangeAddress(value: Range): string {
  return `${address(value.start)}:${address(value.end)}`;
}
export function contains(value: Range, p: Point): boolean {
  return (
    p.row >= value.start.row &&
    p.row <= value.end.row &&
    p.col >= value.start.col &&
    p.col <= value.end.col
  );
}

/** Sparse storage; iteration and rows are ordered numerically, never by dimension. */
export class SparseCells implements Iterable<[Point, Cell]> {
  private readonly data = new Map<number, Map<number, Cell>>();
  private count = 0;
  get size(): number {
    return this.count;
  }
  get(a1: string): Cell | undefined;
  get(row: number, col: number): Cell | undefined;
  get(row: string | number, col?: number): Cell | undefined {
    const p = typeof row === 'string' ? point(row) : { row, col: col ?? 0 };
    return this.data.get(p.row)?.get(p.col);
  }
  set(a1: string, cell: Cell): this;
  set(row: number, col: number, cell: Cell): this;
  set(row: string | number, col: number | Cell, cell?: Cell): this {
    const p =
      typeof row === 'string' ? point(row) : { row, col: col as number };
    if (!Number.isInteger(p.row) || p.row < 1 || p.row > 1048576)
      invalid('Invalid cell coordinate.');
    columnName(p.col);
    let cells = this.data.get(p.row);
    if (!cells) {
      cells = new Map();
      this.data.set(p.row, cells);
    }
    if (!cells.has(p.col)) this.count++;
    cells.set(p.col, (typeof row === 'string' ? col : cell) as Cell);
    return this;
  }
  *rows(): IterableIterator<[number, ReadonlyMap<number, Cell>]> {
    for (const row of [...this.data.keys()].sort((a, b) => a - b)) {
      yield [
        row,
        new Map([...(this.data.get(row) ?? [])].sort(([a], [b]) => a - b)),
      ];
    }
  }
  *[Symbol.iterator](): IterableIterator<[Point, Cell]> {
    for (const [row, cells] of this.rows())
      for (const [col, cell] of cells) yield [{ row, col }, cell];
  }
}
export function createSheet(name: string): Sheet {
  return {
    name,
    state: 'visible',
    cells: new SparseCells(),
    merges: [],
    tables: [],
    validations: [],
  };
}
export function createWorkbook(sheets: Sheet[] = []): Workbook {
  return {
    sheets,
    definedNames: [],
    dateSystem: 1900,
    source: { format: 'model' },
  };
}
