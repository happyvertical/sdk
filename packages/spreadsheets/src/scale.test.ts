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
  SpreadsheetError,
} from './index.js';
import { parseXml } from './xml.js';

const rel =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function fixture(count: number, formulas = false): Uint8Array {
  const rows = Array.from(
    { length: count },
    (_, i) =>
      `<row r="${i + 1}"><c>${formulas ? `<f>A${i + 1}*2</f>` : ''}<v>${i + 1}</v></c></row>`,
  ).join('');
  return zipSync(
    Object.fromEntries(
      Object.entries({
        '_rels/.rels': `<Relationships><Relationship Id="w" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        'xl/workbook.xml': `<workbook><sheets><sheet name="Data" r:id="s"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="s" Type="${rel}/worksheet" Target="worksheets/s.xml"/></Relationships>`,
        'xl/worksheets/s.xml': `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
      }).map(([name, value]) => [name, strToU8(value)]),
    ),
  );
}
async function measured(name: string, run: () => unknown | Promise<unknown>) {
  const start = performance.now();
  await run();
  console.info(
    `SCALE ${name}: ${(performance.now() - start).toFixed(2)} ms; process peak RSS ${process.resourceUsage().maxRSS} KiB`,
  );
}

describe('default capacity regressions', () => {
  it('reserves inline-string XML node headroom for one million rows', () => {
    expect(DEFAULT_LIMITS.maxXmlNodes).toBe(5 * DEFAULT_LIMITS.maxCells);
    expect(4 * DEFAULT_LIMITS.maxCells + 2).toBeLessThan(
      DEFAULT_LIMITS.maxXmlNodes,
    );
    const count = 1000;
    const bytes = strToU8(
      `<worksheet><sheetData>${'<row><c t="inlineStr"><is><t>x</t></is></c></row>'.repeat(count)}</sheetData></worksheet>`,
    );
    const exactNodes = 4 * count + 2;
    for (const maxXmlNodes of [5 * count, exactNodes]) {
      const doc = parseXml(bytes, { ...DEFAULT_LIMITS, maxXmlNodes });
      expect(doc.children[0].children).toHaveLength(count);
      expect(
        doc.children[0].children[count - 1].children[0].children[0].children[0]
          .text,
      ).toBe('x');
    }
    expect(() =>
      parseXml(bytes, { ...DEFAULT_LIMITS, maxXmlNodes: exactNodes - 1 }),
    ).toThrowError(
      expect.objectContaining({ code: 'LIMIT_EXCEEDED', limit: 'maxXmlNodes' }),
    );
  });
  for (const [count, formulas] of [
    [100_000, true],
    [500_000, false],
  ] as const)
    it(`reads and profiles ${count} ${formulas ? 'fill-down formula' : 'plain'} rows with defaults`, async () => {
      const bytes = fixture(count, formulas);
      const adapter = await getSpreadsheets({ type: 'xlsx' });
      await measured(`${count} read + profile`, async () => {
        const workbook = await adapter.read(bytes);
        expect(workbook.sheets[0].cells.size).toBe(count);
        const profile = profileWorkbook(workbook);
        const column = profile.sheets[0].regions[0].columns[0];
        expect(column.typeCounts.number).toBe(count);
        expect(column.max).toBe(count);
        if (formulas) {
          expect(column.formulaPatterns).toEqual([
            { pattern: 'R[0]C[0]*2', count },
          ]);
          expect(profile.dependencies).toHaveLength(1);
        }
      });
    });
  it('writes and reads one million numeric cells with defaults', async () => {
    const sheet = createSheet('Million');
    for (let row = 1; row <= 1000; row++)
      for (let col = 1; col <= 1000; col++)
        sheet.cells.set(row, col, { type: 'number', value: row * 1000 + col });
    const adapter = await getSpreadsheets({ type: 'xlsx' });
    await measured('1M write + read', async () => {
      const bytes = await adapter.write(createWorkbook([sheet]));
      const workbook = await adapter.read(bytes);
      expect(workbook.sheets[0].cells.size).toBe(1_000_000);
      expect(workbook.sheets[0].cells.get(1000, 1000)?.value).toBe(1_001_000);
    });
  });
  it('reads 20 MiB CSV with defaults', async () => {
    const record = `${'x'.repeat(1023)}\n`;
    const bytes = strToU8(record.repeat(20 * 1024));
    const adapter = await getSpreadsheets({ type: 'csv' });
    await measured('20MiB CSV read', async () => {
      const workbook = await adapter.read(bytes);
      expect(workbook.sheets[0].cells.size).toBe(20 * 1024);
      expect(workbook.sheets[0].cells.get(20 * 1024, 1)?.value).toHaveLength(
        1023,
      );
    });
  });
  it('keeps scanning beyond the cache cap and charges uncached work', () => {
    const scanner = new FormulaScanner({
      ...DEFAULT_LIMITS,
      maxFormulaCacheEntries: 1,
      maxFormulaWork: 100,
    });
    const cached = scanner.scan('A1');
    expect(scanner.scan('A2').references[0].reference.range.start.row).toBe(2);
    expect(scanner.scan('A1')).toBe(cached);
    expect(() => {
      for (let i = 0; i < 100; i++) scanner.scan('A3');
    }).toThrow(SpreadsheetError);
  });
  it('retains broken references and continues past every error literal', () => {
    const formula = parseFormula(
      "#REF!+Sheet!#REF!+'Other Sheet'!#REF!+SUM(A1)+#DIV/0!+B2+#VALUE!+#NAME?+#N/A+#NUM!+#NULL!+#SPILL!+#CALC!+#GETTING_DATA+C3",
    );
    expect(formula.functions).toEqual(['SUM']);
    expect(
      formula.references.map((r) => [r.sheet, r.name, r.range.start]),
    ).toEqual([
      [undefined, '#REF!', { row: 1, col: 1 }],
      ['Sheet', '#REF!', { row: 1, col: 1 }],
      ['Other Sheet', '#REF!', { row: 1, col: 1 }],
      [undefined, undefined, { row: 1, col: 1 }],
      [undefined, undefined, { row: 2, col: 2 }],
      [undefined, undefined, { row: 3, col: 3 }],
    ]);
    const sheet = createSheet('Data');
    sheet.cells.set('A1', {
      type: 'number',
      value: 1,
      formula: parseFormula('#REF!'),
    });
    expect(profileWorkbook(createWorkbook([sheet])).dependencies).toEqual([]);
  });
});
