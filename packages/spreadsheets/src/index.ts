import { resolveLimits, SpreadsheetError } from './errors.js';
import type { SpreadsheetAdapter, SpreadsheetOptions } from './types.js';
import { readXlsx } from './xlsx-read.js';

export * from './errors.js';
export * from './model.js';
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
  const defaults = resolveLimits(options);
  return {
    type: options.type,
    async read(input, overrides) {
      const limits = resolveLimits({ ...defaults, ...overrides });
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
      if (options.type === 'xlsx') return readXlsx(bytes, limits);
      throw new SpreadsheetError(
        'UNSUPPORTED_FORMAT',
        'CSV adapter is not installed.',
      );
    },
    async write() {
      throw new SpreadsheetError(
        'UNSUPPORTED_FORMAT',
        'Writer is not installed.',
      );
    },
  };
}
