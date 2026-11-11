import type { SpreadsheetLimits } from './errors.js';
import type { Workbook } from './model.js';

export interface ReadOptions extends Partial<SpreadsheetLimits> {
  delimiter?: string;
  sheetName?: string;
}
export interface WriteOptions extends ReadOptions {
  boldHeaderRow?: boolean;
  columnWidths?: number[];
  bom?: boolean;
}
export type SpreadsheetOptions =
  | ({ type: 'xlsx' } & Partial<SpreadsheetLimits>)
  | ({
      type: 'csv';
      delimiter?: string;
      sheetName?: string;
    } & Partial<SpreadsheetLimits>);
export interface SpreadsheetAdapter {
  readonly type: 'xlsx' | 'csv';
  read(
    input: Uint8Array | ArrayBuffer,
    options?: ReadOptions,
  ): Promise<Workbook>;
  write(workbook: Workbook, options?: WriteOptions): Promise<Uint8Array>;
}
