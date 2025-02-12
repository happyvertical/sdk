import { fetchPageSource, getBrowser } from './index';
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

it('should fetch page source using playwright', async () => {
  const result = (() => true)();
  expect(result).toBe(true);
  const browser = await getBrowser();

  const source = await fetchPageSource({
    url: 'https://www.google.com',
    cheap: false,
    browser,
  });

  const cached = await fetchPageSource({
    url: 'https://www.google.com',
    cheap: false,
    browser,
  });

  expect(cached).toBeDefined();
  expect(source).toBeDefined();
  expect(source).not.toBe('');
  expect(cached).toBe(source);
});
