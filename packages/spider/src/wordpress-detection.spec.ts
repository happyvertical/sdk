/**
 * Integration tests for WordPress Download Manager detection in vitest
 *
 * This test file reproduces issue #449: WordPress detection fails in vitest
 * but works in standalone Node scripts.
 *
 * Expected behavior: scrapeDocument() should detect WordPress download pages
 * and return strategy='wordpress-pdf-link' with isPdf=true, regardless of
 * whether it runs in vitest or standalone Node.
 *
 * Related issue: https://github.com/happyvertical/sdk/issues/449
 */

import { describe, expect, it } from 'vitest';
import { scrapeDocument } from './scrapeDocument';

describe('WordPress Download Manager detection (issue #449)', () => {
  // Test with both URLs from the issue
  const agendaUrl =
    'https://townofbentley.ca/download/regular-council-meeting-october-14-2025-agenda/';
  const minutesUrl =
    'https://townofbentley.ca/download/regular-council-meeting-october-14-2025-meeting-minutes/';

  it('should detect WordPress with agenda URL (from issue)', async () => {
    const result = await scrapeDocument(agendaUrl, {
      scraper: 'basic',
      cache: false,
    });

    // This test currently FAILS in vitest but PASSES in standalone Node (per issue #449)
    expect(result.metadata.strategy).toBe('wordpress-pdf-link');
    expect(result.metadata.isPdf).toBe(true);
    expect(result.url).toContain('wpdmdl=');
  }, 30000);

  it('should detect WordPress with basic scraper and simple spider', async () => {
    const result = await scrapeDocument(minutesUrl, {
      scraper: 'basic',
      spider: 'simple',
      cache: false,
    });

    // This test currently FAILS in vitest but PASSES in standalone Node
    expect(result.metadata.strategy).toBe('wordpress-pdf-link');
    expect(result.metadata.isPdf).toBe(true);
    expect(result.url).toContain('wpdmdl=');
  }, 30000);

  it('should detect WordPress with basic scraper and dom spider', async () => {
    const result = await scrapeDocument(minutesUrl, {
      scraper: 'basic',
      spider: 'dom',
      cache: false,
    });

    // This test currently FAILS in vitest but PASSES in standalone Node
    expect(result.metadata.strategy).toBe('wordpress-pdf-link');
    expect(result.metadata.isPdf).toBe(true);
    expect(result.url).toContain('wpdmdl=');
  }, 30000);

  // Note: 'crawlee' scraper type is not supported in scrapeDocument
  // It only supports 'basic' and 'tree'. Testing skipped.

  it('should not create infinite loops when wpdmdl URL returns HTML', async () => {
    // This test verifies the fix for sdk#440: defensive check to prevent
    // infinite loops when a wpdmdl URL returns HTML instead of PDF
    const wpdmdlUrl =
      'https://townofbentley.ca/download/regular-council-meeting-october-14-2025-meeting-minutes/?wpdmdl=17';

    const result = await scrapeDocument(wpdmdlUrl, {
      scraper: 'basic',
      spider: 'simple',
      cache: false,
    });

    // If the wpdmdl URL returns HTML, we should NOT try to extract another
    // WordPress link (which would cause an infinite loop)
    // Instead, it should be treated as basic HTML content
    expect(result.metadata.strategy).not.toBe('wordpress-pdf-link');
  }, 30000);
});
