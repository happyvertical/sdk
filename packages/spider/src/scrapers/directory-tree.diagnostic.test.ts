import { describe, expect, it } from 'vitest';
import { getScraper } from '../shared/scraper-factory';

/**
 * Diagnostic test to understand the Bentley directory tree behavior
 *
 * This test is skipped in regular CI runs because it performs deep
 * hierarchical scraping which can take 10+ minutes. Run manually with:
 * npx vitest run src/scrapers/directory-tree.diagnostic.test.ts
 */
describe('Directory Tree Diagnostic', () => {
  it.skip('should analyze Bentley page structure and tree behavior', async () => {
    const url =
      'https://townofbentley.ca/town-office/council/meetings-agendas/';

    const scraper = await getScraper({
      scraper: 'tree',
      maxIterations: 20, // More iterations for deep hierarchy
      clickDelay: 500, // Longer delay
      headless: true,
    });

    const result = await scraper.scrape(url, {
      cache: false,
      timeout: 90000,
    });

    console.log('\n=== DIAGNOSTIC RESULTS ===');
    console.log(`Total links found: ${result.links.length}`);
    console.log(`Interactions performed: ${result.metrics.interactionCount}`);
    console.log(`Duration: ${result.metrics.duration}ms`);
    console.log(`Confidence: ${result.strategy.confidence}`);

    // Group links by type
    const pdfLinks = result.links.filter((l) => l.href.endsWith('.pdf'));
    const yearLinks = result.links.filter((l) => /^\d{4}$/.test(l.text));
    const meetingLinks = result.links.filter((l) =>
      /meeting|agenda|minutes/i.test(l.text),
    );

    console.log(`\nPDF links: ${pdfLinks.length}`);
    console.log(`Year links: ${yearLinks.length}`);
    console.log(`Meeting links: ${meetingLinks.length}`);

    console.log(`\nSample PDF links:`);
    pdfLinks.slice(0, 5).forEach((link, i) => {
      console.log(`  ${i + 1}. ${link.text.substring(0, 60)}`);
      console.log(`     ${link.href}`);
    });

    // This test is just for diagnostic purposes
    expect(result).toBeDefined();
  }, 120000);
});
