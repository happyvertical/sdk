import { performance } from 'node:perf_hooks';
import { strToU8, zipSync } from 'fflate/browser';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from './errors.js';
import { FormulaScanner } from './formula.js';
import {
  createSheet,
  createWorkbook,
  getSpreadsheets,
  parseFormula,
  profileWorkbook,
  range,
  SpreadsheetError,
} from './index.js';

const relNs =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function fixture(
  sheet: string,
  names = '',
  extra: Record<string, string> = {},
): Uint8Array {
  const parts = {
    '_rels/.rels': `<Relationships><Relationship Id="w" Type="${relNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook xmlns:r="${relNs}"><sheets><sheet name="Data" r:id="s"/></sheets><definedNames>${names}</definedNames></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="s" Type="${relNs}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns:r="${relNs}">${sheet}</worksheet>`,
    ...extra,
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(parts).map(([path, text]) => [path, strToU8(text)]),
    ),
  );
}
async function timed(
  name: string,
  run: () => unknown | Promise<unknown>,
): Promise<void> {
  const start = performance.now();
  await run();
  const ms = performance.now() - start;
  console.info(`HOSTILE_TIMING ${name}: ${ms.toFixed(2)} ms`);
  expect(ms, name).toBeLessThan(5000);
}
async function limited(
  run: () => unknown | Promise<unknown>,
  limit?: string,
): Promise<void> {
  try {
    await run();
    throw new Error('Expected a typed processing limit');
  } catch (error) {
    expect(error).toBeInstanceOf(SpreadsheetError);
    expect(error).toMatchObject({
      code: 'LIMIT_EXCEEDED',
      ...(limit ? { limit } : {}),
    });
  }
}
const rows = (formula: string, count: number) =>
  `<sheetData>${Array.from({ length: count }, (_, i) => `<row r="${i + 1}"><c><f>${formula}</f><v>1</v></c></row>`).join('')}</sheetData>`;

describe('hostile workbook processing budgets', () => {
  it('bounds 100k names × 100k named-reference formulas and uses indexed lookups when allowed', async () => {
    const names = Array.from(
      { length: 100_000 },
      (_, i) => `<definedName name="name_${i}">Data!$A$1</definedName>`,
    ).join('');
    const bytes = fixture(rows('name_99999', 100_000), names);
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    await timed('100k names × 100k formulas / defaults', () =>
      limited(() => adapter.read(bytes), 'maxDefinedNames'),
    );
    await timed(
      '100k names × 100k formulas / indexed read + profile',
      async () => {
        const wb = await adapter.read(bytes, { maxDefinedNames: 100_000 });
        expect(wb.sheets[0].cells.size).toBe(100_000);
        expect(
          wb.sheets[0].cells.get('A100000')?.formula?.references[0].range,
        ).toEqual(range('A1:A1'));
        await limited(() => profileWorkbook(wb), 'maxDefinedNames');
        const profile = profileWorkbook(wb, { maxDefinedNames: 100_000 });
        expect(profile.dependencies).toHaveLength(1);
      },
    );
  });
  for (const [name, formula] of [
    ['nested calls', 'A('.repeat(4096)],
    ['unclosed brackets', '['.repeat(8192)],
    ['unclosed quotes', `${"'".repeat(8191)}x`],
  ])
    it(`bounds 8192-character ${name} across 1000 cells`, async () => {
      const bytes = fixture(rows(formula, 1000));
      const adapter = await getSpreadsheets({ type: 'xlsx' });
      await timed(`8192-char ${name} × 1000 cells`, async () => {
        try {
          const wb = await adapter.read(bytes);
          await limited(() => profileWorkbook(wb));
        } catch (error) {
          expect(error).toBeInstanceOf(SpreadsheetError);
          expect(error).toMatchObject({ code: 'LIMIT_EXCEEDED' });
        }
      });
    });
  it('parses a duplicate table part once and limits repeated references', async () => {
    const tableParts = `<tableParts>${'<tablePart r:id="t"/>'.repeat(100_000)}</tableParts>`;
    const bytes = fixture(`<sheetData/>${tableParts}`, '', {
      'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships><Relationship Id="t" Type="${relNs}/table" Target="../tables/t.xml"/></Relationships>`,
      'xl/tables/t.xml':
        '<table name="Tbl" ref="A1:A2"><tableColumns><tableColumn name="Col"/></tableColumns></table>',
    });
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    await timed('100k duplicate tablePart references / default', () =>
      limited(() => adapter.read(bytes), 'maxPartReferences'),
    );
    await timed(
      '100k duplicate tablePart references / one parsed table',
      async () => {
        const wb = await adapter.read(bytes, {
          maxPartReferences: 100_000,
          maxTables: 1,
        });
        expect(wb.sheets[0].tables).toHaveLength(1);
      },
    );
  });
  it('preflights the wide-column overlap cross-product', async () => {
    const wb = createWorkbook([createSheet('Left'), createSheet('Right')]);
    for (const sheet of wb.sheets)
      for (let col = 1; col <= 16_384; col++) {
        sheet.cells.set(1, col, { type: 'text', value: `Header${col}` });
        sheet.cells.set(2, col, { type: 'number', value: col });
      }
    await timed('16,384 × 16,384 overlap columns', () =>
      limited(() => profileWorkbook(wb)),
    );
  });
  it('discovers disconnected regions without restarting the map iterator', async () => {
    const sheet = createSheet('Disconnected');
    for (let row = 1; row <= 100_000; row++)
      sheet.cells.set(row * 2, 1, { type: 'number', value: row });
    await timed('100k disconnected regions', () => {
      expect(
        profileWorkbook(createWorkbook([sheet])).sheets[0].regions,
      ).toHaveLength(100_000);
    });
  });
  it('bounds shared-formula expansion and repeated large shared values', async () => {
    const formula = 'SUM($B$1)'.padEnd(8192, ' ');
    const cells = `<sheetData><row r="1"><c><f t="shared" si="1" ref="A1:A5000">${formula}</f><v>1</v></c></row>${Array.from({ length: 4999 }, (_, i) => `<row r="${i + 2}"><c><f t="shared" si="1"/><v>1</v></c></row>`).join('')}</sheetData>`;
    const bytes = fixture(cells);
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    await timed('8192-char shared formula × 5000 followers', () =>
      limited(() => adapter.read(bytes), 'maxFormulaWork'),
    );
    const sheet = createSheet('Shared');
    const value = 'x'.repeat(1_000_000);
    for (let row = 1; row <= 1000; row++)
      sheet.cells.set(row, 1, { type: 'text', value });
    await timed('1000 shared 1M-character values', () =>
      limited(() => profileWorkbook(createWorkbook([sheet]))),
    );
  });
  it('counts inner work, caches tokenization and keeps scoped names and tables correct', async () => {
    const scanner = new FormulaScanner();
    const scan = scanner.scan('VLOOKUP(A2,Data!A1:B3,2,FALSE)');
    expect(scanner.scan(scan.text)).toBe(scan);
    expect(scan.calls[0].args).toHaveLength(4);
    expect(scan.references).toHaveLength(2);
    const sheet = createSheet('Data');
    sheet.cells.set('A1', { type: 'text', value: 'Qty' }).set('A2', {
      type: 'number',
      value: 3,
      formula: parseFormula('Local+[@Qty]'),
    });
    sheet.tables.push({
      name: 'Tbl',
      range: range('A1:A2'),
      columns: ['Qty'],
      headerRow: true,
      totalsRow: false,
    });
    const wb = createWorkbook([sheet]);
    wb.definedNames.push(
      { name: 'LOCAL', scope: 'Data', text: 'Data!A2' },
      { name: 'Local', text: 'Data!A1' },
    );
    expect(profileWorkbook(wb).dependencies[0].to.column).toBe(1);
    await limited(() => profileWorkbook(wb, { maxProfileWork: 1 }));
    expect(() =>
      new FormulaScanner({ ...DEFAULT_LIMITS, maxFormulaDepth: 2 }).scan(
        'A(A(A(1)))',
      ),
    ).toThrow(SpreadsheetError);
  });
  it('keeps long number formats and CSV fields linear and bounds repeated export values', async () => {
    const format = '[$'.repeat(50_000);
    const bytes = fixture(
      '<sheetData>' +
        Array.from(
          { length: 10_000 },
          (_, i) => `<row r="${i + 1}"><c s="0"><v>1</v></c></row>`,
        ).join('') +
        '</sheetData>',
      '',
      {
        'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="s" Type="${relNs}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="st" Type="${relNs}/styles" Target="styles.xml"/></Relationships>`,
        'xl/styles.xml': `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="${format}"/></numFmts><cellXfs><xf numFmtId="164"/></cellXfs></styleSheet>`,
      },
    );
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    await timed('100k-char number format × 10k cells', async () => {
      expect((await adapter.read(bytes)).sheets[0].cells.size).toBe(10_000);
    });
    const csv = await getSpreadsheets({ type: 'csv' });
    await timed('500k-character hostile CSV field', async () => {
      const wb = await csv.read(strToU8(`${'9'.repeat(500_000)}x`));
      expect(wb.sheets[0].cells.get('A1')?.type).toBe('text');
    });
    const sheet = createSheet('Repeated');
    const value = 'x'.repeat(1_000_000);
    for (let row = 1; row <= 1000; row++)
      sheet.cells.set(row, 1, { type: 'text', value });
    await timed('CSV repeated 1M-character values', () =>
      limited(() => csv.write(createWorkbook([sheet])), 'maxReadWork'),
    );
  });
  it('limits merges, validation ranges and distinct tables', async () => {
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    await limited(
      () =>
        adapter.read(fixture('<unused/>'.repeat(1000)), { maxReadWork: 100 }),
      'maxReadWork',
    );
    await limited(
      () =>
        adapter.read(
          fixture(
            '<mergeCells><mergeCell ref="A1:B1"/><mergeCell ref="A2:B2"/></mergeCells>',
          ),
          { maxMerges: 1 },
        ),
      'maxMerges',
    );
    await limited(
      () =>
        adapter.read(
          fixture(
            '<dataValidations><dataValidation type="list" sqref="A1 A2"/></dataValidations>',
          ),
          { maxDataValidations: 1 },
        ),
      'maxDataValidations',
    );
    const bytes = fixture(
      '<tableParts><tablePart r:id="a"/><tablePart r:id="b"/></tableParts>',
      '',
      {
        'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships><Relationship Id="a" Type="${relNs}/table" Target="../tables/a.xml"/><Relationship Id="b" Type="${relNs}/table" Target="../tables/b.xml"/></Relationships>`,
        'xl/tables/a.xml':
          '<table name="A" ref="A1:A2"><tableColumns><tableColumn name="Col"/></tableColumns></table>',
        'xl/tables/b.xml':
          '<table name="B" ref="B1:B2"><tableColumns><tableColumn name="Col"/></tableColumns></table>',
      },
    );
    await limited(() => adapter.read(bytes, { maxTables: 1 }), 'maxTables');
  });
});
