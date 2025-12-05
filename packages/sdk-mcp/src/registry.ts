import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const Filename = fileURLToPath(import.meta.url);
const Dirname = dirname(Filename);

/**
 * Package metadata extracted from CLAUDE.md files
 */
export interface PackageMetadata {
  name: string;
  path: string;
  description: string;
  claudeMd: string;
  keywords: string[];
}

/**
 * Keyword mapping for routing queries to packages
 * Based on issue #237 specification
 */
export const PACKAGE_KEYWORDS: Record<string, string[]> = {
  ai: [
    'ai',
    'llm',
    'gpt',
    'claude',
    'openai',
    'anthropic',
    'model',
    'completion',
    'chat',
    'embedding',
    'gemini',
    'bedrock',
    'huggingface',
  ],
  sql: [
    'database',
    'sql',
    'sqlite',
    'postgres',
    'duckdb',
    'query',
    'table',
    'schema',
    'json',
  ],
  files: [
    'file',
    'filesystem',
    'read',
    'write',
    'download',
    'upload',
    'path',
    'storage',
  ],
  spider: [
    'crawl',
    'scrape',
    'web',
    'html',
    'website',
    'page',
    'link',
    'civicweb',
  ],
  pdf: ['pdf', 'document', 'extract', 'parse', 'acrobat'],
  ocr: ['ocr', 'image', 'text extraction', 'tesseract', 'vision'],
  geo: ['location', 'map', 'coordinates', 'geocode', 'address', 'gis'],
  translator: ['translate', 'language', 'translation', 'localization'],
  weather: [
    'weather',
    'forecast',
    'temperature',
    'precipitation',
    'conditions',
    'wind',
    'humidity',
    'openweathermap',
    'environment canada',
  ],
  utils: ['id', 'uuid', 'slug', 'date', 'format', 'utility', 'helper'],
  cache: ['cache', 'caching', 'redis', 'memory', 'store'],
  logger: ['log', 'logging', 'logger', 'debug', 'error'],
  documents: ['document processing', 'content extraction', 'analysis'],
  email: [
    'email',
    'mail',
    'smtp',
    'imap',
    'pop3',
    'gmail',
    'mailbox',
    'send',
    'receive',
    'inbox',
    'folder',
  ],
  'github-actions': [
    'github',
    'actions',
    'workflow',
    'ci',
    'cd',
    'automation',
    'issue',
    'pr',
    'pull request',
    'triage',
  ],
};

/**
 * Cache for loaded CLAUDE.md files
 */
const packageCache = new Map<string, PackageMetadata>();

/**
 * Get the root SDK directory
 */
function getSDKRoot(): string {
  // From packages/sdk-mcp/src/registry.ts -> ../../.. to get to SDK root
  return join(Dirname, '..', '..', '..');
}

/**
 * Extract description from CLAUDE.md content
 * Looks for "Purpose and Responsibilities" or first paragraph
 */
function extractDescription(content: string): string {
  // Try to find Purpose and Responsibilities section
  const purposeMatch = content.match(
    /##\s+Purpose and Responsibilities\s+([^\n]+(?:\n(?!##)[^\n]+)*)/i,
  );
  if (purposeMatch) {
    // Get first sentence or first 200 chars
    const purpose = purposeMatch[1]
      .trim()
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ');
    const firstSentence = purpose.match(/^[^.!?]+[.!?]/);
    if (firstSentence) {
      return firstSentence[0].trim();
    }
    return `${purpose.substring(0, 200).trim()}...`;
  }

  // Fallback: get first paragraph after title
  const lines = content.split('\n');
  let foundTitle = false;
  for (const line of lines) {
    if (line.startsWith('# ') || line.startsWith('## ')) {
      foundTitle = true;
      continue;
    }
    if (foundTitle && line.trim().length > 0 && !line.startsWith('#')) {
      return line.trim();
    }
  }

  return 'No description available';
}

/**
 * Scan packages directory for CLAUDE.md files and build registry
 */
export async function buildPackageRegistry(): Promise<
  Map<string, PackageMetadata>
> {
  if (packageCache.size > 0) {
    return packageCache;
  }

  const sdkRoot = getSDKRoot();
  const packagesDir = join(sdkRoot, 'packages');

  try {
    const entries = await readdir(packagesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const packageName = entry.name;
      const claudeMdPath = join(packagesDir, packageName, 'CLAUDE.md');

      try {
        const claudeMd = await readFile(claudeMdPath, 'utf-8');
        const description = extractDescription(claudeMd);
        const keywords = PACKAGE_KEYWORDS[packageName] || [];

        packageCache.set(packageName, {
          name: packageName,
          path: join(packagesDir, packageName),
          description,
          claudeMd,
          keywords,
        });
      } catch (_error) {}
    }

    return packageCache;
  } catch (error) {
    throw new Error(
      `Failed to build package registry: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get package metadata by name
 */
export async function getPackage(
  name: string,
): Promise<PackageMetadata | undefined> {
  const registry = await buildPackageRegistry();
  return registry.get(name);
}

/**
 * Get all packages
 */
export async function getAllPackages(): Promise<PackageMetadata[]> {
  const registry = await buildPackageRegistry();
  return Array.from(registry.values());
}

/**
 * Get package CLAUDE.md content
 */
export async function getPackageDocs(
  name: string,
): Promise<string | undefined> {
  const pkg = await getPackage(name);
  return pkg?.claudeMd;
}

/**
 * Clear the package cache (for testing)
 */
export function clearCache(): void {
  packageCache.clear();
}
