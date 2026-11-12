import {
  checkLimit,
  DEFAULT_LIMITS,
  invalid,
  type SpreadsheetLimits,
  WorkBudget,
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
export interface ArgumentSpan {
  from: number;
  to: number;
  refStart: number;
  refEnd: number;
}
export interface CallToken {
  name: string;
  from: number;
  to: number;
  args: ArgumentSpan[];
}
export interface FormulaScan {
  text: string;
  references: ReferenceToken[];
  calls: CallToken[];
  functions: string[];
}
interface Lexeme {
  kind: 'atom' | 'quoted' | 'bracket' | 'punct' | 'error';
  from: number;
  to: number;
}
const noFlags = {
  startRow: false,
  startCol: false,
  endRow: false,
  endCol: false,
};
const atomChar = (c: string) => c !== '' && /[\p{L}\p{N}_.$\\]/u.test(c);
const atomStart = (c: string) => c !== '' && /[\p{L}_\\$]/u.test(c);
const cloneReference = (r: Reference): Reference => ({
  ...r,
  range: { start: { ...r.range.start }, end: { ...r.range.end } },
  absolute: { ...r.absolute },
});
const formulaScans = new WeakMap<Formula, FormulaScan>();

/** Operation-local cache. Lexing and call/argument construction are linear passes. */
export class FormulaScanner {
  private readonly cache = new Map<string, FormulaScan>();
  private readonly budget: WorkBudget;
  constructor(
    readonly limits: SpreadsheetLimits = { ...DEFAULT_LIMITS },
    private readonly charge: (n: number) => void = () => {},
  ) {
    this.budget = new WorkBudget(limits.maxFormulaWork, 'maxFormulaWork');
  }
  spend(n = 1): void {
    this.budget.spend(n);
    this.charge(n);
  }
  scan(input: string): FormulaScan {
    const text = input.startsWith('=') ? input.slice(1) : input;
    checkLimit(text.length, 'maxFormulaLength', this.limits);
    this.spend();
    const cached = this.cache.get(text);
    if (cached) return cached;
    this.spend(text.length);
    const lexemes: Lexeme[] = [];
    const push = (kind: Lexeme['kind'], from: number, to: number) => {
      checkLimit(lexemes.length + 1, 'maxFormulaTokens', this.limits);
      lexemes.push({ kind, from, to });
    };
    let i = 0;
    while (i < text.length) {
      const from = i;
      const c = text[i++];
      if (/\s/.test(c)) continue;
      if (c === '#') {
        const error =
          /^(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA)/i.exec(
            text.slice(i),
          );
        if (error) {
          i += error[0].length;
          push('error', from, i);
        } else push('punct', from, i);
      } else if (c === '"' || c === "'") {
        while (i < text.length)
          if (text[i++] === c) {
            if (text[i] === c) i++;
            else break;
          }
        if (c === "'") push('quoted', from, i);
      } else if (c === '[') {
        let depth = 1;
        while (i < text.length && depth) {
          const next = text[i++];
          if (next === '[') checkLimit(++depth, 'maxFormulaDepth', this.limits);
          else if (next === ']') depth--;
        }
        push('bracket', from, i);
      } else if (atomChar(c)) {
        while (i < text.length && atomChar(text[i])) i++;
        push('atom', from, i);
      } else push('punct', from, i);
    }
    const references: ReferenceToken[] = [];
    const calls: CallToken[] = [];
    const functions = new Set<string>();
    const stack: { call?: CallToken; start: number; refStart: number }[] = [];
    const raw = (token: Lexeme | undefined) =>
      token ? text.slice(token.from, token.to) : '';
    const argument = (frame: (typeof stack)[number], to: number) => {
      frame.call?.args.push({
        from: frame.start,
        to,
        refStart: frame.refStart,
        refEnd: references.length,
      });
    };
    for (let t = 0; t < lexemes.length; t++) {
      this.spend();
      const token = lexemes[t];
      const value = raw(token);
      if (value === '(') {
        checkLimit(stack.length + 1, 'maxFormulaDepth', this.limits);
        const previous = lexemes[t - 1];
        let call: CallToken | undefined;
        if (previous?.kind === 'atom' && atomStart(raw(previous)[0] ?? '')) {
          const name = raw(previous)
            .replace(/^_xlfn\./i, '')
            .toUpperCase();
          call = { name, from: previous.from, to: text.length, args: [] };
          calls.push(call);
          functions.add(name);
        }
        stack.push({ call, start: token.to, refStart: references.length });
        continue;
      }
      if (value === ')') {
        const frame = stack.pop();
        if (frame) {
          argument(frame, token.from);
          if (frame.call) frame.call.to = token.to;
        }
        continue;
      }
      if (value === ',' || value === ';') {
        const frame = stack[stack.length - 1];
        if (frame) {
          argument(frame, token.from);
          frame.start = token.to;
          frame.refStart = references.length;
        }
        continue;
      }
      if (token.kind === 'punct') continue;
      let sheet: string | undefined;
      let target = token;
      if (raw(lexemes[t + 1]) === '!') {
        sheet =
          token.kind === 'quoted'
            ? value.slice(1, -1).replace(/''/g, "'")
            : value;
        t += 2;
        target = lexemes[t];
        if (!target) break;
      } else if (token.kind === 'quoted') continue;
      if (target.kind === 'error') {
        if (raw(target).toUpperCase() === '#REF!')
          references.push({
            from: token.from,
            to: target.to,
            reference: {
              sheet,
              name: '#REF!',
              range: { start: { row: 1, col: 1 }, end: { row: 1, col: 1 } },
              absolute: { ...noFlags },
            },
          });
        continue;
      }
      let name = raw(target);
      let to = target.to;
      const after = lexemes[t + 1];
      if (raw(after) === '(') continue;
      if (after?.kind === 'bracket' && target.kind === 'atom') {
        name += raw(after);
        to = after.to;
        t++;
      }
      let end: string | undefined;
      if (raw(lexemes[t + 1]) === ':' && lexemes[t + 2]?.kind === 'atom') {
        end = raw(lexemes[t + 2]);
        to = lexemes[t + 2].to;
        t += 2;
      }
      let reference = a1Reference(name, end, sheet);
      if (
        !reference &&
        (target.kind === 'bracket' || atomStart(name[0] ?? '')) &&
        !['TRUE', 'FALSE'].includes(name.toUpperCase())
      ) {
        reference = {
          sheet,
          name,
          range: { start: { row: 1, col: 1 }, end: { row: 1, col: 1 } },
          absolute: { ...noFlags },
        };
      }
      if (reference) references.push({ from: token.from, to, reference });
    }
    // Unclosed parentheses retain text and partial evidence; depth is still bounded.
    for (const frame of stack) argument(frame, text.length);
    const scan = { text, references, calls, functions: [...functions] };
    // Saturation affects reuse only; every uncached scan still spends work.
    if (this.cache.size < this.limits.maxFormulaCacheEntries)
      this.cache.set(text, scan);
    return scan;
  }
}
function a1Reference(
  start: string,
  end: string | undefined,
  sheet: string | undefined,
): Reference | undefined {
  const cell = (s: string) => /^\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}$/.test(s);
  const col = (s: string) => /^\$?[A-Za-z]{1,3}$/.test(s);
  const row = (s: string) => /^\$?[1-9]\d{0,6}$/.test(s);
  const flags = {
    startRow: /\$\d/.test(start),
    startCol: start.startsWith('$'),
    endRow: /\$\d/.test(end ?? start),
    endCol: (end ?? start).startsWith('$'),
  };
  try {
    if (cell(start) && (!end || cell(end)))
      return {
        sheet,
        range: { start: point(start), end: point(end ?? start) },
        absolute: flags,
      };
    if (end && col(start) && col(end))
      return {
        sheet,
        range: { start: point(`${start}1`), end: point(`${end}1048576`) },
        absolute: { ...flags, startRow: true, endRow: true },
      };
    if (end && row(start) && row(end))
      return {
        sheet,
        range: { start: point(`A${start}`), end: point(`XFD${end}`) },
        absolute: { ...flags, startCol: true, endCol: true },
      };
  } catch {
    /* Out-of-grid identifiers remain unresolved names. */
  }
  return undefined;
}
export function referenceTokens(
  text: string,
  scanner = new FormulaScanner(),
): ReferenceToken[] {
  return scanner.scan(text).references;
}
export function parseFormula(
  input: string,
  limits: SpreadsheetLimits = { ...DEFAULT_LIMITS },
  scanner = new FormulaScanner(limits),
): Formula {
  const scan = scanner.scan(input);
  scanner.spend(scan.references.length + scan.functions.length);
  const formula: Formula = {
    text: scan.text,
    dialect: 'excel-a1',
    references: scan.references.map((t) => cloneReference(t.reference)),
    functions: [...scan.functions],
  };
  formulaScans.set(formula, scan);
  return formula;
}
export function translateFormula(
  text: string,
  from: Point,
  to: Point,
  limits: SpreadsheetLimits,
  scanner = new FormulaScanner(limits),
): Formula {
  const scan = scanner.scan(text);
  scanner.spend(scan.text.length + scan.references.length);
  const parts: string[] = [];
  let offset = 0;
  for (const token of scan.references) {
    parts.push(scan.text.slice(offset, token.from));
    const ref = token.reference;
    if (ref.name) parts.push(scan.text.slice(token.from, token.to));
    else {
      const move = (p: Point, rowAbs: boolean, colAbs: boolean) => {
        const row = p.row + (rowAbs ? 0 : to.row - from.row);
        const col = p.col + (colAbs ? 0 : to.col - from.col);
        if (row < 1 || row > 1048576 || col < 1 || col > 16384)
          invalid('Shared formula translation exceeds worksheet bounds.');
        return `${colAbs ? '$' : ''}${columnName(col)}${rowAbs ? '$' : ''}${row}`;
      };
      parts.push(
        (ref.sheet ? `'${ref.sheet.replace(/'/g, "''")}'!` : '') +
          move(ref.range.start, ref.absolute.startRow, ref.absolute.startCol),
      );
      if (address(ref.range.start) !== address(ref.range.end))
        parts.push(
          `:${move(ref.range.end, ref.absolute.endRow, ref.absolute.endCol)}`,
        );
    }
    offset = token.to;
  }
  parts.push(scan.text.slice(offset));
  return parseFormula(parts.join(''), limits, scanner);
}
export function normalizeFormula(
  formula: Formula,
  origin: Point,
  scanner?: FormulaScanner,
): string {
  const engine = scanner ?? new FormulaScanner();
  const saved = formulaScans.get(formula);
  const scan =
    !scanner && saved?.text === formula.text
      ? saved
      : engine.scan(formula.text);
  engine.spend(scan.text.length + scan.references.length);
  const parts: string[] = [];
  let offset = 0;
  for (const { from, to, reference: ref } of scan.references) {
    parts.push(scan.text.slice(offset, from));
    if (ref.name) parts.push(scan.text.slice(from, to));
    else {
      const format = (p: Point, rowAbs: boolean, colAbs: boolean) =>
        `R${rowAbs ? p.row : `[${p.row - origin.row}]`}C${colAbs ? p.col : `[${p.col - origin.col}]`}`;
      parts.push(
        (ref.sheet ? `'${ref.sheet.replace(/'/g, "''")}'!` : '') +
          format(ref.range.start, ref.absolute.startRow, ref.absolute.startCol),
      );
      if (address(ref.range.start) !== address(ref.range.end))
        parts.push(
          `:${format(ref.range.end, ref.absolute.endRow, ref.absolute.endCol)}`,
        );
    }
    offset = to;
  }
  parts.push(scan.text.slice(offset));
  return parts.join('');
}
export function directReference(
  input: string,
  scanner = new FormulaScanner(),
): Reference | undefined {
  const text = input.replace(/^=/, '').trim();
  const scan = scanner.scan(text);
  return scan.references.length === 1 &&
    scan.references[0].from === 0 &&
    scan.references[0].to === text.length
    ? cloneReference(scan.references[0].reference)
    : undefined;
}
