import { describe, expect, it } from 'vitest';
import { getHarvester } from '../shared/harvester-factory';

describe('Harvester Factory', () => {
  it('should create basic harvester', async () => {
    const harvester = await getHarvester({ harvester: 'basic' });
    expect(harvester).toBeDefined();
    expect(harvester.getType()).toBe('basic');
    expect(typeof harvester.harvest).toBe('function');
  });

  it('should create basic harvester with custom spider', async () => {
    const harvester = await getHarvester({
      harvester: 'basic',
      spider: 'dom',
    });
    expect(harvester).toBeDefined();
    expect(harvester.getType()).toBe('basic');
  });

  it('should create accordion harvester', async () => {
    const harvester = await getHarvester({ harvester: 'accordion' });
    expect(harvester).toBeDefined();
    expect(harvester.getType()).toBe('accordion');
    expect(typeof harvester.harvest).toBe('function');
  });

  it('should throw error for unsupported harvester', async () => {
    await expect(
      getHarvester({ harvester: 'invalid' } as any),
    ).rejects.toThrow('Unsupported harvester');
  });
});

describe('BasicHarvester', () => {
  it('should harvest a simple page', async () => {
    const harvester = await getHarvester({
      harvester: 'basic',
      spider: 'simple',
    });

    const result = await harvester.harvest('https://example.com', {
      cache: false,
    });

    // Verify HarvestResult structure
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
    const harvester = await getHarvester({
      harvester: 'basic',
      spider: 'dom',
    });

    const result = await harvester.harvest('https://example.com', {
      cache: false,
    });

    expect(result.strategy.spider).toBe('dom');
    expect(result.links.length).toBeGreaterThan(0);
  });

  it('should extract link metadata', async () => {
    const harvester = await getHarvester({
      harvester: 'basic',
      spider: 'simple',
    });

    const result = await harvester.harvest('https://www.iana.org', {
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
    const harvester = await getHarvester({
      harvester: 'basic',
      spider: 'simple',
      cacheDir: '.cache/harvester-test',
    });

    // First harvest - not cached
    const result1 = await harvester.harvest('https://example.com', {
      cache: true,
      cacheExpiry: 60000,
    });
    expect(result1).toBeDefined();

    // Second harvest - should be cached
    const result2 = await harvester.harvest('https://example.com', {
      cache: true,
      cacheExpiry: 60000,
    });
    expect(result2.content).toBe(result1.content);
  });
});

describe('AccordionHarvester', () => {
  it('should harvest a page with browser', async () => {
    const harvester = await getHarvester({
      harvester: 'accordion',
      headless: true,
      maxIterations: 3, // Keep low for tests
    });

    const result = await harvester.harvest('https://example.com', {
      cache: false,
    });

    // Verify HarvestResult structure
    expect(result).toBeDefined();
    expect(result.url).toBeTruthy();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.links)).toBe(true);

    // Verify strategy information
    expect(result.strategy).toBeDefined();
    expect(result.strategy.type).toBe('accordion');
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
    const harvester = await getHarvester({
      harvester: 'accordion',
      headless: true,
      maxIterations: 3,
    });

    const result = await harvester.harvest('https://example.com', {
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
    const harvester = await getHarvester({
      harvester: 'accordion',
      headless: true,
      maxIterations: 5,
    });

    const result = await harvester.harvest('https://example.com', {
      cache: false,
    });

    // example.com has no accordions, so interaction count should be 0
    // This tests the "no accordions found" case
    expect(result.metrics.interactionCount).toBe(0);
    expect(result.strategy.confidence).toBe(0.5); // Lower confidence when no accordions
  }, 60000);
});
