import { describe, expect, it } from 'vitest';
import { getScraper } from '../shared/scraper-factory';

describe('Scraper Factory', () => {
  it('should create basic scraper', async () => {
    const scraper = await getScraper({ scraper: 'basic' });
    expect(scraper).toBeDefined();
    expect(scraper.getType()).toBe('basic');
    expect(typeof scraper.scrape).toBe('function');
  });

  it('should create basic scraper with custom spider', async () => {
    const scraper = await getScraper({
      scraper: 'basic',
      spider: 'dom',
    });
    expect(scraper).toBeDefined();
    expect(scraper.getType()).toBe('basic');
  });

  it('should create tree scraper', async () => {
    const scraper = await getScraper({ scraper: 'tree' });
    expect(scraper).toBeDefined();
    expect(scraper.getType()).toBe('tree');
    expect(typeof scraper.scrape).toBe('function');
  });

  it('should throw error for unsupported scraper', async () => {
    await expect(
      getScraper({ scraper: 'invalid' } as any),
    ).rejects.toThrow('Unsupported scraper');
  });
});

describe('BasicScraper', () => {
  it('should scrape a simple page', async () => {
    const scraper = await getScraper({
      scraper: 'basic',
      spider: 'simple',
    });

    const result = await scraper.scrape('https://example.com', {
      cache: false,
    });

    // Verify ScrapeResult structure
    expect(result).toBeDefined();
    expect(result.url).toBe('https://example.com');
    expect(result.content).toBeDefined();
    expect(typeof result.content).toBe('string');
    expect(Array.isArray(result.links)).toBe(true);
    expect(result.links.length).toBeGreaterThan(0);

    // Verify strategy information
    expect(result.strategy).toBeDefined();
    expect(result.strategy.type).toBe('basic');
    expect(result.strategy.spider).toBe('simple');
    expect(result.strategy.confidence).toBe(1.0);

    // Verify metrics
    expect(result.metrics).toBeDefined();
    expect(result.metrics.duration).toBeGreaterThan(0);
    expect(result.metrics.linkCount).toBe(result.links.length);
    expect(result.metrics.interactionCount).toBe(0); // No interactions
    expect(result.metrics.complete).toBe(true);

    // Verify raw data
    expect(result.raw).toBeDefined();
  });

  it('should use DOM spider when specified', async () => {
    const scraper = await getScraper({
      scraper: 'basic',
      spider: 'dom',
    });

    const result = await scraper.scrape('https://example.com', {
      cache: false,
    });

    expect(result.strategy.spider).toBe('dom');
    expect(result.links.length).toBeGreaterThan(0);
  });

  it('should extract link metadata', async () => {
    const scraper = await getScraper({
      scraper: 'basic',
      spider: 'simple',
    });

    const result = await scraper.scrape('https://www.iana.org', {
      cache: false,
    });

    // Verify Link metadata structure
    const link = result.links[0];
    expect(link).toBeDefined();
    expect(typeof link.href).toBe('string');
    expect(typeof link.text).toBe('string');
    // Optional fields may be undefined
    if (link.title) expect(typeof link.title).toBe('string');
    if (link.ariaLabel) expect(typeof link.ariaLabel).toBe('string');
    if (link.rel) expect(typeof link.rel).toBe('string');
    if (link.target) expect(typeof link.target).toBe('string');
    if (link.classes) expect(Array.isArray(link.classes)).toBe(true);
  });

  it('should respect cache options', async () => {
    const scraper = await getScraper({
      scraper: 'basic',
      spider: 'simple',
      cacheDir: '.cache/scraper-test',
    });

    // First scrape - not cached
    const result1 = await scraper.scrape('https://example.com', {
      cache: true,
      cacheExpiry: 60000,
    });
    expect(result1).toBeDefined();

    // Second scrape - should be cached
    const result2 = await scraper.scrape('https://example.com', {
      cache: true,
      cacheExpiry: 60000,
    });
    expect(result2.content).toBe(result1.content);
  });
});

describe('TreeScraper', () => {
  it('should scrape a page with browser', async () => {
    const scraper = await getScraper({
      scraper: 'tree',
      headless: true,
      maxIterations: 3, // Keep low for tests
    });

    const result = await scraper.scrape('https://example.com', {
      cache: false,
    });

    // Verify ScrapeResult structure
    expect(result).toBeDefined();
    expect(result.url).toBeTruthy();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.links)).toBe(true);

    // Verify strategy information
    expect(result.strategy).toBeDefined();
    expect(result.strategy.type).toBe('tree');
    expect(result.strategy.spider).toBe('crawlee');
    expect(result.strategy.confidence).toBeGreaterThan(0);

    // Verify metrics
    expect(result.metrics).toBeDefined();
    expect(result.metrics.duration).toBeGreaterThan(0);
    expect(result.metrics.linkCount).toBe(result.links.length);
    expect(typeof result.metrics.interactionCount).toBe('number');
    expect(result.metrics.complete).toBe(true);
  }, 60000); // Longer timeout for browser operations

  it('should extract link metadata with browser', async () => {
    const scraper = await getScraper({
      scraper: 'tree',
      headless: true,
      maxIterations: 3,
    });

    const result = await scraper.scrape('https://example.com', {
      cache: false,
    });

    expect(result.links.length).toBeGreaterThan(0);

    // Verify Link metadata structure
    const link = result.links[0];
    expect(link).toBeDefined();
    expect(typeof link.href).toBe('string');
    expect(typeof link.text).toBe('string');
    // Optional fields may be undefined
    if (link.title) expect(typeof link.title).toBe('string');
    if (link.ariaLabel) expect(typeof link.ariaLabel).toBe('string');
    if (link.rel) expect(typeof link.rel).toBe('string');
    if (link.target) expect(typeof link.target).toBe('string');
    if (link.classes) expect(Array.isArray(link.classes)).toBe(true);
  }, 60000);

  it('should report interaction count', async () => {
    const scraper = await getScraper({
      scraper: 'tree',
      headless: true,
      maxIterations: 5,
    });

    const result = await scraper.scrape('https://example.com', {
      cache: false,
    });

    // example.com has no tree structure, so interaction count should be 0
    // This tests the "no tree structure found" case
    expect(result.metrics.interactionCount).toBe(0);
    expect(result.strategy.confidence).toBe(0.5); // Lower confidence when no tree structure
  }, 60000);
});
