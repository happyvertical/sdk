import { ValidationError } from '@happyvertical/utils';
import { describe, expect, it } from 'vitest';
import { getSpider } from './index';

describe('getSpider factory', () => {
  it('should create simple adapter', async () => {
    const spider = await getSpider({ adapter: 'simple' });
    expect(spider).toBeDefined();
    expect(typeof spider.fetch).toBe('function');
  });

  it('should create dom adapter', async () => {
    const spider = await getSpider({ adapter: 'dom' });
    expect(spider).toBeDefined();
    expect(typeof spider.fetch).toBe('function');
  });

  it.skip('should create crawlee adapter', async () => {
    const spider = await getSpider({ adapter: 'crawlee' });
    expect(spider).toBeDefined();
    expect(typeof spider.fetch).toBe('function');
  });

  it('should throw error for unsupported adapter', async () => {
    await expect(getSpider({ adapter: 'invalid' } as any)).rejects.toThrow(
      'Unsupported adapter',
    );
  });
});

describe('SimpleAdapter', () => {
  it('should fetch a page with links', async () => {
    const spider = await getSpider({ adapter: 'simple' });
    const page = await spider.fetch('https://example.com', { cache: false });

    expect(page).toBeDefined();
    expect(page.url).toBe('https://example.com');
    expect(page.content).toBeDefined();
    expect(typeof page.content).toBe('string');
    expect(Array.isArray(page.links)).toBe(true);
    expect(page.raw).toBeDefined();
    expect(page.raw.statusCode).toBe(200);
  });

  it('should cache fetched pages', async () => {
    const spider = await getSpider({
      adapter: 'simple',
      cacheDir: '.cache/spider-test',
    });

    // First fetch - not cached
    const page1 = await spider.fetch('https://example.com', {
      cache: true,
      cacheExpiry: 60000,
    });
    expect(page1).toBeDefined();

    // Second fetch - should be cached
    const page2 = await spider.fetch('https://example.com', {
      cache: true,
      cacheExpiry: 60000,
    });
    expect(page2).toBeDefined();
    expect(page2.content).toBe(page1.content);
  });

  it.skipIf(process.env.CI === 'true')(
    'should extract links correctly with metadata',
    async () => {
      const spider = await getSpider({ adapter: 'simple' });
      // Use a reliable, fast page with links (IANA - same org as example.com)
      const page = await spider.fetch('https://www.iana.org', {
        cache: false,
      });

      expect(Array.isArray(page.links)).toBe(true);
      expect(page.links.length).toBeGreaterThan(0);

      // Verify Link metadata structure
      const link = page.links[0];
      expect(link).toBeDefined();
      expect(typeof link.href).toBe('string');
      expect(typeof link.text).toBe('string');
      // Optional fields may be undefined
      if (link.title) expect(typeof link.title).toBe('string');
      if (link.ariaLabel) expect(typeof link.ariaLabel).toBe('string');
      if (link.rel) expect(typeof link.rel).toBe('string');
      if (link.target) expect(typeof link.target).toBe('string');
      if (link.classes) expect(Array.isArray(link.classes)).toBe(true);
    },
  );

  it('should throw ValidationError for invalid URL', async () => {
    const spider = await getSpider({ adapter: 'simple' });

    await expect(spider.fetch('')).rejects.toThrow(ValidationError);
    await expect(spider.fetch('not-a-url')).rejects.toThrow(ValidationError);
  });

  it('should handle custom headers and timeout', async () => {
    const spider = await getSpider({ adapter: 'simple' });
    const page = await spider.fetch('https://example.com', {
      headers: { 'X-Custom-Header': 'test' },
      timeout: 15000,
      cache: false,
    });

    expect(page).toBeDefined();
    expect(page.url).toBe('https://example.com');
  });

  it('should bypass cache when cache=false', async () => {
    const spider = await getSpider({ adapter: 'simple' });

    const page1 = await spider.fetch('https://example.com', {
      cache: false,
    });
    const page2 = await spider.fetch('https://example.com', {
      cache: false,
    });

    // Both should succeed but may differ in raw timestamps
    expect(page1).toBeDefined();
    expect(page2).toBeDefined();
  });
});

describe('DomAdapter', () => {
  it('should fetch and process a page', async () => {
    const spider = await getSpider({ adapter: 'dom' });
    const page = await spider.fetch('https://example.com', { cache: false });

    expect(page).toBeDefined();
    expect(page.url).toBe('https://example.com');
    expect(page.content).toBeDefined();
    expect(typeof page.content).toBe('string');
    expect(Array.isArray(page.links)).toBe(true);
    expect(page.raw).toBeDefined();
    expect(page.raw.statusCode).toBe(200);
    expect(page.raw.rawContent).toBeDefined(); // DOM adapter includes raw content
  });

  it('should process HTML with happy-dom', async () => {
    const spider = await getSpider({ adapter: 'dom' });
    const page = await spider.fetch('https://example.com', { cache: false });

    // Processed content should be valid HTML
    expect(page.content).toContain('<html');
    expect(page.content).toContain('</html>');
  });

  it('should cache processed pages', async () => {
    const spider = await getSpider({
      adapter: 'dom',
      cacheDir: '.cache/spider-test-dom',
    });

    const page1 = await spider.fetch('https://example.com', {
      cache: true,
      cacheExpiry: 60000,
    });
    const page2 = await spider.fetch('https://example.com', {
      cache: true,
      cacheExpiry: 60000,
    });

    expect(page2.content).toBe(page1.content);
  });

  it.skipIf(process.env.CI === 'true')(
    'should extract links from processed HTML with metadata',
    async () => {
      const spider = await getSpider({ adapter: 'dom' });
      // Use a reliable, fast page with links (IANA - same org as example.com)
      const page = await spider.fetch('https://www.iana.org', {
        cache: false,
      });

      expect(Array.isArray(page.links)).toBe(true);
      expect(page.links.length).toBeGreaterThan(0);

      // Verify Link metadata structure
      const link = page.links[0];
      expect(link).toBeDefined();
      expect(typeof link.href).toBe('string');
      expect(typeof link.text).toBe('string');
      // Optional fields may be undefined
      if (link.title) expect(typeof link.title).toBe('string');
      if (link.ariaLabel) expect(typeof link.ariaLabel).toBe('string');
      if (link.rel) expect(typeof link.rel).toBe('string');
      if (link.target) expect(typeof link.target).toBe('string');
      if (link.classes) expect(Array.isArray(link.classes)).toBe(true);
    },
  );

  it('should throw ValidationError for invalid URL', async () => {
    const spider = await getSpider({ adapter: 'dom' });

    await expect(spider.fetch('')).rejects.toThrow(ValidationError);
    await expect(spider.fetch('invalid-url')).rejects.toThrow(ValidationError);
  });
});

describe.skipIf(process.env.CI === 'true')('CrawleeAdapter', () => {
  it('should fetch a page with headless browser', async () => {
    const spider = await getSpider({
      adapter: 'crawlee',
      headless: true,
    });

    const page = await spider.fetch('https://example.com', { cache: false });

    expect(page).toBeDefined();
    expect(page.url).toBe('https://example.com/'); // Crawlee may add trailing slash
    expect(page.content).toBeDefined();
    expect(typeof page.content).toBe('string');
    expect(Array.isArray(page.links)).toBe(true);
    expect(page.raw).toBeDefined();
  }, 60000); // Longer timeout for browser operations

  it('should extract links with browser and metadata', async () => {
    const spider = await getSpider({ adapter: 'crawlee' });
    const page = await spider.fetch('https://example.com', { cache: false });

    expect(Array.isArray(page.links)).toBe(true);
    expect(page.links.length).toBeGreaterThan(0);

    // Verify Link metadata structure
    const link = page.links[0];
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

  it('should cache browser-fetched pages', async () => {
    const spider = await getSpider({
      adapter: 'crawlee',
      cacheDir: '.cache/spider-test-crawlee',
    });

    const page1 = await spider.fetch('https://example.com', {
      cache: true,
      cacheExpiry: 60000,
    });
    const page2 = await spider.fetch('https://example.com', {
      cache: true,
      cacheExpiry: 60000,
    });

    expect(page2.content).toBe(page1.content);
  }, 60000);

  it('should handle custom user agent', async () => {
    const spider = await getSpider({
      adapter: 'crawlee',
      userAgent: 'TestBot/1.0',
    });

    const page = await spider.fetch('https://example.com', { cache: false });
    expect(page).toBeDefined();
  }, 60000);

  it('should throw ValidationError for invalid URL', async () => {
    const spider = await getSpider({ adapter: 'crawlee' });

    await expect(spider.fetch('')).rejects.toThrow(ValidationError);
    await expect(spider.fetch('not-valid')).rejects.toThrow(ValidationError);
  });
});
