import type { FormatKind } from './model.js';

export const BUILTIN_FORMATS: Record<number, string> = {
  0: 'General',
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  5: '"$"#,##0_);("$"#,##0)',
  6: '"$"#,##0_);[Red]("$"#,##0)',
  7: '"$"#,##0.00_);("$"#,##0.00)',
  8: '"$"#,##0.00_);[Red]("$"#,##0.00)',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  12: '# ?/?',
  13: '# ??/??',
  14: 'mm-dd-yy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'm/d/yy h:mm',
  27: 'yyyy-mm-dd',
  28: 'yyyy-mm-dd',
  29: 'yyyy-mm-dd',
  30: 'm/d/yy',
  31: 'yyyy-mm-dd',
  32: 'h:mm',
  33: 'h:mm:ss',
  34: 'yyyy-mm',
  35: 'm-d',
  36: 'yyyy-mm-dd',
  37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)',
  41: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)',
  42: '_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)',
  43: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)',
  44: '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mmss.0',
  48: '##0.0E+0',
  49: '@',
  50: 'yyyy-mm-dd',
  51: 'yyyy-mm-dd',
  52: 'yyyy-mm',
  53: 'm-d',
  54: 'yyyy-mm-dd',
  55: 'h:mm',
  56: 'h:mm:ss',
  57: 'yyyy-mm',
  58: 'm-d',
};
export function formatKind(format = 'General'): FormatKind {
  if (/^general$/i.test(format)) return 'general';
  // Literal currency symbols matter, but other literals must not look like dates.
  const currency = /[$€£¥₹₩₽]|\[\$[^\]]+\]/.test(
    format.replace(/\[\$-[\da-f]+\]/gi, ''),
  );
  const tokens = format
    .replace(/"[^"]*"|\\.|_.|\*./g, '')
    .replace(/\[(?![hms]+\])[^\]]*\]/gi, '')
    .toLowerCase();
  const date = /[yd]/.test(tokens);
  const time = /[hs]|am\/pm/.test(tokens);
  if (date && time) return 'datetime';
  if (date || (/m/.test(tokens) && !time)) return 'date';
  if (time) return 'time';
  if (tokens.includes('%')) return 'percent';
  if (currency) return 'currency';
  if (tokens.includes('@')) return 'text';
  return 'number';
}
const day = 86400000;
/** Serial 60 maps to 1900-02-28; raw preserves Excel's fictitious 1900-02-29. */
export function serialDate(serial: number, system: 1900 | 1904): Date {
  const epoch = system === 1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  return new Date(
    epoch +
      Math.round((serial - (system === 1900 && serial >= 60 ? 1 : 0)) * day),
  );
}
export function dateSerial(date: Date, system: 1900 | 1904): number {
  const epoch = system === 1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const value = (date.getTime() - epoch) / day;
  return value + (system === 1900 && value >= 60 ? 1 : 0);
}
