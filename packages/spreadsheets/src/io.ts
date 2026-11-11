import { checkLimit, invalid, type SpreadsheetLimits } from './errors.js';
import type { Workbook } from './model.js';

export function validateWorkbook(
  workbook: Workbook,
  limits: SpreadsheetLimits,
): void {
  if (
    !workbook ||
    !Array.isArray(workbook.sheets) ||
    !workbook.sheets.length ||
    ![1900, 1904].includes(workbook.dateSystem)
  )
    invalid();
  checkLimit(workbook.sheets.length, 'maxSheets', limits);
  const names = new Set<string>();
  let count = 0;
  for (const sheet of workbook.sheets) {
    if (
      !sheet.name ||
      sheet.name.length > 31 ||
      /[\\/[\]:?*]/.test(sheet.name) ||
      names.has(sheet.name.toLowerCase())
    )
      invalid('Invalid or duplicate worksheet name.');
    names.add(sheet.name.toLowerCase());
    for (const [p, cell] of sheet.cells) {
      checkLimit(++count, 'maxCells', limits);
      checkLimit(p.row, 'maxRows', limits);
      checkLimit(p.col, 'maxColumns', limits);
      if (
        !['text', 'number', 'boolean', 'date', 'error', 'empty'].includes(
          cell.type,
        )
      )
        invalid('Unsupported cell type.');
      if (
        cell.type === 'number' &&
        (typeof cell.value !== 'number' || !Number.isFinite(cell.value))
      )
        invalid('Invalid numeric cell.');
      if (
        cell.type === 'date' &&
        (!(cell.value instanceof Date) ||
          !Number.isFinite(cell.value.getTime()))
      )
        invalid('Invalid date cell.');
      if (cell.type === 'boolean' && typeof cell.value !== 'boolean')
        invalid('Invalid boolean cell.');
      if (cell.type === 'text' && typeof cell.value !== 'string')
        invalid('Invalid text cell.');
      if (cell.formula)
        checkLimit(cell.formula.text.length, 'maxFormulaLength', limits);
    }
  }
}
