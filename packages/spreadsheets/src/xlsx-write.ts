import { strToU8, zipSync } from 'fflate/browser';
import { checkLimit, invalid, type SpreadsheetLimits } from './errors.js';
import { dateSerial, serialDate } from './formats.js';
import { validateWorkbook } from './io.js';
import { address, type Cell, rangeAddress, type Workbook } from './model.js';
import type { WriteOptions } from './types.js';
import { escapeXml as e } from './xml.js';

const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relNs =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export function writeXlsx(
  workbook: Workbook,
  limits: SpreadsheetLimits,
  options: WriteOptions,
): Uint8Array {
  validateWorkbook(workbook, limits);
  const files: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  const put = (path: string, xml: string) => {
    const bytes = strToU8(xmlHeader + xml);
    checkLimit(bytes.length, 'maxEntryBytes', limits);
    total += bytes.length;
    checkLimit(total, 'maxTotalBytes', limits);
    files[path] = bytes;
    checkLimit(Object.keys(files).length, 'maxEntries', limits);
  };
  const customFormats: string[] = [];
  const styles: { format: string; bold: boolean }[] = [
    { format: 'General', bold: false },
  ];
  const styleIndex = (cell: Cell, bold: boolean): number => {
    const format =
      cell.numberFormat ??
      (cell.type === 'date'
        ? 'yyyy-mm-dd"T"hh:mm:ss'
        : cell.formatKind === 'currency'
          ? '$#,##0.00'
          : cell.formatKind === 'percent'
            ? '0.00%'
            : 'General');
    let index = styles.findIndex((s) => s.format === format && s.bold === bold);
    if (index < 0) {
      index = styles.length;
      styles.push({ format, bold });
    }
    if (format !== 'General' && !customFormats.includes(format))
      customFormats.push(format);
    return index;
  };
  for (const [index, sheet] of workbook.sheets.entries()) {
    const firstRow = sheet.cells.rows().next().value?.[0];
    let data = '';
    for (const [row, cells] of sheet.cells.rows()) {
      let body = '';
      for (const [col, cell] of cells) {
        const s = styleIndex(cell, !!options.boldHeaderRow && row === firstRow);
        let type = '';
        let value = '';
        if (cell.type === 'text') {
          if (cell.formula) {
            type = ' t="str"';
            value = `<v>${e(String(cell.value))}</v>`;
          } else {
            type = ' t="inlineStr"';
            value = `<is><t xml:space="preserve">${e(String(cell.value))}</t></is>`;
          }
        } else if (cell.type === 'boolean') {
          type = ' t="b"';
          value = `<v>${cell.value ? 1 : 0}</v>`;
        } else if (cell.type === 'error') {
          type = ' t="e"';
          value = `<v>${e(cell.error ?? '#VALUE!')}</v>`;
        } else if (cell.type === 'number') value = `<v>${cell.value}</v>`;
        else if (cell.type === 'date') {
          const date = cell.value as Date;
          // Retain serial 60 only while it still represents this cell's value.
          const raw =
            cell.raw !== undefined &&
            Number.isFinite(cell.raw) &&
            serialDate(cell.raw, workbook.dateSystem).getTime() ===
              date.getTime()
              ? cell.raw
              : dateSerial(date, workbook.dateSystem);
          value = `<v>${raw}</v>`;
        }
        const formula = cell.formula
          ? `<f${cell.formula.arrayRange ? ` t="array" ref="${rangeAddress(cell.formula.arrayRange)}"` : ''}>${e(cell.formula.text.replace(/^=/, ''))}</f>`
          : '';
        body += `<c r="${address({ row, col })}" s="${s}"${type}>${formula}${value}</c>`;
      }
      data += `<row r="${row}">${body}</row>`;
    }
    const widths = options.columnWidths
      ? Object.fromEntries(
          options.columnWidths.map((width, i) => [i + 1, width]),
        )
      : (sheet.columnWidths ?? {});
    let cols = '';
    for (const [key, width] of Object.entries(widths)) {
      const col = Number(key);
      if (
        !Number.isInteger(col) ||
        col < 1 ||
        !Number.isFinite(width) ||
        width < 0 ||
        width > 255
      )
        invalid('Invalid column width.');
      checkLimit(col, 'maxColumns', limits);
      cols += `<col min="${col}" max="${col}" width="${width}" customWidth="1"/>`;
    }
    const pane = sheet.frozen
      ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${sheet.frozen.cols}" ySplit="${sheet.frozen.rows}" topLeftCell="${address({ row: sheet.frozen.rows + 1, col: sheet.frozen.cols + 1 })}" state="frozen"/></sheetView></sheetViews>`
      : '';
    const merges = sheet.merges.length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((r) => `<mergeCell ref="${rangeAddress(r)}"/>`).join('')}</mergeCells>`
      : '';
    const validations = sheet.validations.length
      ? `<dataValidations count="${sheet.validations.length}">${sheet.validations.map((v) => `<dataValidation type="${v.kind}" sqref="${v.ranges.map(rangeAddress).join(' ')}"><formula1>${e(v.formula ?? (v.values ? `"${v.values.join(',')}"` : ''))}</formula1></dataValidation>`).join('')}</dataValidations>`
      : '';
    const tableParts = sheet.tables.length
      ? `<tableParts count="${sheet.tables.length}">${sheet.tables.map((_, i) => `<tablePart r:id="t${i}"/>`).join('')}</tableParts>`
      : '';
    put(
      `xl/worksheets/sheet${index + 1}.xml`,
      `<worksheet xmlns="${ns}" xmlns:r="${relNs}">${pane}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${data}</sheetData>${merges}${validations}${tableParts}</worksheet>`,
    );
    if (sheet.tables.length) {
      put(
        `xl/worksheets/_rels/sheet${index + 1}.xml.rels`,
        relationships(
          sheet.tables.map((_, i) => ({
            id: `t${i}`,
            type: 'table',
            target: `../tables/table${index + 1}_${i + 1}.xml`,
          })),
        ),
      );
      for (const [i, table] of sheet.tables.entries())
        put(
          `xl/tables/table${index + 1}_${i + 1}.xml`,
          `<table xmlns="${ns}" id="${index * limits.maxCells + i + 1}" name="${e(table.name)}" displayName="${e(table.name)}" ref="${rangeAddress(table.range)}" headerRowCount="${table.headerRow ? 1 : 0}" totalsRowCount="${table.totalsRow ? 1 : 0}"><tableColumns count="${table.columns.length}">${table.columns.map((name, c) => `<tableColumn id="${c + 1}" name="${e(name)}"/>`).join('')}</tableColumns></table>`,
        );
    }
  }
  put(
    'xl/styles.xml',
    `<styleSheet xmlns="${ns}"><numFmts count="${customFormats.length}">${customFormats.map((format, i) => `<numFmt numFmtId="${164 + i}" formatCode="${e(format)}"/>`).join('')}</numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.map((s) => `<xf numFmtId="${s.format === 'General' ? 0 : 164 + customFormats.indexOf(s.format)}" fontId="${s.bold ? 1 : 0}" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"${s.bold ? ' applyFont="1"' : ''}/>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  );
  const defined = workbook.definedNames
    .map((n) => {
      const scope =
        n.scope === undefined
          ? -1
          : workbook.sheets.findIndex((s) => s.name === n.scope);
      if (n.scope !== undefined && scope < 0)
        invalid('Unknown defined-name scope.');
      return `<definedName name="${e(n.name)}"${scope < 0 ? '' : ` localSheetId="${scope}"`}>${e(n.text)}</definedName>`;
    })
    .join('');
  put(
    'xl/workbook.xml',
    `<workbook xmlns="${ns}" xmlns:r="${relNs}"><workbookPr date1904="${workbook.dateSystem === 1904 ? 1 : 0}"/><sheets>${workbook.sheets.map((s, i) => `<sheet name="${e(s.name)}" sheetId="${i + 1}" state="${s.state}" r:id="s${i + 1}"/>`).join('')}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ''}<calcPr fullCalcOnLoad="1"/></workbook>`,
  );
  put(
    '_rels/.rels',
    relationships([
      { id: 'office', type: 'officeDocument', target: 'xl/workbook.xml' },
    ]),
  );
  put(
    'xl/_rels/workbook.xml.rels',
    relationships([
      ...workbook.sheets.map((_, i) => ({
        id: `s${i + 1}`,
        type: 'worksheet',
        target: `worksheets/sheet${i + 1}.xml`,
      })),
      { id: 'styles', type: 'styles', target: 'styles.xml' },
    ]),
  );
  put(
    '[Content_Types].xml',
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Object.keys(
      files,
    )
      .filter((p) => /^xl\/(worksheets|tables)\/[^/]+\.xml$/.test(p))
      .map(
        (p) =>
          `<Override PartName="/${p}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${p.startsWith('xl/tables/') ? 'table' : 'worksheet'}+xml"/>`,
      )
      .join('')}</Types>`,
  );
  // Stored ZIP output cannot exceed a reader's compression-ratio policy.
  const output = zipSync(files, { level: 0 });
  checkLimit(output.length, 'maxInputBytes', limits);
  return output;
}
function relationships(
  values: { id: string; type: string; target: string }[],
): string {
  return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${values.map((r) => `<Relationship Id="${r.id}" Type="${relNs}/${r.type}" Target="${e(r.target)}"/>`).join('')}</Relationships>`;
}
