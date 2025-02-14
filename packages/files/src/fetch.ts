import { writeFile } from 'node:fs/promises';

// Rate limiter class implementation
class RateLimiter {
  private domains: Map<
    string,
    {
      lastRequest: number;
      limit: number;
      interval: number;
      queue: number;
    }
  > = new Map();

  private defaultLimit = 6;
  private defaultInterval = 500;

  constructor() {
    // Initialize with default settings
    this.domains.set('default', {
      lastRequest: 0,
      limit: this.defaultLimit,
      interval: this.defaultInterval,
      queue: 0,
    });
  }

  private getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'default';
    }
  }

  async waitForNext(url: string): Promise<void> {
    const domain = this.getDomain(url);
    const now = Date.now();

    const domainConfig =
      this.domains.get(domain) || this.domains.get('default')!;

    // Wait if we're over the limit
    if (domainConfig.queue >= domainConfig.limit) {
      const timeToWait = Math.max(
        0,
        domainConfig.lastRequest + domainConfig.interval - now,
      );
      if (timeToWait > 0) {
        await new Promise((resolve) => setTimeout(resolve, timeToWait));
      }
      domainConfig.queue = 0;
    }

    domainConfig.lastRequest = now;
    domainConfig.queue++;
  }

  setDomainLimit(domain: string, limit: number, interval: number) {
    this.domains.set(domain, {
      lastRequest: 0,
      limit,
      interval,
      queue: 0,
    });
  }

  getDomainLimit(domain: string) {
    return this.domains.get(domain) || this.domains.get('default')!;
  }
}

// Create singleton instance
const rateLimiter = new RateLimiter();

export async function addRateLimit(
  domain: string,
  limit: number,
  interval: number,
) {
  rateLimiter.setDomainLimit(domain, limit, interval);
}

export async function getRateLimit(
  domain: string,
): Promise<{ limit: number; interval: number }> {
  const config = rateLimiter.getDomainLimit(domain);
  return {
    limit: config.limit,
    interval: config.interval,
  };
}

async function rateLimitedFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  await rateLimiter.waitForNext(url);
  return fetch(url, options);
}

export async function fetchText(url: string): Promise<string> {
  const response = await rateLimitedFetch(url);
  return response.text();
}

export async function fetchJSON(url: string): Promise<any> {
  const response = await rateLimitedFetch(url);
  return response.json();
}

export async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await rateLimitedFetch(url);
  return Buffer.from(await response.arrayBuffer());
}

export async function fetchToFile(
  url: string,
  filepath: string,
): Promise<void> {
  const response = await rateLimitedFetch(url);
  const buffer = await response.arrayBuffer();
  await writeFile(filepath, Buffer.from(buffer));
}
