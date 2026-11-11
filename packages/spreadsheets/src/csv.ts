import {
  checkLimit,
  invalid,
  SpreadsheetError,
  type SpreadsheetLimits,
  WorkBudget,
} from './errors.js';
import { validateWorkbook } from './io.js';
import { type Cell, createSheet, type Workbook } from './model.js';
import type { ReadOptions, WriteOptions } from './types.js';

function delimiterOption(value: string): string {
  if (value.length !== 1 || /["\r\n\0]/.test(value))
    throw new SpreadsheetError(
      'INVALID_INPUT',
      'CSV delimiter must be one non-quote, non-newline character.',
    );
  return value;
}
function detect(text: string): string {
  const counts = new Map([
    [',', 0],
    [';', 0],
    ['\t', 0],
    ['|', 0],
  ]);
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (c === '\r' || c === '\n') break;
      if (counts.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}
export function readCsv(
  bytes: Uint8Array,
  limits: SpreadsheetLimits,
  options: ReadOptions,
): Workbook {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, '');
  } catch {
    throw new SpreadsheetError('INVALID_INPUT', 'CSV must be valid UTF-8.');
  }
  const work = new WorkBudget(limits.maxReadWork, 'maxReadWork');
  work.spend(text.length);
  const delimiter = delimiterOption(options.delimiter ?? detect(text));
  const sheet = createSheet(options.sheetName ?? 'Sheet1');
  let row = 1;
  let col = 1;
  let field = '';
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  let record = false;
  const flush = () => {
    work.spend(field.length + 1);
    checkLimit(sheet.cells.size + 1, 'maxCells', limits);
    checkLimit(row, 'maxRows', limits);
    checkLimit(col, 'maxColumns', limits);
    sheet.cells.set(row, col++, csvCell(field));
    field = '';
    state = 'start';
    record = true;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (state === 'quoted') {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else state = 'closed';
      } else field += c;
    } else if (c === delimiter) flush();
    else if (c === '\r' || c === '\n') {
      flush();
      if (c === '\r' && text[i + 1] === '\n') i++;
      row++;
      col = 1;
      record = false;
    } else if (c === '"' && state === 'start') state = 'quoted';
    else {
      if (state === 'closed' || c === '"')
        throw new SpreadsheetError('INVALID_INPUT', 'Malformed CSV quoting.');
      field += c;
      state = 'plain';
    }
    checkLimit(field.length, 'maxXmlText', limits);
  }
  if (state === 'quoted')
    throw new SpreadsheetError('INVALID_INPUT', 'Unterminated CSV field.');
  if (record || field.length || state !== 'start') flush();
  return {
    sheets: [sheet],
    definedNames: [],
    dateSystem: 1900,
    source: { format: 'csv' },
  };
}
function csvCell(text: string): Cell {
  const base = {
    originalText: text,
    numberFormat: 'General',
    formatKind: 'general' as const,
  };
  if (!text.length) return { ...base, value: null, type: 'empty' };
  if (/^(true|false)$/i.test(text))
    return { ...base, value: text.toLowerCase() === 'true', type: 'boolean' };
  // Leading zeroes, whitespace, unsafe integers and non-finite values stay text.
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) {
    const value = Number(text);
    if (
      Number.isFinite(value) &&
      Math.abs(value) <= Number.MAX_SAFE_INTEGER &&
      text.replace(/[^\d]/g, '').length <= 15
    )
      return { ...base, value, type: 'number' };
  }
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(text)) {
    const value = new Date(text);
    if (
      Number.isFinite(value.getTime()) &&
      value.toISOString().slice(0, 10) === text.slice(0, 10)
    )
      return {
        ...base,
        value,
        type: 'date',
        numberFormat: text.includes('T')
          ? 'yyyy-mm-dd"T"hh:mm:ss'
          : 'yyyy-mm-dd',
        formatKind: text.includes('T') ? 'datetime' : 'date',
      };
  }
  return { ...base, value: text, type: 'text' };
}
export function writeCsv(
  workbook: Workbook,
  limits: SpreadsheetLimits,
  options: WriteOptions,
): Uint8Array {
  validateWorkbook(workbook, limits);
  if (workbook.sheets.length !== 1)
    invalid('CSV requires exactly one worksheet.');
  const delimiter = delimiterOption(options.delimiter ?? ',');
  const sheet = workbook.sheets[0];
  let lastRow = 0;
  let lastCol = 0;
  for (const [p] of sheet.cells) {
    lastRow = Math.max(lastRow, p.row);
    lastCol = Math.max(lastCol, p.col);
  }
  // Dense CSV expansion of sparse coordinates is explicitly bounded.
  checkLimit(lastRow * lastCol, 'maxCells', limits);
  let output = options.bom ? '\uFEFF' : '';
  let outputUnits = output.length;
  for (let row = 1; row <= lastRow; row++) {
    const fields: string[] = [];
    for (let col = 1; col <= lastCol; col++) {
      const cell = sheet.cells.get(row, col);
      const value =
        !cell || cell.value === null
          ? ''
          : cell.value instanceof Date
            ? cell.value.toISOString()
            : String(cell.value);
      // Preserve lexical input only when it still describes the current value.
      const original = cell?.originalText;
      if (original !== undefined)
        checkLimit(original.length, 'maxXmlText', limits);
      const parsed = original === undefined ? undefined : csvCell(original);
      const same =
        parsed &&
        cell &&
        parsed.type === cell.type &&
        (parsed.value instanceof Date && cell.value instanceof Date
          ? parsed.value.getTime() === cell.value.getTime()
          : parsed.value === cell.value);
      const field = same ? (original as string) : value;
      // Bound each field before escaping or retaining a dense output row.
      outputUnits += field.length + 1;
      checkLimit(outputUnits, 'maxInputBytes', limits);
      fields.push(
        field.includes(delimiter) || /["\r\n]/.test(field)
          ? `"${field.replace(/"/g, '""')}"`
          : field,
      );
    }
    outputUnits++;
    checkLimit(outputUnits, 'maxInputBytes', limits);
    output += `${fields.join(delimiter)}\r\n`;
    checkLimit(output.length, 'maxInputBytes', limits);
  }
  const bytes = new TextEncoder().encode(output);
  checkLimit(bytes.length, 'maxInputBytes', limits);
  return bytes;
}
