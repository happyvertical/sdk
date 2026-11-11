import {
  checkLimit,
  DEFAULT_LIMITS,
  invalid,
  type SpreadsheetLimits,
} from './errors.js';
import {
  address,
  columnName,
  type Formula,
  type Point,
  point,
  type Reference,
} from './model.js';

export interface ReferenceToken {
  from: number;
  to: number;
  reference: Reference;
}
const flags = (start: string, end = start) => ({
  startRow: /\$\d/.test(start),
  startCol: start.startsWith('$'),
  endRow: /\$\d/.test(end),
  endCol: end.startsWith('$'),
});
const noFlags = {
  startRow: false,
  startCol: false,
  endRow: false,
  endCol: false,
};
function unquote(value: string): string {
  return value.startsWith("'") ? value.slice(1, -1).replace(/''/g, "'") : value;
}

/** Lex references outside string literals; unknown syntax remains verbatim. */
export function referenceTokens(text: string): ReferenceToken[] {
  const tokens: ReferenceToken[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '"') {
      i++;
      while (i < text.length) {
        if (text[i++] === '"') {
          if (text[i] !== '"') break;
          i++;
        }
      }
      continue;
    }
    if (/[\w.\]]/.test(text[i - 1] ?? '')) {
      i++;
      continue;
    }
    const rest = text.slice(i);
    const prefix = /^(?:('(?:[^']|'')+'|[\p{L}_\\][\p{L}\p{N}_.\\]*)!)/u.exec(
      rest,
    );
    const sheet = prefix ? unquote(prefix[1]) : undefined;
    const offset = prefix?.[0].length ?? 0;
    const value = rest.slice(offset);
    const cell =
      /^(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})(?::(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}))?(?![\w.(])/i.exec(
        value,
      );
    let reference: Reference | undefined;
    let length = 0;
    if (cell) {
      try {
        const start = point(cell[1]);
        const end = point(cell[2] ?? cell[1]);
        reference = {
          sheet,
          range: { start, end },
          absolute: flags(cell[1], cell[2]),
        };
        length = cell[0].length;
      } catch {
        /* An identifier like XYZ9999999 need not be an A1 reference. */
      }
    }
    if (!reference) {
      const cols = /^(\$?[A-Za-z]{1,3}):(\$?[A-Za-z]{1,3})(?!\w)/.exec(value);
      const rows = /^(\$?[1-9]\d{0,6}):(\$?[1-9]\d{0,6})(?!\w)/.exec(value);
      if (cols) {
        const start = point(`${cols[1]}1`);
        const end = point(`${cols[2]}1048576`);
        reference = {
          sheet,
          range: { start, end },
          absolute: {
            ...noFlags,
            startCol: cols[1].startsWith('$'),
            endCol: cols[2].startsWith('$'),
            startRow: true,
            endRow: true,
          },
        };
        length = cols[0].length;
      } else if (rows) {
        const start = point(`A${rows[1]}`);
        const end = point(`XFD${rows[2]}`);
        reference = {
          sheet,
          range: { start, end },
          absolute: {
            ...noFlags,
            startRow: rows[1].startsWith('$'),
            endRow: rows[2].startsWith('$'),
            startCol: true,
            endCol: true,
          },
        };
        length = rows[0].length;
      } else {
        const name =
          /^([\p{L}_\\][\p{L}\p{N}_.\\]*)(\[(?:[^[\]]|\[[^\]]*\])*\])?/u.exec(
            value,
          );
        if (
          name &&
          !/^\s*\(/.test(value.slice(name[0].length)) &&
          !['TRUE', 'FALSE'].includes(name[1].toUpperCase())
        ) {
          reference = {
            sheet,
            name: name[0],
            range: { start: { row: 1, col: 1 }, end: { row: 1, col: 1 } },
            absolute: { ...noFlags },
          };
          length = name[0].length;
        }
      }
    }
    if (reference) {
      tokens.push({ from: i, to: i + offset + length, reference });
      i += offset + length;
    } else i++;
  }
  return tokens;
}

export function parseFormula(
  input: string,
  limits: SpreadsheetLimits = { ...DEFAULT_LIMITS },
): Formula {
  const text = input.replace(/^=/, '');
  checkLimit(text.length, 'maxFormulaLength', limits);
  const unquoted = text.replace(/"(?:[^"]|"")*"/g, '');
  const functions = [
    ...new Set(
      [...unquoted.matchAll(/([A-Za-z_][\w.]*)\s*\(/g)].map((m) =>
        m[1].replace(/^_xlfn\./i, '').toUpperCase(),
      ),
    ),
  ];
  return {
    text,
    dialect: 'excel-a1',
    references: referenceTokens(text).map((t) => t.reference),
    functions,
  };
}

export function translateFormula(
  text: string,
  from: Point,
  to: Point,
  limits: SpreadsheetLimits,
): Formula {
  const tokens = referenceTokens(text);
  let result = '';
  let offset = 0;
  for (const token of tokens) {
    result += text.slice(offset, token.from);
    const ref = token.reference;
    if (ref.name) result += text.slice(token.from, token.to);
    else {
      const move = (p: Point, rowAbs: boolean, colAbs: boolean) => {
        const row = p.row + (rowAbs ? 0 : to.row - from.row);
        const col = p.col + (colAbs ? 0 : to.col - from.col);
        if (row < 1 || row > 1048576 || col < 1 || col > 16384)
          invalid('Shared formula translation exceeds worksheet bounds.');
        return `${colAbs ? '$' : ''}${columnName(col)}${rowAbs ? '$' : ''}${row}`;
      };
      const prefix = ref.sheet ? `'${ref.sheet.replace(/'/g, "''")}'!` : '';
      result +=
        prefix +
        move(ref.range.start, ref.absolute.startRow, ref.absolute.startCol);
      if (address(ref.range.start) !== address(ref.range.end))
        result += `:${move(ref.range.end, ref.absolute.endRow, ref.absolute.endCol)}`;
    }
    offset = token.to;
  }
  return parseFormula(result + text.slice(offset), limits);
}

/** R1C1-relative pattern; constants and strings are preserved. */
export function normalizeFormula(formula: Formula, origin: Point): string {
  let result = '';
  let offset = 0;
  for (const { from, to, reference: ref } of referenceTokens(formula.text)) {
    result += formula.text.slice(offset, from);
    if (ref.name) result += formula.text.slice(from, to);
    else {
      const format = (p: Point, rowAbs: boolean, colAbs: boolean) =>
        `R${rowAbs ? p.row : `[${p.row - origin.row}]`}C${colAbs ? p.col : `[${p.col - origin.col}]`}`;
      result +=
        (ref.sheet ? `'${ref.sheet.replace(/'/g, "''")}'!` : '') +
        format(ref.range.start, ref.absolute.startRow, ref.absolute.startCol);
      if (address(ref.range.start) !== address(ref.range.end))
        result += `:${format(ref.range.end, ref.absolute.endRow, ref.absolute.endCol)}`;
    }
    offset = to;
  }
  return result + formula.text.slice(offset);
}

export interface FormulaCall {
  name: string;
  args: string[];
}
export function formulaCalls(text: string): FormulaCall[] {
  const calls: FormulaCall[] = [];
  const pattern = /([A-Za-z_][\w.]*)\s*\(/g;
  // Mask strings to keep function-looking text from becoming calls.
  const masked = text.replace(/"(?:[^"]|"")*"/g, (s) => ' '.repeat(s.length));
  for (const match of masked.matchAll(pattern)) {
    let depth = 0;
    let bracket = 0;
    let quote = '';
    let start = (match.index ?? 0) + match[0].length;
    const args: string[] = [];
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === quote) {
          if (text[i + 1] === quote) i++;
          else quote = '';
        }
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        continue;
      }
      if (c === '[') bracket++;
      else if (c === ']') bracket--;
      else if (!bracket) {
        if (c === '(') depth++;
        else if (c === ')') {
          if (depth === 0) {
            args.push(text.slice(start, i).trim());
            break;
          }
          depth--;
        } else if ((c === ',' || c === ';') && depth === 0) {
          args.push(text.slice(start, i).trim());
          start = i + 1;
        }
      }
    }
    calls.push({ name: match[1].replace(/^_xlfn\./i, '').toUpperCase(), args });
  }
  return calls;
}
