import { readCsv, writeCsv } from './csv.js';
import { checkLimit, resolveLimits, SpreadsheetError } from './errors.js';
import type { SpreadsheetAdapter, SpreadsheetOptions } from './types.js';
import { readXlsx } from './xlsx-read.js';
import { writeXlsx } from './xlsx-write.js';

export type { SpreadsheetErrorCode, SpreadsheetLimits } from './errors.js';
export { DEFAULT_LIMITS, SpreadsheetError } from './errors.js';
export { normalizeFormula, parseFormula } from './formula.js';
export * from './model.js';
export * from './profile.js';
export type * from './types.js';

/** Construct an isolated adapter; service adapters will use separate entries. */
export async function getSpreadsheets(
  options: SpreadsheetOptions,
): Promise<SpreadsheetAdapter> {
  if (!options || !['xlsx', 'csv'].includes(options.type)) {
    throw new SpreadsheetError(
      'UNSUPPORTED_FORMAT',
      'Supported spreadsheet types: xlsx, csv.',
    );
  }
  const config = { ...options };
  const defaults = resolveLimits(config);
  return {
    type: config.type,
    async read(input, overrides) {
      const limits = resolveLimits(overrides, defaults);
      const bytes =
        input instanceof Uint8Array
          ? input
          : input instanceof ArrayBuffer
            ? new Uint8Array(input)
            : undefined;
      if (!bytes)
        throw new SpreadsheetError(
          'INVALID_INPUT',
          'Expected Uint8Array or ArrayBuffer.',
        );
      checkLimit(bytes.length, 'maxInputBytes', limits);
      if (config.type === 'xlsx') return readXlsx(bytes, limits);
      return readCsv(bytes, limits, { ...config, ...overrides });
    },
    async write(workbook, overrides) {
      const limits = resolveLimits(overrides, defaults);
      return config.type === 'xlsx'
        ? writeXlsx(workbook, limits, overrides ?? {})
        : writeCsv(workbook, limits, { ...config, ...overrides });
    },
  };
}
