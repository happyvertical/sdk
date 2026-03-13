const MEMORY_URL = ':memory:';

export function isMemoryLikeUrl(url?: string): boolean {
  return typeof url === 'string' && url.startsWith(MEMORY_URL);
}

export function isNamedMemoryUrl(url?: string): boolean {
  return isMemoryLikeUrl(url) && url !== MEMORY_URL;
}

export function getMemoryUrlId(url?: string): string | undefined {
  if (!isNamedMemoryUrl(url)) {
    return undefined;
  }

  const suffix = url!
    .slice(MEMORY_URL.length)
    .replace(/^[:/]+/, '')
    .trim();
  return suffix || undefined;
}

export function normalizeMemoryUrl(url?: string): string | undefined {
  if (!url) {
    return url;
  }

  return isMemoryLikeUrl(url) ? MEMORY_URL : url;
}
