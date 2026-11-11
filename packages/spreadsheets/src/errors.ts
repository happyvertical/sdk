/** Closed failure contract. Messages never interpolate workbook content. */
export type SpreadsheetErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'INVALID_INPUT'
  | 'INVALID_ZIP'
  | 'UNSAFE_ZIP'
  | 'UNSUPPORTED_ZIP'
  | 'INVALID_XML'
  | 'LIMIT_EXCEEDED'
  | 'INVALID_WORKBOOK';

export class SpreadsheetError extends Error {
  constructor(
    public readonly code: SpreadsheetErrorCode,
    message: string,
    public readonly limit?: keyof SpreadsheetLimits,
  ) {
    super(message);
    this.name = 'SpreadsheetError';
  }
}

export interface SpreadsheetLimits {
  maxInputBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxCompressionRatio: number;
  maxPathBytes: number;
  maxXmlDepth: number;
  maxXmlText: number;
  maxXmlNodes: number;
  maxSheets: number;
  maxCells: number;
  maxSharedStrings: number;
  maxFormulaLength: number;
  maxRows: number;
  maxColumns: number;
}

export const DEFAULT_LIMITS: Readonly<SpreadsheetLimits> = Object.freeze({
  maxInputBytes: 32 * 1024 * 1024,
  maxEntries: 10_000,
  maxEntryBytes: 32 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxPathBytes: 1024,
  maxXmlDepth: 64,
  maxXmlText: 8 * 1024 * 1024,
  maxXmlNodes: 2_000_000,
  maxSheets: 128,
  maxCells: 1_000_000,
  maxSharedStrings: 500_000,
  maxFormulaLength: 8192,
  maxRows: 1_048_576,
  maxColumns: 16_384,
});

export function resolveLimits(
  options: Partial<SpreadsheetLimits> = {},
  base: Readonly<SpreadsheetLimits> = DEFAULT_LIMITS,
): SpreadsheetLimits {
  const limits = { ...base };
  for (const key of Object.keys(limits) as (keyof SpreadsheetLimits)[]) {
    const value = options[key] ?? limits[key];
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new SpreadsheetError(
        'INVALID_INPUT',
        'Limits must be positive safe integers.',
      );
    }
    limits[key] = value;
  }
  return limits;
}

export function checkLimit(
  actual: number,
  key: keyof SpreadsheetLimits,
  limits: SpreadsheetLimits,
): void {
  if (actual > limits[key])
    throw new SpreadsheetError(
      'LIMIT_EXCEEDED',
      `Spreadsheet limit exceeded: ${key}.`,
      key,
    );
}

export function invalid(message = 'Invalid workbook structure.'): never {
  throw new SpreadsheetError('INVALID_WORKBOOK', message);
}
