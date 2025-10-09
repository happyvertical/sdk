/**
 * Utility functions for @have/notes package
 */

import { createHash } from 'node:crypto';

/**
 * Normalize URL for consistent key storage
 * Removes tracking params, sorts query string, lowercases, etc.
 *
 * @param url - The URL to normalize
 * @returns Normalized URL string
 */
export function normalizeUrl(url: string): string {
  const parsed = new URL(url);

  // Lowercase scheme and host
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();

  // Remove www prefix
  parsed.hostname = parsed.hostname.replace(/^www\./, '');

  // Remove default ports
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  // Remove fragment
  parsed.hash = '';

  // Sort and filter query params
  const params = new URLSearchParams(parsed.search);
  const filtered = new URLSearchParams();
  const trackingParams = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'fbclid',
    'gclid',
    'msclkid',
    '_ga',
    'mc_cid',
    'mc_eid',
  ];

  Array.from(params.keys())
    .sort()
    .forEach((key) => {
      if (!trackingParams.includes(key)) {
        filtered.set(key, params.get(key)!);
      }
    });

  parsed.search = filtered.toString();

  return parsed.toString();
}

/**
 * Generate hierarchical scope from URL for organized note storage
 *
 * @param url - The URL to generate scope from
 * @param baseScope - Base scope prefix (default: 'discovery/parser')
 * @returns Hierarchical scope string
 *
 * @example
 * generateScopeFromUrl('https://cityofboston.gov/meetings/minutes')
 * // Returns: 'discovery/parser/cityofboston.gov/meetings'
 */
export function generateScopeFromUrl(
  url: string,
  baseScope = 'discovery/parser',
): string {
  const parsed = new URL(normalizeUrl(url));
  const domain = parsed.hostname;
  const pathParts = parsed.pathname.split('/').filter((p) => p);

  // Use first path segment as page type (e.g., 'meetings', 'documents')
  const pageType = pathParts[0] || 'index';

  return `${baseScope}/${domain}/${pageType}`;
}

/**
 * Calculate time-based confidence decay
 *
 * @param confidence - Current confidence value (0-1)
 * @param lastUsed - Date of last use
 * @param decayRate - Rate of decay (default: 0.05)
 * @returns Decayed confidence value
 */
export function applyTimeDecay(
  confidence: number,
  lastUsed: Date,
  decayRate = 0.05,
): number {
  const daysSinceUse =
    (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
  const decay = Math.exp(-decayRate * daysSinceUse);
  return confidence * decay;
}

/**
 * Hash page content for change detection
 * Uses SHA-256 to create a unique fingerprint of the HTML
 *
 * @param html - Page HTML content
 * @returns SHA-256 hash as hex string
 */
export function hashPageContent(html: string): string {
  return createHash('sha256').update(html).digest('hex');
}

/**
 * Extract domain from URL for quick lookups
 *
 * @param url - The URL to extract domain from
 * @returns Domain string (without www prefix)
 */
export function extractDomain(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname.replace(/^www\./, '').toLowerCase();
}

/**
 * Build hierarchical scope path from parts
 *
 * @param parts - Scope path segments
 * @returns Joined scope path
 *
 * @example
 * buildScope('discovery', 'parser', 'example.com', 'api')
 * // Returns: 'discovery/parser/example.com/api'
 */
export function buildScope(...parts: string[]): string {
  return parts.filter((p) => p).join('/');
}

/**
 * Parse hierarchical scope into parts
 *
 * @param scope - Scope path string
 * @returns Array of scope segments
 *
 * @example
 * parseScope('discovery/parser/example.com/api')
 * // Returns: ['discovery', 'parser', 'example.com', 'api']
 */
export function parseScope(scope: string): string[] {
  return scope.split('/').filter((p) => p);
}

/**
 * Get parent scope from a hierarchical scope path
 *
 * @param scope - Current scope path
 * @returns Parent scope path or null if at root
 *
 * @example
 * getParentScope('discovery/parser/example.com/api')
 * // Returns: 'discovery/parser/example.com'
 */
export function getParentScope(scope: string): string | null {
  const parts = parseScope(scope);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('/');
}

/**
 * Check if one scope is an ancestor of another
 *
 * @param ancestorScope - Potential ancestor scope
 * @param descendantScope - Potential descendant scope
 * @returns True if ancestorScope is an ancestor of descendantScope
 *
 * @example
 * isAncestorScope('discovery/parser', 'discovery/parser/example.com/api')
 * // Returns: true
 */
export function isAncestorScope(
  ancestorScope: string,
  descendantScope: string,
): boolean {
  if (ancestorScope === descendantScope) return false;
  return descendantScope.startsWith(ancestorScope + '/');
}
