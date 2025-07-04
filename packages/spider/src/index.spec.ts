import { fetchPageSource, createWindow, processHtml } from './index.js';
import { it, expect } from 'vitest';

it('should fetch page source cheaply with caching', async () => {
  const result = (() => true)();
  expect(result).toBe(true);

  const source = await fetchPageSource({
    url: 'https://www.google.com',
    cheap: true,
  });

  const cached = await fetchPageSource({
    url: 'https://www.google.com',
    cheap: true,
  });

  expect(source).toBeDefined();
  expect(source).not.toBe('');
  expect(cached).toBe(source);
});

it('should fetch page source using DOM processing', async () => {
  const source = await fetchPageSource({
    url: 'https://www.google.com',
    cheap: false,
  });

  const cached = await fetchPageSource({
    url: 'https://www.google.com',
    cheap: false,
  });

  expect(cached).toBeDefined();
  expect(source).toBeDefined();
  expect(source).not.toBe('');
  expect(cached).toBe(source);
});

it('should create window instance', () => {
  const window = createWindow();
  expect(window).toBeDefined();
  expect(window.document).toBeDefined();
});

it('should process HTML correctly', async () => {
  const html = '<html><body><h1>Test</h1></body></html>';
  const processed = await processHtml(html);
  expect(processed).toContain('<h1>Test</h1>');
});
