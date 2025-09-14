/**
 * Node.js-specific path and system utilities
 */

import { tmpdir } from 'os';
import path from 'path';

/**
 * Get Node.js temporary directory with optional subfolder
 * 
 * @param subfolder - Optional subfolder within .have-sdk
 * @returns Full path to temporary directory
 */
export const getTempDirectory = (subfolder?: string): string => {
  const baseTemp = tmpdir();
  const fullPath = subfolder 
    ? path.resolve(baseTemp, '.have-sdk', subfolder)
    : path.resolve(baseTemp, '.have-sdk', 'tests');
    
  return fullPath;
};

/**
 * Default temporary directory for SDK tests (backward compatibility)
 */
export const TMP_DIR = getTempDirectory('tests');

/**
 * Gets current time in milliseconds using Node.js high-resolution timer
 * 
 * @returns Current time in milliseconds
 */
export const timeNow = (): number => {
  const time = process.hrtime();
  return Math.round(time[0] * 1e3 + time[1] / 1e6);
};