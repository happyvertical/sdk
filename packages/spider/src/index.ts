import { tmpdir } from 'os';
import path from 'path';
import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';
import { urlFilename, urlPath } from '@have/utils';
import * as cheerio from 'cheerio';

import { fetchText, getCached, setCached } from '@have/files';

interface FetchPageSourceOptions {
  url: string;
  cheap: boolean;
  browser?: Browser; // if not supplied, we'll use a cheap fetch
  cache?: boolean;
  cacheExpiry?: number;
}

export async function fetchPageSource(
  options: FetchPageSourceOptions,
): Promise<string> {
  const { url, cheap = true, browser, cacheExpiry = 300000 } = options;

  if (cheap || !browser) {
    const cachedFile = path.join(urlPath(url), '.cheap', urlFilename(url));
    const cached = await getCached(cachedFile, cacheExpiry);
    if (cached) {
      console.log(`[${url}] using cached file`);
      return cached;
    }

    // const response = await fetch(url);
    // const content = await response.text();

    const content = await fetchText(url);

    await setCached(cachedFile, content);
    return content;
  }

  const cachedFile = path.join(urlPath(url), urlFilename(url));
  const cached = await getCached(cachedFile, cacheExpiry);
  if (cached) {
    return cached;
  }

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const content = await page.content();
  await page.close();
  await setCached(cachedFile, content);
  return content;
}

export async function parseIndexSource(indexSource: string): Promise<string[]> {
  const $ = cheerio.load(indexSource);

  const items: string[] = [];
  let content: string = '';

  // Check if it's an index page by looking for multiple items
  if ($('a').length > 1) {
    $('a').each((_, element) => {
      const item = $(element).attr('href');
      // console.log({ item });
      if (item) items.push(item);
    });
  } else {
    // Assume it's a content page if not an index
    content = $('body').text().trim();
  }
  return items;
}

export async function getBrowser(): Promise<Browser> {
  const browser = await chromium.launch({
    headless: true,
  });
  return browser;
}

export default {
  fetchPageSource,
  parseIndexSource,
  getBrowser,
};
