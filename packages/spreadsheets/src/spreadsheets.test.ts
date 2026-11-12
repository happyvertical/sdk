import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { inspectZipManifest } from '@happyvertical/files/archive';
import { unzipSync, Zip, ZipDeflate, zipSync } from 'fflate/browser';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { dateSerial, serialDate } from './formats.js';
import {
  createSheet,
  createWorkbook,
  DEFAULT_LIMITS,
  getSpreadsheets,
  normalizeFormula,
  parseFormula,
  profileWorkbook,
  range,
  SparseCells,
  SpreadsheetError,
  type SpreadsheetLimits,
  type Workbook,
} from './index.js';
import { parseXml } from './xml.js';

const bytes = (value: string) => new TextEncoder().encode(value);
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rns =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function fixture(
  sheet: string,
  extra: Record<string, string> = {},
  workbook = '',
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '_rels/.rels': bytes(
      `<Relationships><Relationship Id="office" Type="${rns}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': bytes(
      `<workbook xmlns="${ns}" xmlns:r="${rns}">${workbook}<sheets><sheet name="Data" sheetId="1" r:id="s1"/></sheets><definedNames><definedName name="Choices" localSheetId="0">Data!$A$1:$A$3</definedName></definedNames></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': bytes(
      `<Relationships><Relationship Id="s1" Type="${rns}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="ss" Type="${rns}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="st" Type="${rns}/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/sharedStrings.xml': bytes(
      '<sst><si><r><t>Rich </t></r><r><t>été 🥐</t></r><rPh><t>ignored</t></rPh></si></sst>',
    ),
    'xl/styles.xml': bytes(
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="$#,##0.00"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="10"/><xf numFmtId="22"/></cellXfs></styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': bytes(
      `<worksheet xmlns="${ns}" xmlns:r="${rns}">${sheet}</worksheet>`,
    ),
    ...Object.fromEntries(
      Object.entries(extra).map(([p, text]) => [p, bytes(text)]),
    ),
  };
  return zipSync(files, { level: 6 });
}
function replacePart(
  input: Uint8Array,
  path: string,
  text: string,
): Uint8Array {
  const files = unzipSync(input);
  files[path] = bytes(text);
  return zipSync(files, { level: 0 });
}
async function errorCode(
  input: Uint8Array,
  options: Partial<SpreadsheetLimits> = {},
): Promise<string> {
  const adapter = await getSpreadsheets({ type: 'xlsx', ...options });
  try {
    await adapter.read(input);
    throw new Error('Expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(SpreadsheetError);
    return (error as SpreadsheetError).code;
  }
}

describe('model and factory', () => {
  it('snapshots construction options and preserves limits for undefined overrides', async () => {
    const options = { type: 'csv' as const, maxCells: 1 };
    const adapter = await getSpreadsheets(options);
    options.maxCells = 10;
    await expect(
      adapter.read(bytes('a,b'), { maxCells: undefined }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(adapter.type).toBe('csv');
    expect(parseFormula(`'SUM(budget)'!A1`).functions).toEqual([]);
  });
  it('supports sparse coordinate/address access and numeric row order', () => {
    const cells = new SparseCells()
      .set('C9', { type: 'number', value: 3 })
      .set(2, 1, { type: 'text', value: 'a' });
    expect(cells.get(9, 3)).toEqual(cells.get('C9'));
    expect([...cells.rows()].map(([r]) => r)).toEqual([2, 9]);
    expect(cells.size).toBe(2);
    expect(() => cells.set(1, 0, { type: 'empty', value: null })).toThrow(
      SpreadsheetError,
    );
  });
  it('rejects unknown formats and invalid limits without echoing input', async () => {
    await expect(
      getSpreadsheets({ type: 'secret-format' } as never),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
      message: 'Supported spreadsheet types: xlsx, csv.',
    });
    await expect(
      getSpreadsheets({ type: 'xlsx', maxCells: 0 }),
    ).rejects.toBeInstanceOf(SpreadsheetError);
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    await expect(adapter.read('secret' as never)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});

describe('XLSX structural reader', () => {
  it('reads rich text, shared and array formulas, formats, panes, tables, lists and names', async () => {
    const data = fixture(
      `<dimension ref="A1:G5"/><sheetViews><sheetView><pane state="frozen" xSplit="1" ySplit="1"/></sheetView></sheetViews><cols><col min="1" max="2" width="18"/></cols><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Unicode &amp; 中文</t></is></c></row>
      <row r="2"><c r="A2" s="1"><v>60</v></c><c r="B2" s="2"><v>12.5</v></c><c r="C2" s="3"><v>0.2</v></c><c r="D2"><f t="shared" si="0" ref="D2:D3">B2*C2+$B$1</f><v>2.5</v></c><c r="E2"><f t="array" ref="E2:E3">B2:B3*C2:C3</f><v>2.5</v></c><c r="F2" t="b"><v>1</v></c><c r="G2" t="e"><v>#N/A</v></c></row>
      <row r="3"><c r="D3"><f t="shared" si="0"/><v>4</v></c></row><row r="4"/>
      </sheetData><mergeCells><mergeCell ref="A1:B1"/></mergeCells><dataValidations><dataValidation type="list" sqref="F2:F5"><formula1>"Yes,No"</formula1></dataValidation><dataValidation type="list" sqref="G2:G5"><formula1>Choices</formula1></dataValidation></dataValidations><tableParts><tablePart r:id="t1"/></tableParts>`,
      {
        'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships><Relationship Id="t1" Type="${rns}/table" Target="../tables/table1.xml"/></Relationships>`,
        'xl/tables/table1.xml':
          '<table name="Sales" displayName="Sales" ref="A1:C3" totalsRowCount="1"><tableColumns><tableColumn name="When"/><tableColumn name="Cost"/><tableColumn name="Rate"/></tableColumns></table>',
      },
    );
    const wb = await (await getSpreadsheets({ type: 'xlsx' })).read(
      data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
      ) as ArrayBuffer,
    );
    const sheet = wb.sheets[0];
    expect(sheet.cells.get('A1')?.value).toBe('Rich été 🥐');
    expect(sheet.cells.get('B1')?.value).toBe('Unicode & 中文');
    expect(sheet.cells.get('A2')).toMatchObject({
      type: 'date',
      raw: 60,
      value: new Date('1900-02-28T00:00:00Z'),
    });
    expect(sheet.cells.get('B2')?.formatKind).toBe('currency');
    expect(sheet.cells.get('C2')?.formatKind).toBe('percent');
    expect(sheet.cells.get('D3')?.formula).toMatchObject({
      text: 'B3*C3+$B$1',
      dialect: 'excel-a1',
      references: expect.any(Array),
    });
    expect(sheet.cells.get('E2')?.formula?.arrayRange).toEqual(range('E2:E3'));
    expect(sheet.cells.get('F2')?.value).toBe(true);
    expect(sheet.cells.get('G2')?.error).toBe('#N/A');
    expect(sheet.frozen).toEqual({ rows: 1, cols: 1 });
    expect(sheet.merges).toEqual([range('A1:B1')]);
    expect(sheet.columnWidths).toEqual({ 1: 18, 2: 18 });
    expect(sheet.tables[0]).toEqual({
      name: 'Sales',
      range: range('A1:C3'),
      columns: ['When', 'Cost', 'Rate'],
      headerRow: true,
      totalsRow: true,
    });
    expect(sheet.validations[0].values).toEqual(['Yes', 'No']);
    expect(sheet.validations[1].source?.name).toBe('Choices');
    expect(wb.definedNames[0]).toMatchObject({
      name: 'Choices',
      scope: 'Data',
    });
  });
  it('supports both date systems and the leap-year discontinuity', async () => {
    for (const system of [1900, 1904] as const) {
      const wb = await (await getSpreadsheets({ type: 'xlsx' })).read(
        fixture(
          '<sheetData><row><c s="1"><v>1.5</v></c></row></sheetData>',
          {},
          `<workbookPr date1904="${system === 1904 ? 1 : 0}"/>`,
        ),
      );
      expect(wb.dateSystem).toBe(system);
      expect(wb.sheets[0].cells.get('A1')?.value).toEqual(
        new Date(
          system === 1904 ? '1904-01-02T12:00:00Z' : '1900-01-01T12:00:00Z',
        ),
      );
    }
    expect(serialDate(59, 1900)).toEqual(serialDate(60, 1900));
    expect(serialDate(61, 1900).toISOString()).toBe('1900-03-01T00:00:00.000Z');
    expect(dateSerial(serialDate(61, 1900), 1900)).toBe(61);
  });
  it('keeps cached formula values and parses quoted sheets, names, tables and functions', () => {
    const formula = parseFormula(
      `=IF(A2="B9",'Client''s list'!$B$2:$D$8,Sales[Amount])+TaxRate+SUM(B:B)`,
    );
    expect(formula.functions).toEqual(['IF', 'SUM']);
    expect(formula.references.map((r) => r.sheet)).toContain("Client's list");
    expect(formula.references.some((r) => r.name === 'Sales[Amount]')).toBe(
      true,
    );
    expect(formula.references.some((r) => r.name === 'TaxRate')).toBe(true);
    expect(formula.references.filter((r) => !r.name).length).toBe(3);
    expect(normalizeFormula(parseFormula('B2*C2'), { row: 2, col: 4 })).toBe(
      normalizeFormula(parseFormula('B3*C3'), { row: 3, col: 4 }),
    );
    expect(parseFormula('LOG10(A2)+SUM(A1) + "SUM(B2)"').functions).toEqual([
      'LOG10',
      'SUM',
    ]);
  });
});

describe('real producer fixtures', () => {
  for (const file of [
    'iris-excel.xlsx',
    'iris-google-sheets.xlsx',
    'dates-libreoffice.xlsx',
  ]) {
    it(`reads and round trips ${file}`, async () => {
      const input = readFileSync(
        new URL(`../test/fixtures/${file}`, import.meta.url),
      );
      const adapter = await getSpreadsheets({ type: 'xlsx' });
      const wb = await adapter.read(input);
      expect(wb.sheets.length).toBeGreaterThan(0);
      expect(wb.sheets[0].cells.size).toBeGreaterThan(0);
      const read = await adapter.read(await adapter.write(wb));
      for (const [i, sheet] of wb.sheets.entries())
        for (const [point, cell] of sheet.cells) {
          expect(read.sheets[i].cells.get(point.row, point.col)?.value).toEqual(
            cell.value,
          );
          expect(read.sheets[i].cells.get(point.row, point.col)?.type).toEqual(
            cell.type,
          );
        }
    });
  }
});

describe('XLSX output', () => {
  it('deflates and reads a highly repetitive 200,000-cell worksheet', async () => {
    const sheet = createSheet('Repeated');
    for (let row = 1; row <= 10_000; row++)
      for (let col = 1; col <= 20; col++)
        sheet.cells.set(row, col, { type: 'text', value: 'repeated value!!' });
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    const output = await adapter.write(createWorkbook([sheet]));
    const view = new DataView(
      output.buffer,
      output.byteOffset,
      output.byteLength,
    );
    expect(view.getUint16(8, true)).toBe(8); // DEFLATE, not stored ZIP.
    const manifest = inspectZipManifest(output);
    const entry = manifest.entries.find(
      (e) => e.path === 'xl/worksheets/sheet1.xml',
    );
    expect(entry?.size).toBeGreaterThan(
      DEFAULT_LIMITS.compressionRatioFloorBytes,
    );
    expect(output.byteLength).toBeLessThan((entry?.size ?? 0) / 10);
    const read = await adapter.read(output);
    expect(read.sheets[0].cells.size).toBe(200_000);
    for (const [, cell] of read.sheets[0].cells)
      expect(cell).toMatchObject({ type: 'text', value: 'repeated value!!' });
    // Ratio and floor can be tuned independently, including per-call overrides.
    await expect(
      adapter.read(output, { maxCompressionRatio: 1 }),
    ).rejects.toMatchObject({
      code: 'LIMIT_EXCEEDED',
      limit: 'maxCompressionRatio',
    });
    expect(
      (
        await adapter.read(output, {
          maxCompressionRatio: 1,
          compressionRatioFloorBytes: 32 * 1024 * 1024,
        })
      ).sheets[0].cells.size,
    ).toBe(200_000);
  });
  it('accepts valid small worksheets above the former 200:1 ratio', async () => {
    const sheet = createSheet('Long text');
    for (let row = 1; row <= 10; row++)
      sheet.cells.set(row, 1, { type: 'text', value: 'a'.repeat(30_000) });
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    const output = await adapter.write(createWorkbook([sheet]));
    const entry = inspectZipManifest(output).entries.find(
      (e) => e.path === 'xl/worksheets/sheet1.xml',
    );
    expect((entry?.size ?? 0) / (entry?.compressedSize ?? 1)).toBeGreaterThan(
      200,
    );
    expect((await adapter.read(output)).sheets[0].cells.size).toBe(10);
    expect(
      (await adapter.read(output, { maxCompressionRatio: 1 })).sheets[0].cells
        .size,
    ).toBe(10);
    await expect(
      adapter.read(output, {
        compressionRatioFloorBytes: 1,
        maxCompressionRatio: 200,
      }),
    ).rejects.toMatchObject({
      code: 'LIMIT_EXCEEDED',
      limit: 'maxCompressionRatio',
    });
  });
  it('round trips ISO dates without date formats and literal OOXML escapes/newlines', async () => {
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    const wb = await adapter.read(
      fixture(
        '<sheetData><row><c t="d"><v>2026-01-03T00:00:00Z</v></c><c t="inlineStr"><is><t>literal _x005F_x0041_ and &#13;&#10; line</t></is></c></row></sheetData>',
      ),
    );
    expect(wb.sheets[0].cells.get('B1')?.value).toBe(
      'literal _x0041_ and \r\n line',
    );
    const read = await adapter.read(await adapter.write(wb));
    expect(read.sheets[0].cells.get('A1')).toMatchObject({
      type: 'date',
      value: new Date('2026-01-03T00:00:00Z'),
      numberFormat: 'General',
    });
    expect(read.sheets[0].cells.get('B1')?.value).toEqual(
      wb.sheets[0].cells.get('B1')?.value,
    );
  });

  it('round trips values/types/formats/formulas across sheets and preserves metadata', async () => {
    const first = createSheet('Customers');
    const second = createSheet('Orders');
    second.state = 'veryHidden';
    const entries = [
      { value: ' Name & <中文> ', type: 'text' as const, numberFormat: '@' },
      { value: 25.25, type: 'number' as const, numberFormat: '$#,##0.00' },
      { value: 0.125, type: 'number' as const, numberFormat: '0.00%' },
      {
        value: new Date('2026-01-03T12:30:00Z'),
        type: 'date' as const,
        numberFormat: 'yyyy-mm-dd hh:mm:ss',
      },
      { value: true, type: 'boolean' as const, numberFormat: 'General' },
      { value: null, type: 'empty' as const, numberFormat: 'General' },
      {
        value: null,
        type: 'error' as const,
        error: '#DIV/0!',
        numberFormat: 'General',
      },
      {
        value: 6,
        type: 'number' as const,
        formula: parseFormula('SUM(B1:C1)'),
        numberFormat: '0.00',
      },
      {
        value: 'cached',
        type: 'text' as const,
        formula: parseFormula('"cached"'),
        numberFormat: 'General',
      },
    ];
    for (const [i, cell] of entries.entries()) first.cells.set(1, i + 1, cell);
    second.cells.set('A1', { value: 60, type: 'number' });
    first.frozen = { rows: 1, cols: 1 };
    first.merges = [range('A3:B3')];
    first.validations = [
      { ranges: [range('A2:A3')], kind: 'list', values: ['One', 'Two'] },
    ];
    first.tables = [
      {
        name: 'Export',
        range: range('A1:B2'),
        headerRow: true,
        totalsRow: false,
        columns: ['Name', 'Value'],
      },
    ];
    const wb = createWorkbook([first, second]);
    wb.definedNames = [{ name: 'Tax', text: 'Customers!$B$1' }];
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    const output = await adapter.write(wb, {
      boldHeaderRow: true,
      columnWidths: [24, 15],
    });
    const read = await adapter.read(output);
    for (const [p, cell] of first.cells) {
      const actual = read.sheets[0].cells.get(p.row, p.col);
      expect(actual?.value).toEqual(cell.value);
      expect(actual?.type).toBe(cell.type);
      expect(actual?.numberFormat).toBe(cell.numberFormat);
      expect(actual?.formula?.text).toBe(cell.formula?.text);
    }
    expect(read.sheets[1].state).toBe('veryHidden');
    expect(read.sheets[0].tables).toEqual(first.tables);
    expect(read.sheets[0].validations[0].values).toEqual(['One', 'Two']);
    expect(read.sheets[0].columnWidths).toEqual({ 1: 24, 2: 15 });
    const files = unzipSync(output);
    expect(new TextDecoder().decode(files['xl/styles.xml'])).toContain('<b/>');
    expect(files['[Content_Types].xml']).toBeDefined();
  });
  it('retains serial 60 and rejects invalid models and oversized output', async () => {
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    const wb = await adapter.read(
      fixture('<sheetData><row><c s="1"><v>60</v></c></row></sheetData>'),
    );
    expect(
      (await adapter.read(await adapter.write(wb))).sheets[0].cells.get('A1')
        ?.raw,
    ).toBe(60);
    wb.sheets[0].cells.set('A2', { type: 'text', value: 'bad\u0001' });
    await expect(adapter.write(wb)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    wb.sheets[0].cells.set('A2', { type: 'number', value: Number.NaN });
    await expect(adapter.write(wb)).rejects.toMatchObject({
      code: 'INVALID_WORKBOOK',
    });
    await expect(
      adapter.write(createWorkbook([createSheet('Good')]), {
        maxInputBytes: 10,
      }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });
});

describe('CSV', () => {
  it('detects delimiters and BOM, parses quoted multiline fields and preserves originals', async () => {
    const adapter = await getSpreadsheets({ type: 'csv' });
    const input =
      '\uFEFFName;ID;Amount;Active;When\r\n"été; ""hello""\r\nworld";001;12.50;true;2026-01-03\r\nRagged\r\n';
    const wb = await adapter.read(bytes(input));
    const cells = wb.sheets[0].cells;
    expect(cells.get('A2')?.value).toBe('été; "hello"\r\nworld');
    expect(cells.get('B2')).toMatchObject({ type: 'text', value: '001' });
    expect(cells.get('C2')).toMatchObject({
      type: 'number',
      value: 12.5,
      originalText: '12.50',
    });
    expect(cells.get('D2')?.value).toBe(true);
    expect(cells.get('E2')?.type).toBe('date');
    expect(cells.get('B3')).toBeUndefined();
    const output = new TextDecoder().decode(
      await adapter.write(wb, { delimiter: ';' }),
    );
    expect(output).toContain(';001;12.50;true;2026-01-03');
    cells.set('C2', { ...(cells.get('C2') as any), value: 99 });
    expect(
      new TextDecoder().decode(await adapter.write(wb, { delimiter: ';' })),
    ).toContain(';001;99;');
  });
  it('keeps conservative types, handles empty and ragged rows, and rejects malformed quoting', async () => {
    const adapter = await getSpreadsheets({ type: 'csv' });
    const wb = await adapter.read(
      bytes('001,9007199254740993,2026-02-30, 2,=SUM(A1),false\n\n,,\n'),
    );
    expect([...wb.sheets[0].cells.rows()].length).toBe(3);
    for (let col = 1; col <= 5; col++)
      expect(wb.sheets[0].cells.get(1, col)?.type).toBe('text');
    for (const input of ['"unclosed', 'ab"cd', '"x"trailer'])
      await expect(adapter.read(bytes(input))).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    await expect(
      adapter.read(bytes('a,b'), { maxCells: 1 }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(
      adapter.read(bytes('a'), { delimiter: '"' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      adapter.write(createWorkbook([createSheet('A'), createSheet('B')])),
    ).rejects.toMatchObject({ code: 'INVALID_WORKBOOK' });
    expect((await adapter.read(bytes(''))).sheets[0].cells.size).toBe(0);
  });
});

describe('hostile inputs', () => {
  it('rejects malformed semantic metadata with typed errors', async () => {
    expect(
      await errorCode(
        fixture('<sheetData><row><c t="unknown"/></row></sheetData>'),
      ),
    ).toBe('INVALID_WORKBOOK');
    expect(
      await errorCode(
        fixture(
          '<sheetData><row><c><f t="shared" ref="A1:A2">B1</f></c></row></sheetData>',
        ),
      ),
    ).toBe('INVALID_WORKBOOK');
    const base = fixture('<sheetData/>');
    expect(
      await errorCode(
        replacePart(
          base,
          'xl/workbook.xml',
          `<workbook xmlns:r="${rns}"><sheets><sheet name="Data" r:id="s1"/></sheets><definedNames><definedName>A1</definedName></definedNames></workbook>`,
        ),
      ),
    ).toBe('INVALID_WORKBOOK');
  });
  it('checks signed and unsigned descriptors and rejects tampering and CRC failures', async () => {
    const chunks: Uint8Array[] = [];
    const zip = new Zip((error, data) => {
      if (error) throw error;
      chunks.push(data);
    });
    const entry = new ZipDeflate('data.xml');
    zip.add(entry);
    entry.push(bytes('<data/>'), true);
    zip.end();
    const joined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    // A valid ZIP with no workbook reaches the OOXML contract, not a ZIP error.
    expect(await errorCode(joined)).toBe('INVALID_WORKBOOK');
    const view = new DataView(joined.buffer);
    const central = view.getUint32(joined.length - 6, true);
    const descriptor =
      30 +
      view.getUint16(26, true) +
      view.getUint16(28, true) +
      view.getUint32(central + 20, true);
    const unsigned = new Uint8Array(joined.length - 4);
    unsigned.set(joined.subarray(0, descriptor));
    unsigned.set(joined.subarray(descriptor + 4), descriptor);
    new DataView(unsigned.buffer).setUint32(
      unsigned.length - 6,
      central - 4,
      true,
    );
    expect(await errorCode(unsigned)).toBe('INVALID_WORKBOOK');
    const bad = joined.slice();
    bad[descriptor + 4] ^= 1;
    expect(await errorCode(bad)).toBe('INVALID_ZIP');
    const stored = zipSync({ 'data.xml': bytes('abc') }, { level: 0 });
    stored[30 + 'data.xml'.length] ^= 1;
    expect(await errorCode(stored)).toBe('INVALID_ZIP');
  });
  it('enforces all configured resource limits', async () => {
    const simple = fixture(
      '<sheetData><row><c><v>1</v></c><c><v>2</v></c></row></sheetData>',
    );
    for (const options of [
      { maxInputBytes: 10 },
      { maxTotalBytes: 10 },
      { maxPathBytes: 3 },
      { maxColumns: 1 },
    ])
      expect(await errorCode(simple, options)).toBe('LIMIT_EXCEEDED');
    const strings = replacePart(
      simple,
      'xl/sharedStrings.xml',
      '<sst><si><t>A</t></si><si><t>B</t></si></sst>',
    );
    expect(await errorCode(strings, { maxSharedStrings: 1 })).toBe(
      'LIMIT_EXCEEDED',
    );
    const sheets = replacePart(
      simple,
      'xl/workbook.xml',
      `<workbook xmlns:r="${rns}"><sheets><sheet name="One" r:id="s1"/><sheet name="Two" r:id="s1"/></sheets></workbook>`,
    );
    expect(await errorCode(sheets, { maxSheets: 1 })).toBe('LIMIT_EXCEEDED');
    const repeatedWidths = fixture(
      '<cols><col min="1" max="10" width="20"/><col min="1" max="10" width="20"/></cols><sheetData/>',
    );
    expect(await errorCode(repeatedWidths, { maxCells: 10 })).toBe(
      'LIMIT_EXCEEDED',
    );
  });
  it('rejects bombs, too many entries, traversal and truncated archives', async () => {
    const bomb = zipSync(
      { 'bomb.xml': bytes('a'.repeat(2_000_000)) },
      { level: 9 },
    );
    expect(await errorCode(bomb, { maxEntryBytes: 1_000_000 })).toBe(
      'LIMIT_EXCEEDED',
    );
    expect(
      await errorCode(zipSync({ a: bytes('1'), b: bytes('2') }), {
        maxEntries: 1,
      }),
    ).toBe('LIMIT_EXCEEDED');
    expect(await errorCode(zipSync({ '../secret.xml': bytes('x') }))).toBe(
      'UNSAFE_ZIP',
    );
    expect(await errorCode(fixture('<sheetData/>').slice(0, -12))).toBe(
      'INVALID_ZIP',
    );
    expect(
      await errorCode(fixture('<dimension ref="A1:XFE1048576"/><sheetData/>')),
    ).toBe('INVALID_WORKBOOK');
    expect(
      await errorCode(fixture('<dimension ref="A1:XFD1048576"/><sheetData/>'), {
        maxRows: 1000,
      }),
    ).toBe('LIMIT_EXCEEDED');
  });
  it('rejects encryption, ZIP64, multidisk and forged inflated sizes', async () => {
    const base = zipSync(
      { 'sheet.xml': bytes('a'.repeat(10000)) },
      { level: 6 },
    );
    const central = base.findIndex(
      (_, i) =>
        i + 4 <= base.length &&
        new DataView(base.buffer, base.byteOffset + i, 4).getUint32(0, true) ===
          0x02014b50,
    );
    const modify = (fn: (view: DataView) => void) => {
      const copy = base.slice();
      fn(new DataView(copy.buffer));
      return copy;
    };
    expect(
      await errorCode(
        modify((v) => {
          v.setUint16(6, 1, true);
          v.setUint16(central + 8, 1, true);
        }),
      ),
    ).toBe('UNSUPPORTED_ZIP');
    expect(
      await errorCode(
        modify((v) => v.setUint32(central + 24, 0xffffffff, true)),
      ),
    ).toBe('UNSUPPORTED_ZIP');
    expect(
      await errorCode(modify((v) => v.setUint16(base.length - 18, 1, true))),
    ).toBe('UNSUPPORTED_ZIP');
    expect(
      await errorCode(
        modify((v) => {
          v.setUint32(22, 1, true);
          v.setUint32(central + 24, 1, true);
        }),
      ),
    ).toBe('INVALID_ZIP');
  });
  it('bounds actual bomb inflation despite forged metadata and a permissive ratio', async () => {
    const bomb = zipSync({
      'bomb.xml': new Uint8Array(10 * 1024 * 1024).fill(97),
    });
    const view = new DataView(bomb.buffer);
    const central = view.getUint32(bomb.length - 6, true);
    // Metadata claims only 1 MiB, but the actual stream expands to 10 MiB.
    view.setUint32(22, 1024 * 1024, true);
    view.setUint32(central + 24, 1024 * 1024, true);
    const adapter = await getSpreadsheets({
      type: 'xlsx',
      maxEntryBytes: 1024 * 1024,
      maxCompressionRatio: 1_000_000,
    });
    await expect(adapter.read(bomb)).rejects.toMatchObject({
      code: 'LIMIT_EXCEEDED',
      limit: 'maxEntryBytes',
    });
    await expect(
      adapter.read(bomb, {
        maxEntryBytes: 20 * 1024 * 1024,
        maxTotalBytes: 1024 * 1024,
      }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED', limit: 'maxTotalBytes' });
  });
  it('rejects DTDs/entities, malformed XML and bounded depth/text/nodes', async () => {
    const base = fixture('<sheetData/>');
    for (const xml of [
      '<!DOCTYPE workbook [<!ENTITY secret "private">]><workbook>&secret;</workbook>',
      '<workbook>&unknown;</workbook>',
      '<workbook><x></workbook>',
      '<workbook a="1" a="2"/>',
    ]) {
      const input = replacePart(base, 'xl/workbook.xml', xml);
      expect(await errorCode(input)).toBe('INVALID_XML');
    }
    const limits = { ...DEFAULT_LIMITS };
    expect(() =>
      parseXml(bytes('<a><b><c/></b></a>'), { ...limits, maxXmlDepth: 2 }),
    ).toThrow(SpreadsheetError);
    expect(() =>
      parseXml(bytes('<a>private</a>'), { ...limits, maxXmlText: 2 }),
    ).toThrow(SpreadsheetError);
    expect(() =>
      parseXml(bytes('<a><b/><c/></a>'), { ...limits, maxXmlNodes: 2 }),
    ).toThrow(SpreadsheetError);
  });
  it('enforces every semantic read bound and rejects escaping relationships', async () => {
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    await expect(
      adapter.read(
        fixture(
          '<sheetData><row><c><f>SUM(A1:A2)</f><v>3</v></c><c><v>2</v></c></row></sheetData>',
        ),
        { maxCells: 1 },
      ),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(
      adapter.read(
        fixture(
          '<sheetData><row><c><f>SUM(A1:A2)</f><v>3</v></c></row></sheetData>',
        ),
        { maxFormulaLength: 3 },
      ),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(
      adapter.read(fixture('<sheetData/>'), { maxEntryBytes: 10 }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    const input = replacePart(
      fixture('<sheetData/>'),
      '_rels/.rels',
      `<Relationships><Relationship Id="a" Type="${rns}/officeDocument" Target="../private"/></Relationships>`,
    );
    expect(await errorCode(input)).toBe('INVALID_WORKBOOK');
    const malformed = fixture(
      '<sheetData><row><c><v>SECRET-CELL</v></c></row></sheetData>',
    );
    await expect(adapter.read(malformed)).rejects.not.toHaveProperty(
      'message',
      expect.stringContaining('SECRET-CELL'),
    );
  });
});

function businessWorkbook(): Workbook {
  const customers = createSheet('Customers');
  const orders = createSheet('Orders');
  const monthly = createSheet('Monthly');
  const put = (
    sheet: ReturnType<typeof createSheet>,
    rows: (string | number | null)[][],
  ) => {
    for (const [r, row] of rows.entries())
      for (const [c, value] of row.entries())
        sheet.cells.set(r + 1, c + 1, {
          value,
          type:
            value === null
              ? 'empty'
              : typeof value === 'number'
                ? 'number'
                : 'text',
          formatKind: typeof value === 'number' ? 'number' : 'text',
        });
  };
  put(customers, [
    ['ID', 'Name'],
    ['C1', 'Alice'],
    ['C2', 'Bob'],
    ['C3', 'Carol'],
  ]);
  put(orders, [
    ['Customer', 'Name', 'Qty', 'Price', 'Amount', 'Month'],
    ['C1', 'Alice', 2, 10, 20, 'Jan'],
    ['C2', 'Bob', 3, 15, 45, 'Jan'],
    ['C1', 'Alice', 1, 12, 12, 'Feb'],
    ['Total', null, null, null, 77, null],
  ]);
  for (let row = 2; row <= 4; row++) {
    (orders.cells.get(row, 2) as any).formula = parseFormula(
      `VLOOKUP(A${row},Customers!$A$2:$B$4,2,FALSE)`,
    );
    const amount = orders.cells.get(row, 5) as any;
    amount.formula = parseFormula(`C${row}*D${row}`);
    amount.formatKind = 'currency';
    amount.numberFormat = '$#,##0.00';
  }
  (orders.cells.get('E5') as any).formula = parseFormula('SUM(E2:E4)');
  put(monthly, [
    ['Month', 'Sales', 'Orders'],
    ['Jan', 65, 2],
    ['Feb', 12, 1],
  ]);
  for (let row = 2; row <= 3; row++) {
    (monthly.cells.get(row, 2) as any).formula = parseFormula(
      `SUMIFS(Orders!$E$2:$E$4,Orders!$F$2:$F$4,A${row})`,
    );
    (monthly.cells.get(row, 3) as any).formula = parseFormula(
      `COUNTIF(Orders!$F$2:$F$4,A${row})`,
    );
  }
  return createWorkbook([customers, orders, monthly]);
}
describe('fact-only profile', () => {
  it('resolves defined names and table references, including contextual row selectors', async () => {
    const wb = businessWorkbook();
    const orders = wb.sheets[1];
    orders.tables = [
      {
        name: 'OrderData',
        range: range('A1:F5'),
        headerRow: true,
        totalsRow: true,
        columns: ['Customer', 'Name', 'Qty', 'Price', 'Amount', 'Month'],
      },
    ];
    wb.definedNames = [
      {
        name: 'OrderQty',
        text: 'Orders!$C$2:$C$4',
        reference: parseFormula('Orders!$C$2:$C$4').references[0],
      },
    ];
    (orders.cells.get('E2') as any).formula = parseFormula(
      '[@Qty]*OrderData[Price]',
    );
    (orders.cells.get('E3') as any).formula = parseFormula('SUM(OrderQty)');
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    const read = await adapter.read(await adapter.write(wb));
    expect(
      read.sheets[1].cells.get('E2')?.formula?.references[0],
    ).toMatchObject({ name: '[@Qty]', sheet: 'Orders', range: range('C2:C2') });
    const profile = profileWorkbook(read);
    const id = profile.sheets[1].regions[0].id;
    expect(profile.dependencies).toContainEqual({
      from: { region: id, column: 5 },
      to: { region: id, column: 3 },
    });
    expect(profile.dependencies).toContainEqual({
      from: { region: id, column: 5 },
      to: { region: id, column: 4 },
    });
  });
  it('profiles the business workbook after XLSX serialization and parsing', async () => {
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    const wb = await adapter.read(await adapter.write(businessWorkbook()));
    const profile = profileWorkbook(wb);
    expect(profile.sheets.map((s) => s.regions.length)).toEqual([1, 1, 1]);
    expect(profile.lookups).toHaveLength(3);
    expect(
      profile.aggregates.filter((a) => a.function === 'SUMIFS'),
    ).toHaveLength(2);
    expect(profile.sheets[1].regions[0].columns[4].formulaPatterns).toEqual([
      { pattern: 'R[0]C[-2]*R[0]C[-1]', count: 3 },
    ]);
  });
  it('profiles a realistic business workbook deterministically without mutation', () => {
    const wb = businessWorkbook();
    const before = JSON.stringify(wb);
    const p = profileWorkbook(wb);
    expect(profileWorkbook(wb)).toEqual(p);
    expect(JSON.stringify(wb)).toBe(before);
    expect(p.sheets.map((s) => s.regions.length)).toEqual([1, 1, 1]);
    const region = p.sheets[1].regions[0];
    expect(region.headerRowCandidates).toEqual([1]);
    expect(region.totalsRows).toEqual([5]);
    const id = region.columns[0];
    expect(id).toMatchObject({
      header: 'Customer',
      typeCounts: { text: 3 },
      blankCount: 0,
      distinctCount: 2,
      uniqueness: 2 / 3,
      samples: ['C1', 'C2'],
    });
    const amount = region.columns[4];
    expect(amount).toMatchObject({
      min: 12,
      max: 45,
      dominantFormatKind: 'currency',
      formulaDriven: true,
      formulaPatterns: [{ pattern: 'R[0]C[-2]*R[0]C[-1]', count: 3 }],
    });
    expect(p.lookups).toHaveLength(3);
    expect(p.lookups[0]).toMatchObject({
      function: 'VLOOKUP',
      keyColumn: { region: region.id, column: 1 },
      targetRegion: p.sheets[0].regions[0].id,
      returnedColumn: { column: 2 },
    });
    expect(p.dependencies).toContainEqual({
      from: { region: region.id, column: 5 },
      to: { region: region.id, column: 3 },
    });
    expect(p.aggregates.filter((a) => a.function === 'SUMIFS')).toHaveLength(2);
    expect(p.aggregates[0]).toMatchObject({
      criteriaColumns: [{ region: region.id, column: 6 }],
      measureColumn: { region: region.id, column: 5 },
    });
    expect(p.overlaps).toContainEqual({
      from: { region: region.id, column: 1 },
      to: { region: p.sheets[0].regions[0].id, column: 1 },
      sharedDistinct: 2,
      share: 1,
    });
    expect(p.overlaps).toContainEqual({
      to: { region: region.id, column: 1 },
      from: { region: p.sheets[0].regions[0].id, column: 1 },
      sharedDistinct: 2,
      share: 2 / 3,
    });
  });
  it('handles separate/empty regions, blanks, XLOOKUP and INDEX/MATCH and work limits', () => {
    const wb = businessWorkbook();
    wb.sheets.push(createSheet('Empty'));
    const orders = wb.sheets[1];
    (orders.cells.get('B2') as any).formula = parseFormula(
      'XLOOKUP(A2,Customers!A2:A4,Customers!B2:B4)',
    );
    (orders.cells.get('B3') as any).formula = parseFormula(
      'INDEX(Customers!B2:B4,MATCH(A3,Customers!A2:A4,0))',
    );
    orders.cells.set('A9', { value: 'Extra', type: 'text' });
    const p = profileWorkbook(wb);
    expect(p.sheets[1].regions.length).toBe(2);
    expect(p.sheets[3].regions).toEqual([]);
    expect(p.lookups.slice(0, 2).map((l) => l.function)).toEqual([
      'XLOOKUP',
      'INDEX',
    ]);
    expect(() => profileWorkbook(wb, { maxProfileCells: 1 })).toThrow(
      SpreadsheetError,
    );
    expect(() => profileWorkbook(wb, { maxColumnPairs: 1 })).toThrow(
      SpreadsheetError,
    );
    expect(() => profileWorkbook(wb, { overlapThreshold: -1 })).toThrow(
      SpreadsheetError,
    );
  });
});

it('bundles and runs the root in a browser-like runtime without Node builtins', async () => {
  const imports: string[] = [];
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'record-imports',
        resolveId(id) {
          imports.push(id);
          return null;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('./index.ts', import.meta.url)),
        formats: ['iife'],
        name: 'Spreadsheets',
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Expected build output');
  expect(
    imports.filter(
      (id) => id.startsWith('node:') || builtinModules.includes(id),
    ),
  ).toEqual([]);
  const code = output.output.find((chunk) => chunk.type === 'chunk') as any;
  const context = vm.createContext(
    Object.fromEntries([
      ['TextEncoder', TextEncoder],
      ['TextDecoder', TextDecoder],
      ['Uint8Array', Uint8Array],
      ['ArrayBuffer', ArrayBuffer],
      ['DataView', DataView],
      ['Date', Date],
      ['console', console],
    ]),
  );
  vm.runInContext(`${code.code}\nglobalThis.result = Spreadsheets;`, context);
  const api = context.result;
  const adapter = await api.getSpreadsheets({ type: 'xlsx' });
  const sheet = api.createSheet('Browser');
  sheet.cells.set('A1', { type: 'text', value: 'browser' });
  const read = await adapter.read(
    await adapter.write(api.createWorkbook([sheet])),
  );
  expect(read.sheets[0].cells.get('A1').value).toBe('browser');
  expect(api.profileWorkbook(read).sheets[0].regions.length).toBe(1);
  const csv = await api.getSpreadsheets({ type: 'csv' });
  expect(
    (await csv.read(await csv.write(read))).sheets[0].cells.get('A1').value,
  ).toBe('browser');
});
