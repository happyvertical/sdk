/**
 * Browser-specific path and system utilities
 */

/**
 * Get browser temporary directory with optional subfolder
 * 
 * @param subfolder - Optional subfolder within .have-sdk
 * @returns Virtual path to temporary directory
 */
export const getTempDirectory = (subfolder?: string): string => {
  // Browser context - use virtual path
  const baseTemp = '/temp';
  const fullPath = subfolder 
    ? `${baseTemp}/.have-sdk/${subfolder}`
    : `${baseTemp}/.have-sdk/tests`;
    
  return fullPath;
};

/**
 * Default temporary directory for SDK tests (backward compatibility)
 */
export const TMP_DIR = getTempDirectory('tests');

/**
 * Gets current time in milliseconds using browser performance API
 * 
 * @returns Current time in milliseconds
 */
export const timeNow = (): number => {
  // Use performance.now() if available, fallback to Date.now()
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  
  return Date.now();
};