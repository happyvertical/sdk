/**
 * Utility functions for document processing
 */

/**
 * Extract a human-readable title from a URL
 *
 * Takes a URL and extracts the filename from the pathname, then formats it
 * into a readable title by removing the extension and converting separators
 * to spaces. Also decodes URL-encoded characters like %20.
 *
 * @param url - URL string to extract title from
 * @param defaultTitle - Default title to use if extraction fails
 * @returns Formatted title string
 *
 * @example
 * ```typescript
 * getTitleFromUrl('file:///path/to/My%20Document.pdf')
 * // Returns: 'My Document'
 *
 * getTitleFromUrl('https://example.com/research_paper.pdf')
 * // Returns: 'research paper'
 * ```
 */
export function getTitleFromUrl(
  url: string,
  defaultTitle = 'Document',
): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || defaultTitle;

    // Decode URL-encoded characters (e.g., %20 -> space)
    const decodedFilename = decodeURIComponent(filename);

    // Remove extension and convert separators to spaces
    return decodedFilename
      .replace(/\.(pdf|html?|md|txt)$/i, '')
      .replace(/[-_]/g, ' ')
      .trim();
  } catch {
    return defaultTitle;
  }
}
