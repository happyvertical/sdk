import { resolveLimits, SpreadsheetError } from './errors.js';
import type { SpreadsheetAdapter, SpreadsheetOptions } from './types.js';

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
  resolveLimits(options);
  // Adapter implementations are installed in the following implementation steps.
  throw new SpreadsheetError(
    'UNSUPPORTED_FORMAT',
    'Adapter implementation is not installed.',
  );
}
