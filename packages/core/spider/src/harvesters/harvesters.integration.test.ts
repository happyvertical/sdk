import { describe, expect, it } from 'vitest';
import { getHarvester } from '../shared/harvester-factory';

/**
 * Integration tests for harvesters using real-world websites
 * These tests verify that harvesters can handle actual page interactions
 *
 * NOTE: The Bentley town page uses a complex hierarchical directory/tree structure
 * (jqueryFileTree) with multiple levels: years → months → individual meetings.
 * The TreeHarvester now handles this properly with enhanced hierarchical expansion.
 */
describe('Harvester Integration - Bentley Town Meetings', () => {
  it('should extract links from Bentley meetings page with directory tree', async () => {
    const url =
      'https://townofbentley.ca/town-office/council/meetings-agendas/';

    const treeHarvester = await getHarvester({
      harvester: 'tree',
      maxIterations: 20, // Increased for hierarchical trees
      clickDelay: 500,
      headless: true,
    });

    const result = await treeHarvester.harvest(url, {
      cache: false,
      timeout: 120000, // 2 minutes for deep hierarchy
    });

    // Verify HarvestResult structure
    expect(result).toBeDefined();
    expect(result.url).toBeTruthy();
    expect(result.content).toBeDefined();
    expect(typeof result.content).toBe('string');
    expect(Array.isArray(result.links)).toBe(true);

    // Verify strategy information
    expect(result.strategy.type).toBe('tree');
    expect(result.strategy.spider).toBe('crawlee');

    // Verify metrics
    expect(result.metrics.duration).toBeGreaterThan(0);
    expect(result.metrics.linkCount).toBe(result.links.length);
    expect(result.metrics.complete).toBe(true);

    console.log(
      `\n🎯 TreeHarvester with hierarchical expansion:`,
    );
    console.log(`   Total links: ${result.links.length}`);
    console.log(`   Interactions: ${result.metrics.interactionCount}`);
    console.log(`   Duration: ${result.metrics.duration}ms`);

    // Verify we found accordions and clicked them (should be many for hierarchical tree)
    expect(result.metrics.interactionCount).toBeGreaterThan(10);

    // Extract meeting links
    const meetingLinks = result.links.filter((link) =>
      /meeting|agenda|minutes/i.test(link.text),
    );

    console.log(`   Meeting-related links: ${meetingLinks.length}`);

    // Extract PDF links specifically
    const pdfLinks = result.links.filter((link) =>
      link.href.toLowerCase().endsWith('.pdf'),
    );

    console.log(`   PDF links: ${pdfLinks.length}`);

    pdfLinks.slice(0, 5).forEach((link, i) => {
      console.log(`      ${i + 1}. ${link.text || link.href}`);
    });

    // Verify we found lots of meeting links (hierarchical expansion reveals many)
    expect(meetingLinks.length).toBeGreaterThan(20);

    // Verify we found PDFs (town meetings typically have agenda PDFs)
    expect(pdfLinks.length).toBeGreaterThan(0);

    // Verify confidence score reflects that tree structure was found
    expect(result.strategy.confidence).toBeGreaterThanOrEqual(0.9);
  }, 150000); // 2.5 minute timeout for deep hierarchy expansion

  it('should handle pages with no tree structure gracefully', async () => {
    // Test with a simple page that has no tree structure
    const harvester = await getHarvester({
      harvester: 'tree',
      maxIterations: 5,
      headless: true,
    });

    const result = await harvester.harvest('https://example.com', {
      cache: false,
    });

    // Should still work, just with no interactions
    expect(result).toBeDefined();
    expect(result.metrics.interactionCount).toBe(0);
    expect(result.strategy.confidence).toBe(0.5); // Lower confidence when no tree structure
    expect(result.links.length).toBeGreaterThan(0); // Should still find normal links
  }, 60000);

  it.skip('should perform interactions on directory-style trees', async () => {
    const url =
      'https://townofbentley.ca/town-office/council/meetings-agendas/';

    const harvester = await getHarvester({
      harvester: 'tree',
      maxIterations: 10,
      clickDelay: 500,
      headless: true,
    });

    const result = await harvester.harvest(url, { cache: false, timeout: 90000 });

    console.log(`\n🔍 Tree Harvester Results:`);
    console.log(`   Total links: ${result.links.length}`);
    console.log(`   Interactions: ${result.metrics.interactionCount}`);
    console.log(`   Duration: ${result.metrics.duration}ms`);

    // Verify harvester performed interactions
    expect(result.metrics.interactionCount).toBeGreaterThan(0);

    // Verify it found links
    expect(result.links.length).toBeGreaterThan(0);
  }, 120000);
});
