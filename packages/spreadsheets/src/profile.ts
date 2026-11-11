import {
  resolveLimits,
  SpreadsheetError,
  type SpreadsheetLimits,
  WorkBudget,
} from './errors.js';
import {
  type ArgumentSpan,
  FormulaScanner,
  normalizeFormula,
} from './formula.js';
import {
  address,
  type Cell,
  type CellType,
  contains,
  type FormatKind,
  type Point,
  type Range,
  type Reference,
  type Workbook,
} from './model.js';
import { WorkbookIndex } from './reference-index.js';

export interface ProfileOptions extends Partial<SpreadsheetLimits> {
  maxProfileWork?: number;
  overlapThreshold?: number;
  sampleSize?: number;
  maxProfileCells?: number;
  maxColumnPairs?: number;
  maxDependencyChecks?: number;
}
export interface ColumnProfile {
  id: string;
  column: number;
  header?: string;
  typeCounts: Record<CellType, number>;
  blankCount: number;
  distinctCount: number;
  /** Distinct nonblank values divided by nonblank cells. */
  uniqueness: number;
  min?: Cell['value'];
  max?: Cell['value'];
  samples: Cell['value'][];
  dominantFormatKind?: FormatKind;
  formulaDriven: boolean;
  formulaPatterns: { pattern: string; count: number }[];
}
export interface RegionProfile {
  id: string;
  sheet: string;
  range: Range;
  headerRowCandidates: number[];
  totalsRows: number[];
  columns: ColumnProfile[];
}
export interface ColumnLink {
  region: string;
  column: number;
}
export interface LookupEvidence {
  cell: string;
  sheet: string;
  function: string;
  keyColumn?: ColumnLink;
  targetRegion?: string;
  returnedColumn?: ColumnLink;
}
export interface AggregateEvidence {
  cell: string;
  sheet: string;
  function: string;
  criteriaColumns: ColumnLink[];
  measureColumn?: ColumnLink;
}
export interface WorkbookProfile {
  sheets: { name: string; regions: RegionProfile[] }[];
  /** Edges run from the formula column to the columns it reads. */
  dependencies: { from: ColumnLink; to: ColumnLink }[];
  lookups: LookupEvidence[];
  aggregates: AggregateEvidence[];
  overlaps: {
    from: ColumnLink;
    to: ColumnLink;
    sharedDistinct: number;
    share: number;
  }[];
}

const valueKey = (value: Cell['value']) =>
  value instanceof Date
    ? `date:${value.toISOString()}`
    : `${typeof value}:${String(value)}`;
const nonblank = (cell: Cell) =>
  cell.value !== null && cell.value !== '' && cell.type !== 'empty';
const emptyCounts = (): Record<CellType, number> => ({
  text: 0,
  number: 0,
  boolean: 0,
  date: 0,
  error: 0,
  empty: 0,
});
const link = (region: RegionProfile, column: number): ColumnLink => ({
  region: region.id,
  column,
});
const linkKey = (value: ColumnLink) => `${value.region}:${value.column}`;

/** Four-neighbor blocks of occupied cells, independent of worksheet dimensions. */
function blocks(cells: Map<string, Point>, work: WorkBudget): Range[] {
  const pending = new Map(cells);
  const result: Range[] = [];
  for (const first of cells.values()) {
    work.spend();
    if (!pending.has(address(first))) continue;
    const queue = [first];
    pending.delete(address(first));
    const start = { ...first };
    const end = { ...first };
    for (let i = 0; i < queue.length; i++) {
      work.spend(5);
      const p = queue[i];
      start.row = Math.min(start.row, p.row);
      start.col = Math.min(start.col, p.col);
      end.row = Math.max(end.row, p.row);
      end.col = Math.max(end.col, p.col);
      for (const n of [
        { row: p.row - 1, col: p.col },
        { row: p.row + 1, col: p.col },
        { row: p.row, col: p.col - 1 },
        { row: p.row, col: p.col + 1 },
      ]) {
        if (n.row < 1 || n.row > 1048576 || n.col < 1 || n.col > 16384)
          continue;
        const key = address(n);
        if (pending.has(key)) {
          pending.delete(key);
          queue.push(n);
        }
      }
    }
    result.push({ start, end });
  }
  return result.sort((a, b) => {
    work.spend();
    return a.start.row - b.start.row || a.start.col - b.start.col;
  });
}

export function profileWorkbook(
  workbook: Workbook,
  options: ProfileOptions = {},
): WorkbookProfile {
  const opts = {
    maxProfileWork: 20_000_000,
    overlapThreshold: 0.5,
    sampleSize: 5,
    maxProfileCells: 2_000_000,
    maxColumnPairs: 100_000,
    maxDependencyChecks: 1_000_000,
    ...Object.fromEntries(
      Object.entries(options).filter(([, value]) => value !== undefined),
    ),
  };
  for (const [key, value] of Object.entries(opts)) {
    if (
      key === 'overlapThreshold'
        ? !Number.isFinite(value) || value < 0 || value > 1
        : !Number.isSafeInteger(value) || value <= 0
    )
      throw new SpreadsheetError('INVALID_INPUT', 'Invalid profile options.');
  }
  const work = new WorkBudget(opts.maxProfileWork);
  const limits = resolveLimits(options);
  const scanner = new FormulaScanner(limits, (n) => work.spend(n));
  const referenceIndex = new WorkbookIndex(workbook, limits, scanner, (n) =>
    work.spend(n),
  );
  const entriesBySheet = new Map<Workbook['sheets'][number], [Point, Cell][]>();
  const profile: WorkbookProfile = {
    sheets: [],
    dependencies: [],
    lookups: [],
    aggregates: [],
    overlaps: [],
  };
  const distinct = new Map<string, Set<string>>();
  let visits = 0;
  let checks = 0;
  const bounded = (actual: number, max: number) => {
    if (actual > max)
      throw new SpreadsheetError(
        'LIMIT_EXCEEDED',
        'Workbook profile work limit exceeded.',
      );
  };
  for (const sheet of workbook.sheets) {
    bounded(visits + sheet.cells.size, opts.maxProfileCells);
    // Bound comparison sorting before invoking SparseCells' ordered iterator.
    work.spend(
      sheet.cells.size *
        Math.max(1, Math.ceil(Math.log2(sheet.cells.size + 1))),
    );
    const entries = [...sheet.cells];
    entriesBySheet.set(sheet, entries);
    const occupied = new Map<string, Point>();
    for (const [p, cell] of entries) {
      work.spend();
      bounded(++visits, opts.maxProfileCells);
      if (nonblank(cell) || cell.formula || cell.type === 'error')
        occupied.set(address(p), p);
    }
    const regions: RegionProfile[] = [];
    for (const [index, range] of blocks(occupied, work).entries()) {
      visits +=
        (range.end.row - range.start.row + 1) *
        (range.end.col - range.start.col + 1);
      bounded(visits, opts.maxProfileCells);
      const region: RegionProfile = {
        id: `${sheet.name}!${address(range.start)}:${address(range.end)}#${index + 1}`,
        sheet: sheet.name,
        range,
        headerRowCandidates: [],
        totalsRows: [],
        columns: [],
      };
      const width = range.end.col - range.start.col + 1;
      for (
        let row = range.start.row;
        row <= Math.min(range.start.row + 2, range.end.row - 1);
        row++
      ) {
        let headers = 0;
        for (let col = range.start.col; col <= range.end.col; col++) {
          work.spend();
          const cell = sheet.cells.get(row, col);
          if (cell?.type === 'text' && nonblank(cell) && !cell.formula)
            headers++;
        }
        if (headers >= Math.ceil(width * 0.6))
          region.headerRowCandidates.push(row);
      }
      // A totals row must be trailing and aggregate an earlier part of this block.
      for (let row = range.end.row; row > range.start.row; row--) {
        let totals = false;
        for (let col = range.start.col; col <= range.end.col; col++) {
          work.spend();
          const formula = sheet.cells.get(row, col)?.formula;
          if (formula)
            work.spend(formula.functions.length + formula.references.length);
          if (
            formula?.functions.some((f) =>
              ['SUM', 'SUBTOTAL', 'AGGREGATE'].includes(f),
            ) &&
            formula.references.some(
              (r) =>
                !r.name &&
                (!r.sheet || r.sheet === sheet.name) &&
                r.range.start.row >= range.start.row &&
                r.range.end.row < row &&
                r.range.start.col >= range.start.col &&
                r.range.end.col <= range.end.col,
            )
          )
            totals = true;
        }
        if (!totals) break;
        region.totalsRows.push(row);
      }
      region.totalsRows.reverse();
      const totalsRows = new Set(region.totalsRows);
      const header = region.headerRowCandidates[0];
      for (let col = range.start.col; col <= range.end.col; col++) {
        const headerValue =
          header === undefined
            ? undefined
            : sheet.cells.get(header, col)?.value;
        work.spend(
          typeof headerValue === 'string' ? headerValue.length + 1 : 1,
        );
        const column: ColumnProfile = {
          id: `${region.id}:${col}`,
          column: col,
          header:
            header === undefined
              ? undefined
              : String(sheet.cells.get(header, col)?.value ?? ''),
          typeCounts: emptyCounts(),
          blankCount: 0,
          distinctCount: 0,
          uniqueness: 0,
          samples: [],
          formulaDriven: false,
          formulaPatterns: [],
        };
        const values = new Set<string>();
        const formats = new Map<FormatKind, number>();
        const patterns = new Map<string, number>();
        let count = 0;
        let extremaType: string | undefined;
        let mixedExtrema = false;
        for (let row = range.start.row; row <= range.end.row; row++) {
          work.spend();
          if (row === header || totalsRows.has(row)) continue;
          work.spend();
          const cell = sheet.cells.get(row, col);
          column.typeCounts[cell?.type ?? 'empty']++;
          if (!cell || (!nonblank(cell) && cell.type !== 'error'))
            column.blankCount++;
          else {
            count++;
            work.spend(
              typeof cell.value === 'string' ? cell.value.length + 1 : 1,
            );
            const key =
              cell.type === 'error'
                ? `error:${cell.error ?? ''}`
                : valueKey(cell.value);
            if (!values.has(key) && column.samples.length < opts.sampleSize)
              column.samples.push(
                cell.value instanceof Date ? new Date(cell.value) : cell.value,
              );
            values.add(key);
            if (cell.type !== 'error') {
              const type =
                cell.value instanceof Date ? 'date' : typeof cell.value;
              if (extremaType && extremaType !== type) {
                mixedExtrema = true;
                delete column.min;
                delete column.max;
              }
              extremaType = type;
              if (!mixedExtrema) {
                const value = cell.value as string | number | boolean | Date;
                if (
                  column.min === undefined ||
                  value < (column.min as typeof value)
                )
                  column.min = value instanceof Date ? new Date(value) : value;
                if (
                  column.max === undefined ||
                  value > (column.max as typeof value)
                )
                  column.max = value instanceof Date ? new Date(value) : value;
              }
            }
            if (cell.formatKind)
              formats.set(
                cell.formatKind,
                (formats.get(cell.formatKind) ?? 0) + 1,
              );
          }
          if (cell?.formula) {
            column.formulaDriven = true;
            const pattern = normalizeFormula(
              cell.formula,
              { row, col },
              scanner,
            );
            patterns.set(pattern, (patterns.get(pattern) ?? 0) + 1);
          }
        }
        column.distinctCount = values.size;
        column.uniqueness = count ? values.size / count : 0;
        column.dominantFormatKind = [...formats].sort(
          (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
        )[0]?.[0];
        column.formulaPatterns = [...patterns].map(([pattern, count]) => ({
          pattern,
          count,
        }));
        distinct.set(column.id, values);
        region.columns.push(column);
      }
      regions.push(region);
    }
    profile.sheets.push({ name: sheet.name, regions });
  }
  const regions = profile.sheets.flatMap((s) => s.regions);
  const resolve = (
    reference: Reference,
    currentSheet: string,
    origin: Point,
    depth = 0,
  ): ColumnLink[] => {
    work.spend();
    bounded(++checks, opts.maxDependencyChecks);
    if (depth > 16) return [];
    if (reference.name) {
      const resolved = referenceIndex.resolve(reference, currentSheet, origin);
      return resolved
        ? resolve(
            { ...resolved, name: undefined },
            currentSheet,
            origin,
            depth + 1,
          )
        : [];
    }
    const targets: ColumnLink[] = [];
    for (const region of regions) {
      work.spend();
      bounded(++checks, opts.maxDependencyChecks);
      const r = reference.range;
      if (
        region.sheet.toLowerCase() !==
          (reference.sheet ?? currentSheet).toLowerCase() ||
        r.end.row < region.range.start.row ||
        r.start.row > region.range.end.row
      )
        continue;
      for (const column of region.columns) {
        work.spend();
        bounded(++checks, opts.maxDependencyChecks);
        if (column.column >= r.start.col && column.column <= r.end.col)
          targets.push(link(region, column.column));
      }
    }
    return targets;
  };
  const edgeKeys = new Set<string>();
  for (const sheet of workbook.sheets)
    for (const [origin, cell] of entriesBySheet.get(sheet) ?? []) {
      if (!cell.formula) continue;
      const region = regions.find((r) => {
        work.spend();
        bounded(++checks, opts.maxDependencyChecks);
        return r.sheet === sheet.name && contains(r.range, origin);
      });
      if (!region) continue;
      const from = link(region, origin.col);
      for (const reference of cell.formula.references)
        for (const to of resolve(reference, sheet.name, origin)) {
          work.spend();
          const key = `${linkKey(from)}>${linkKey(to)}`;
          if (!edgeKeys.has(key)) {
            edgeKeys.add(key);
            profile.dependencies.push({ from, to });
          }
        }
      const scan = scanner.scan(cell.formula.text);
      const calls = scan.calls;
      const argLinks = (arg: ArgumentSpan | undefined): ColumnLink[] => {
        if (!arg) return [];
        const links: ColumnLink[] = [];
        for (let i = arg.refStart; i < arg.refEnd; i++) {
          work.spend();
          for (const target of resolve(
            scan.references[i].reference,
            sheet.name,
            origin,
          )) {
            work.spend();
            links.push(target);
          }
        }
        return links;
      };
      const argumentText = (arg: ArgumentSpan | undefined) => {
        if (!arg) return undefined;
        work.spend(arg.to - arg.from);
        return scan.text.slice(arg.from, arg.to).trim();
      };
      for (const call of calls) {
        work.spend();
        if (['VLOOKUP', 'XLOOKUP', 'INDEX'].includes(call.name)) {
          const lookup: LookupEvidence = {
            cell: address(origin),
            sheet: sheet.name,
            function: call.name,
          };
          if (call.name === 'VLOOKUP') {
            lookup.keyColumn = argLinks(call.args[0])[0];
            const target = argLinks(call.args[1]);
            lookup.targetRegion = target[0]?.region;
            const offset = Number(argumentText(call.args[2]));
            if (Number.isInteger(offset) && offset > 0)
              lookup.returnedColumn = target[offset - 1];
          } else if (call.name === 'XLOOKUP') {
            lookup.keyColumn = argLinks(call.args[0])[0];
            lookup.targetRegion = argLinks(call.args[1])[0]?.region;
            lookup.returnedColumn = argLinks(call.args[2])[0];
          } else {
            const argument = call.args[1];
            const match = argument
              ? calls.find((c) => {
                  work.spend();
                  return (
                    c.name === 'MATCH' &&
                    c.from >= argument.from &&
                    c.to <= argument.to
                  );
                })
              : undefined;
            if (!match) continue;
            lookup.keyColumn = argLinks(match.args[0])[0];
            const target = argLinks(call.args[0]);
            lookup.targetRegion = target[0]?.region;
            const index =
              call.args[2] === undefined
                ? 1
                : Number(argumentText(call.args[2]));
            if (Number.isInteger(index) && index > 0)
              lookup.returnedColumn = target[index - 1];
          }
          profile.lookups.push(lookup);
        }
        if (/^(SUM|COUNT|AVERAGE)IFS?$/.test(call.name)) {
          const plural = call.name.endsWith('IFS');
          const count = call.name.startsWith('COUNT');
          const criteria: ColumnLink[] = [];
          if (plural)
            for (let i = count ? 0 : 1; i < call.args.length; i += 2) {
              for (const target of argLinks(call.args[i])) {
                work.spend();
                criteria.push(target);
              }
            }
          else {
            for (const target of argLinks(call.args[0])) {
              work.spend();
              criteria.push(target);
            }
          }
          profile.aggregates.push({
            cell: address(origin),
            sheet: sheet.name,
            function: call.name,
            criteriaColumns: criteria,
            measureColumn: count
              ? undefined
              : argLinks(
                  plural ? call.args[0] : (call.args[2] ?? call.args[0]),
                )[0],
          });
        }
      }
    }
  let pairs = 0;
  // Group by sheet so same-sheet disconnected regions never create a quadratic
  // cross-product merely to be skipped. Preflight every cross-sheet product.
  for (let sa = 0; sa < profile.sheets.length; sa++)
    for (let sb = sa + 1; sb < profile.sheets.length; sb++) {
      const left = profile.sheets[sa].regions;
      const right = profile.sheets[sb].regions;
      work.spend();
      bounded(pairs + left.length * right.length, opts.maxColumnPairs);
      for (const ar of left)
        for (const br of right) {
          work.spend();
          pairs += ar.columns.length * br.columns.length;
          bounded(pairs, opts.maxColumnPairs);
          for (const ac of ar.columns)
            for (const bc of br.columns) {
              work.spend();
              const av = distinct.get(ac.id) as Set<string>;
              const bv = distinct.get(bc.id) as Set<string>;
              if (!av.size || !bv.size) continue;
              let shared = 0;
              for (const value of av.size < bv.size ? av : bv) {
                work.spend(value.length + 1);
                bounded(++checks, opts.maxDependencyChecks);
                if (av.has(value) && bv.has(value)) shared++;
              }
              for (const [from, to, size] of [
                [link(ar, ac.column), link(br, bc.column), av.size],
                [link(br, bc.column), link(ar, ac.column), bv.size],
              ] as [ColumnLink, ColumnLink, number][]) {
                if (shared && shared / size >= opts.overlapThreshold)
                  profile.overlaps.push({
                    from,
                    to,
                    sharedDistinct: shared,
                    share: shared / size,
                  });
              }
            }
        }
    }
  return profile;
}
