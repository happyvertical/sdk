import { checkLimit, invalid, type SpreadsheetLimits } from './errors.js';
import { type Range, range, rangeAddress, type Workbook } from './model.js';

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
  if (!workbook.sheets.some((s) => s.state === 'visible'))
    invalid('At least one worksheet must be visible.');
  const boundRange = (r: Range) => {
    const checked = range(rangeAddress(r));
    checkLimit(checked.end.row, 'maxRows', limits);
    checkLimit(checked.end.col, 'maxColumns', limits);
  };
  for (const name of workbook.definedNames)
    checkLimit(name.text.length, 'maxFormulaLength', limits);
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
    if (!['visible', 'hidden', 'veryHidden'].includes(sheet.state))
      invalid('Invalid worksheet state.');
    if (
      sheet.frozen &&
      (!Number.isInteger(sheet.frozen.rows) ||
        !Number.isInteger(sheet.frozen.cols) ||
        sheet.frozen.rows < 0 ||
        sheet.frozen.cols < 0 ||
        sheet.frozen.rows >= limits.maxRows ||
        sheet.frozen.cols >= limits.maxColumns)
    )
      invalid('Invalid frozen pane.');
    for (const r of sheet.merges) boundRange(r);
    for (const table of sheet.tables) {
      boundRange(table.range);
      if (
        !table.name ||
        table.columns.length !== table.range.end.col - table.range.start.col + 1
      )
        invalid('Invalid table columns.');
    }
    for (const validation of sheet.validations) {
      if (
        !['list', 'whole', 'decimal', 'date', 'textLength', 'custom'].includes(
          validation.kind,
        ) ||
        !validation.ranges.length
      )
        invalid('Invalid validation rule.');
      validation.ranges.forEach(boundRange);
      if (validation.formula)
        checkLimit(validation.formula.length, 'maxFormulaLength', limits);
    }
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
      if (typeof cell.value === 'string')
        checkLimit(cell.value.length, 'maxXmlText', limits);
      if (cell.numberFormat)
        checkLimit(cell.numberFormat.length, 'maxXmlText', limits);
      if (cell.formula?.arrayRange) boundRange(cell.formula.arrayRange);
      if (cell.formula)
        checkLimit(cell.formula.text.length, 'maxFormulaLength', limits);
    }
  }
}
