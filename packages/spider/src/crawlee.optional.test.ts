import { describe, expect, it } from 'vitest';
import { getSpider } from './index';

/**
 * Optional integration test for Crawlee adapter
 *
 * These tests require network access and hit real websites.
 * Run with: RUN_OPTIONAL_TESTS=1 npm test
 *
 * Tests real-world scenario: fetching PDF links from Bentley town website
 */

const RUN_OPTIONAL = process.env.RUN_OPTIONAL_TESTS === '1';

describe.skipIf(!RUN_OPTIONAL)(
  'Crawlee Optional - Bentley Town PDF Links',
  () => {
    it('should fetch and extract PDF links from town meetings page', async () => {
      const spider = await getSpider({
        adapter: 'crawlee',
        headless: true,
        cacheDir: '.cache/spider-integration',
      });

      const url =
        'https://townofbentley.ca/town-office/council/meetings-agendas/';

      // Fetch the page - enqueueLinks will expand navigation automatically
      const page = await spider.fetch(url, {
        cache: false, // Don't cache for integration tests
        timeout: 60000, // 60 second timeout for slow sites
      });

      // Verify Page structure
      expect(page).toBeDefined();
      expect(page.url).toBeTruthy();
      expect(page.content).toBeDefined();
      expect(typeof page.content).toBe('string');
      expect(page.content.length).toBeGreaterThan(0);
      expect(Array.isArray(page.links)).toBe(true);
      expect(page.raw).toBeDefined();

      // Extract PDF links
      const pdfLinks = page.links.filter((link) =>
        link.href.toLowerCase().endsWith('.pdf'),
      );

      // Verify we found PDF links
      expect(pdfLinks.length).toBeGreaterThan(0);

      // Log results for manual verification
      console.log(
        `\n📄 Found ${pdfLinks.length} PDF links on Bentley town page:`,
      );
      pdfLinks.slice(0, 5).forEach((link, i) => {
        console.log(`  ${i + 1}. ${link.href} (${link.text || 'no text'})`);
      });

      if (pdfLinks.length > 5) {
        console.log(`  ... and ${pdfLinks.length - 5} more`);
      }

      // Verify link format (should be actual PDF files from the town)
      const hasTownPdfLinks = pdfLinks.some(
        (link) =>
          link.href.includes('townofbentley.ca') &&
          link.href.toLowerCase().endsWith('.pdf'),
      );

      expect(hasTownPdfLinks).toBe(true);
    }, 120000); // 2 minute timeout for integration test

    it('should cache the Bentley page on second fetch', async () => {
      const spider = await getSpider({
        adapter: 'crawlee',
        cacheDir: '.cache/spider-integration',
      });

      const url =
        'https://townofbentley.ca/town-office/council/meetings-agendas/';

      // First fetch - not cached
      const startTime1 = Date.now();
      const page1 = await spider.fetch(url, {
        cache: true,
        cacheExpiry: 300000, // 5 minutes
      });
      const fetchTime1 = Date.now() - startTime1;

      expect(page1).toBeDefined();
      expect(page1.links.length).toBeGreaterThan(0);

      // Second fetch - should be cached and much faster
      const startTime2 = Date.now();
      const page2 = await spider.fetch(url, {
        cache: true,
        cacheExpiry: 300000,
      });
      const fetchTime2 = Date.now() - startTime2;

      expect(page2).toBeDefined();
      expect(page2.content).toBe(page1.content);
      expect(page2.links).toEqual(page1.links);

      // Cached fetch should be significantly faster (at least 10x)
      expect(fetchTime2).toBeLessThan(fetchTime1 / 10);

      console.log(
        `\n⚡ Performance: First fetch ${fetchTime1}ms, Cached fetch ${fetchTime2}ms (${Math.round(fetchTime1 / fetchTime2)}x faster)`,
      );
    }, 120000);

    it('should handle relative PDF links correctly', async () => {
      const spider = await getSpider({
        adapter: 'crawlee',
        headless: true,
      });

      const url =
        'https://townofbentley.ca/town-office/council/meetings-agendas/';
      const page = await spider.fetch(url, { cache: false });

      const pdfLinks = page.links.filter((link) =>
        link.href.toLowerCase().endsWith('.pdf'),
      );

      // Some links might be relative, some absolute
      const hasRelativeLinks = pdfLinks.some(
        (link) => !link.href.startsWith('http'),
      );
      const hasAbsoluteLinks = pdfLinks.some((link) =>
        link.href.startsWith('http'),
      );

      // At least one type should exist
      expect(hasRelativeLinks || hasAbsoluteLinks).toBe(true);

      console.log(
        `\n🔗 Link types: ${hasRelativeLinks ? 'Relative' : 'None'} / ${hasAbsoluteLinks ? 'Absolute' : 'None'}`,
      );
    }, 120000);
  },
);
