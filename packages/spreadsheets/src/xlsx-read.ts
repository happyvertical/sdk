import { checkLimit, invalid, type SpreadsheetLimits } from './errors.js';
import { BUILTIN_FORMATS, formatKind, serialDate } from './formats.js';
import {
  directReference,
  parseFormula,
  resolveReference,
  translateFormula,
} from './formula.js';
import {
  type Cell,
  createSheet,
  type DataValidation,
  type Point,
  point,
  type Range,
  range,
  type Workbook,
} from './model.js';
import { child, children, parseXml, textContent, type XmlNode } from './xml.js';
import { unzipBounded } from './zip.js';

interface Relationship {
  target: string;
  type: string;
}
const attr = (node: XmlNode, name: string) =>
  node.attrs[name] ??
  Object.entries(node.attrs).find(
    ([key]) => key.split(':').pop() === name,
  )?.[1];
const number = (value: string | undefined, fallback = 0): number => {
  if (value === undefined) return fallback;
  if (
    !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) ||
    !Number.isFinite(Number(value))
  )
    invalid('Invalid numeric workbook field.');
  return Number(value);
};
function integer(value: string | undefined, fallback = 0): number {
  const n = number(value, fallback);
  if (!Number.isSafeInteger(n) || n < 0) invalid('Invalid workbook index.');
  return n;
}
function targetPath(base: string, target: string): string {
  if (/[\\\0?#:]/.test(target)) invalid('Unsafe workbook relationship.');
  const result = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') {
      if (!result.length) invalid('Unsafe workbook relationship.');
      result.pop();
    } else if (part && part !== '.') result.push(part);
  }
  return result.join('/');
}
function boundRange(value: string, limits: SpreadsheetLimits): Range {
  const result = range(value);
  checkLimit(result.end.row, 'maxRows', limits);
  checkLimit(result.end.col, 'maxColumns', limits);
  return result;
}

export function readXlsx(
  bytes: Uint8Array,
  limits: SpreadsheetLimits,
): Workbook {
  const files = unzipBounded(bytes, limits);
  const xmlCache = new Map<string, XmlNode>();
  const xml = (path: string): XmlNode => {
    const existing = xmlCache.get(path);
    if (existing) return existing;
    const data = files.get(path);
    if (!data) invalid('Missing workbook part.');
    const result = parseXml(data, limits);
    xmlCache.set(path, result);
    return result;
  };
  const relationships = (base: string): Map<string, Relationship> => {
    const parts = base.split('/');
    const file = parts.pop() ?? '';
    const relPath = [...parts, '_rels', `${file}.rels`].join('/');
    if (!files.has(relPath)) return new Map();
    const doc = xml(relPath);
    if (doc.name !== 'Relationships') invalid();
    const rels = new Map<string, Relationship>();
    for (const node of children(doc, 'Relationship')) {
      if (node.attrs.TargetMode === 'External') continue;
      const id = node.attrs.Id;
      const target = node.attrs.Target;
      const type = node.attrs.Type;
      if (!id || !target || !type || rels.has(id)) invalid();
      rels.set(id, { target: targetPath(base, target), type });
    }
    return rels;
  };
  const rootRels = relationships('');
  const workbookPath = [...rootRels.values()].find((r) =>
    r.type.endsWith('/officeDocument'),
  )?.target;
  if (!workbookPath) invalid('Missing workbook relationship.');
  const wbXml = xml(workbookPath);
  if (wbXml.name !== 'workbook') invalid();
  const rels = relationships(workbookPath);
  const part = (suffix: string): string | undefined =>
    [...rels.values()].find((r) => r.type.endsWith(`/${suffix}`))?.target;
  const dateSystem = ['1', 'true'].includes(
    child(wbXml, 'workbookPr')?.attrs.date1904 ?? '',
  )
    ? 1904
    : 1900;
  const workbook: Workbook = {
    sheets: [],
    definedNames: [],
    dateSystem,
    source: { format: 'xlsx' },
  };
  const strings: string[] = [];
  const stringsPath = part('sharedStrings');
  if (stringsPath) {
    const doc = xml(stringsPath);
    if (doc.name !== 'sst') invalid();
    for (const si of children(doc, 'si')) {
      checkLimit(strings.length + 1, 'maxSharedStrings', limits);
      strings.push(richText(si));
    }
  }
  const formats = { ...BUILTIN_FORMATS };
  const styles: string[] = [];
  const stylesPath = part('styles');
  if (stylesPath) {
    const doc = xml(stylesPath);
    if (doc.name !== 'styleSheet') invalid();
    for (const node of child(doc, 'numFmts')?.children ?? []) {
      if (node.name === 'numFmt')
        formats[integer(node.attrs.numFmtId)] =
          node.attrs.formatCode ?? 'General';
    }
    for (const node of child(doc, 'cellXfs')?.children ?? [])
      if (node.name === 'xf')
        styles.push(formats[integer(node.attrs.numFmtId)] ?? 'General');
  }
  let cellCount = 0;
  const sheetNodes = child(wbXml, 'sheets')?.children ?? [];
  checkLimit(sheetNodes.length, 'maxSheets', limits);
  const names = new Set<string>();
  for (const sheetNode of sheetNodes) {
    if (sheetNode.name !== 'sheet') continue;
    const name = sheetNode.attrs.name;
    if (!name || names.has(name.toLowerCase()))
      invalid('Invalid or duplicate sheet name.');
    names.add(name.toLowerCase());
    const rel = rels.get(attr(sheetNode, 'id') ?? '');
    if (!rel?.type.endsWith('/worksheet'))
      invalid('Missing worksheet relationship.');
    const doc = xml(rel.target);
    if (doc.name !== 'worksheet') invalid();
    const sheet = createSheet(name);
    workbook.sheets.push(sheet);
    const state = sheetNode.attrs.state ?? 'visible';
    if (state !== 'visible' && state !== 'hidden' && state !== 'veryHidden')
      invalid('Invalid worksheet state.');
    sheet.state = state;
    const dimension = child(doc, 'dimension')?.attrs.ref;
    if (dimension) sheet.dimension = boundRange(dimension, limits);
    const pane = child(child(doc, 'sheetViews')?.children[0] ?? doc, 'pane');
    if (pane && ['frozen', 'frozenSplit'].includes(pane.attrs.state)) {
      sheet.frozen = {
        rows: integer(pane.attrs.ySplit),
        cols: integer(pane.attrs.xSplit),
      };
      checkLimit(sheet.frozen.rows, 'maxRows', limits);
      checkLimit(sheet.frozen.cols, 'maxColumns', limits);
    }
    const widths: Record<number, number> = {};
    let widthWork = 0;
    for (const col of child(doc, 'cols')?.children ?? []) {
      const min = integer(col.attrs.min);
      const max = integer(col.attrs.max);
      if (min < 1 || max < min) invalid();
      checkLimit(max, 'maxColumns', limits);
      const width = number(col.attrs.width);
      if (width < 0) invalid();
      widthWork += max - min + 1;
      checkLimit(widthWork, 'maxCells', limits);
      for (let i = min; i <= max; i++) widths[i] = width;
    }
    if (Object.keys(widths).length) sheet.columnWidths = widths;
    const shared = new Map<
      number,
      { text: string; origin: Point; range: Range }
    >();
    const followers: { cell: Cell; origin: Point; id: number }[] = [];
    let rowIndex = 0;
    for (const row of child(doc, 'sheetData')?.children ?? []) {
      if (row.name !== 'row') continue;
      rowIndex = integer(row.attrs.r, rowIndex + 1);
      if (rowIndex < 1) invalid();
      checkLimit(rowIndex, 'maxRows', limits);
      let colIndex = 0;
      for (const node of children(row, 'c')) {
        checkLimit(++cellCount, 'maxCells', limits);
        const origin = node.attrs.r
          ? point(node.attrs.r)
          : { row: rowIndex, col: colIndex + 1 };
        if (origin.row !== rowIndex)
          invalid('Cell and row coordinates disagree.');
        checkLimit(origin.row, 'maxRows', limits);
        checkLimit(origin.col, 'maxColumns', limits);
        colIndex = origin.col;
        if (sheet.cells.get(origin.row, origin.col))
          invalid('Duplicate cell coordinate.');
        const format = styles[integer(node.attrs.s)] ?? 'General';
        const kind = formatKind(format);
        const value = child(node, 'v')?.text;
        const type = node.attrs.t;
        if (
          type !== undefined &&
          !['inlineStr', 's', 'str', 'e', 'b', 'd', 'n'].includes(type)
        )
          invalid('Unsupported cell type.');
        let cell: Cell = {
          type: 'empty',
          value: null,
          numberFormat: format,
          formatKind: kind,
        };
        if (type === 'inlineStr')
          cell = {
            ...cell,
            value: child(node, 'is')
              ? richText(child(node, 'is') as XmlNode)
              : '',
            type: 'text',
          };
        else if (type === 's') {
          const index = integer(value);
          if (value === undefined || index >= strings.length)
            invalid('Invalid shared string index.');
          cell.value = strings[index];
          cell.type = 'text';
        } else if (type === 'str') {
          cell.value = decodeOoxmlText(value ?? '');
          cell.type = 'text';
        } else if (type === 'e') {
          cell.error = value ?? '#VALUE!';
          cell.value = null;
          cell.type = 'error';
        } else if (type === 'b' && value !== undefined) {
          if (!['0', '1', 'true', 'false'].includes(value))
            invalid('Invalid boolean cell.');
          cell.value = value === '1' || value === 'true';
          cell.type = 'boolean';
        } else if (type === 'd' && value !== undefined) {
          const date = new Date(value);
          if (!Number.isFinite(date.getTime())) invalid('Invalid date cell.');
          cell.value = date;
          cell.type = 'date';
        } else if (value !== undefined && value !== '') {
          if (type && type !== 'n') invalid('Unsupported cell type.');
          const n = number(value);
          if (['date', 'time', 'datetime'].includes(kind)) {
            cell.value = serialDate(n, dateSystem);
            cell.raw = n;
            cell.type = 'date';
            if (!Number.isFinite(cell.value.getTime()))
              invalid('Date serial exceeds supported range.');
          } else {
            cell.value = n;
            cell.type = 'number';
          }
        }
        const f = child(node, 'f');
        if (f) {
          checkLimit(f.text.length, 'maxFormulaLength', limits);
          if (f.attrs.t === 'shared') {
            if (f.attrs.si === undefined)
              invalid('Missing shared formula index.');
            const id = integer(f.attrs.si);
            if (f.text) {
              if (shared.has(id) || !f.attrs.ref)
                invalid('Invalid shared formula anchor.');
              shared.set(id, {
                text: f.text,
                origin,
                range: boundRange(f.attrs.ref, limits),
              });
              cell.formula = parseFormula(f.text, limits);
            } else followers.push({ cell, origin, id });
          } else {
            cell.formula = parseFormula(f.text, limits);
            if (f.attrs.t === 'array' && f.attrs.ref)
              cell.formula.arrayRange = boundRange(f.attrs.ref, limits);
          }
        }
        sheet.cells.set(origin.row, origin.col, cell);
      }
    }
    for (const follower of followers) {
      const master = shared.get(follower.id);
      if (!master) invalid('Missing shared formula anchor.');
      const p = follower.origin;
      const r = master.range;
      if (
        p.row < r.start.row ||
        p.row > r.end.row ||
        p.col < r.start.col ||
        p.col > r.end.col
      )
        invalid('Shared formula is outside its range.');
      follower.cell.formula = translateFormula(
        master.text,
        master.origin,
        p,
        limits,
      );
    }
    for (const merge of child(doc, 'mergeCells')?.children ?? [])
      sheet.merges.push(boundRange(merge.attrs.ref ?? '', limits));
    for (const node of child(doc, 'dataValidations')?.children ?? []) {
      const kind = node.attrs.type;
      if (
        !['list', 'whole', 'decimal', 'date', 'textLength', 'custom'].includes(
          kind,
        )
      )
        continue;
      const validation: DataValidation = {
        ranges: (node.attrs.sqref ?? '')
          .trim()
          .split(/\s+/)
          .map((s) => boundRange(s, limits)),
        kind: kind as DataValidation['kind'],
      };
      const formula = child(node, 'formula1')?.text;
      if (formula !== undefined) {
        checkLimit(formula.length, 'maxFormulaLength', limits);
        validation.formula = formula;
        if (kind === 'list' && /^".*"$/s.test(formula))
          validation.values = formula
            .slice(1, -1)
            .replace(/""/g, '"')
            .split(',');
        else validation.source = directReference(formula);
      }
      sheet.validations.push(validation);
    }
    const sheetRels = relationships(rel.target);
    for (const node of child(doc, 'tableParts')?.children ?? []) {
      const tableRel = sheetRels.get(attr(node, 'id') ?? '');
      if (!tableRel?.type.endsWith('/table'))
        invalid('Missing table relationship.');
      const table = xml(tableRel.target);
      if (table.name !== 'table') invalid();
      const tableName = table.attrs.displayName ?? table.attrs.name;
      if (!tableName) invalid('Missing table name.');
      const tableRange = boundRange(table.attrs.ref ?? '', limits);
      const tableColumns = (child(table, 'tableColumns')?.children ?? [])
        .filter((c) => c.name === 'tableColumn')
        .map((c) => c.attrs.name);
      if (
        tableColumns.some((name) => !name) ||
        tableColumns.length !== tableRange.end.col - tableRange.start.col + 1
      )
        invalid('Invalid table columns.');
      sheet.tables.push({
        name: tableName,
        range: tableRange,
        headerRow: integer(table.attrs.headerRowCount, 1) > 0,
        totalsRow: integer(table.attrs.totalsRowCount) > 0,
        columns: tableColumns,
      });
    }
  }
  if (!workbook.sheets.length) invalid('Workbook has no worksheets.');
  for (const node of child(wbXml, 'definedNames')?.children ?? []) {
    if (!node.attrs.name) invalid('Missing defined name.');
    checkLimit(node.text.length, 'maxFormulaLength', limits);
    const scope =
      node.attrs.localSheetId !== undefined
        ? workbook.sheets[integer(node.attrs.localSheetId)]?.name
        : undefined;
    if (node.attrs.localSheetId !== undefined && !scope)
      invalid('Invalid defined-name scope.');
    workbook.definedNames.push({
      name: node.attrs.name,
      scope,
      text: node.text,
      reference: directReference(node.text),
    });
  }
  for (const sheet of workbook.sheets) {
    for (const [origin, cell] of sheet.cells)
      if (cell.formula)
        cell.formula.references = cell.formula.references.map(
          (r) => resolveReference(workbook, r, sheet.name, origin) ?? r,
        );
    for (const validation of sheet.validations)
      if (validation.source)
        validation.source =
          resolveReference(
            workbook,
            validation.source,
            sheet.name,
            validation.ranges[0].start,
          ) ?? validation.source;
  }
  return workbook;
}

function richText(node: XmlNode): string {
  return decodeOoxmlText(
    node.children
      .filter((n) => n.name === 't' || n.name === 'r')
      .map((n) =>
        n.name === 't'
          ? textContent(n)
          : children(n, 't').map(textContent).join(''),
      )
      .join(''),
  );
}

function decodeOoxmlText(value: string): string {
  return value.replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}
