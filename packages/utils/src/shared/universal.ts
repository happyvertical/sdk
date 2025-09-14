/**
 * Universal utilities that work in both browser and Node.js environments
 */

import { createId as cuid2CreateId, isCuid } from '@paralleldrive/cuid2';
import { format, parse, parseISO, isValid, add } from 'date-fns';
import pluralize from 'pluralize';
import { ParsingError, TimeoutError } from './types.js';

/**
 * Generates a unique identifier using CUID2 (preferred) or UUID fallback
 * @param type - ID type: 'cuid2' (default) or 'uuid'
 */
export const makeId = (type: 'cuid2' | 'uuid' = 'cuid2'): string => {
  if (type === 'cuid2') {
    return cuid2CreateId();
  }

  // UUID fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Manual UUID fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Generates a CUID2 identifier (collision-resistant, more secure than UUID)
 */
export const createId = cuid2CreateId;

/**
 * Checks if a string is a valid CUID2
 */
export { isCuid };

/**
 * Converts a string to a URL-friendly slug
 */
export const makeSlug = (str: string): string => {
  const from =
    'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìıİłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż+·/_,:;';
  const to =
    'aaaaaaaaaacccddeeeeeeeegghiiiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz--------------';
  const textToCompare = new RegExp(
    from.split('').join('|').replace(/\+/g, '\\+'),
    'g',
  );

  return str
    .toString()
    .toLowerCase()
    .replace('&', '-38-')
    .replace(/\s+/g, '-')
    .replace(textToCompare, (c) => to.charAt(from.indexOf(c)))
    .replace(/[&.]/g, '-')
    .replace(/[^\w-º+]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

/**
 * Extracts the filename from a URL's pathname
 */
export const urlFilename = (url: string): string => {
  const parsedUrl = new URL(url);
  const pathSegments = parsedUrl.pathname.split('/');
  const filename = pathSegments[pathSegments.length - 1];
  return filename || 'index.html';
};

/**
 * Converts a URL to a file path by joining hostname and pathname
 */
export const urlPath = (url: string): string => {
  const parsedUrl = new URL(url);
  const pathSegments = [parsedUrl.hostname, ...parsedUrl.pathname.split('/').filter(Boolean)];
  return pathSegments.join('/');
};

/**
 * Creates a Promise that resolves after a specified duration
 */
export const sleep = (duration: number): Promise<void> => {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, duration);
  });
};


/**
 * Repeatedly calls a function until it returns a defined value or times out
 */
export function waitFor(
  it: () => Promise<any>,
  { timeout = 0, delay = 1000 }: { timeout?: number; delay?: number } = {},
): Promise<any> {
  return new Promise((resolve, reject) => {
    const beginTime = Date.now();
    
    (async function waitATick() {
      try {
        const result = await it();
        if (typeof result !== 'undefined') {
          return resolve(result);
        }
        
        if (timeout > 0) {
          if (Date.now() > beginTime + timeout) {
            return reject(
              new TimeoutError('Function call timed out', {
                timeout,
                delay,
                elapsedTime: Date.now() - beginTime,
              }),
            );
          }
        }
        
        setTimeout(waitATick, delay);
      } catch (error) {
        reject(error);
      }
    })();
  });
}

/**
 * Type guard to check if a value is an array
 */
export const isArray = (obj: unknown): obj is unknown[] => {
  return Array.isArray(obj);
};

/**
 * Type guard to check if a value is a plain object
 */
export const isPlainObject = (obj: unknown): obj is Record<string, unknown> => {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
};

/**
 * Checks if a string is a valid URL
 */
export const isUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Converts a string to camelCase
 */
export const camelCase = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s(.)/g, (_, char) => char.toUpperCase())
    .replace(/\s/g, '')
    .replace(/^(.)/, (_, char) => char.toLowerCase());
};

/**
 * Converts a string to snake_case
 */
export const snakeCase = (str: string): string => {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[-\s]+/g, '_');
};

/**
 * Recursively converts all object keys to camelCase
 */
export const keysToCamel = (obj: unknown): unknown => {
  if (isPlainObject(obj)) {
    const n: Record<string, unknown> = {};
    Object.keys(obj).forEach(
      (k) => (n[camelCase(k)] = keysToCamel(obj[k])),
    );
    return n;
  } else if (isArray(obj)) {
    return obj.map((i) => keysToCamel(i));
  }
  return obj;
};

/**
 * Recursively converts all object keys to snake_case
 */
export const keysToSnake = (obj: unknown): unknown => {
  if (isPlainObject(obj)) {
    const n: Record<string, unknown> = {};
    Object.keys(obj).forEach(
      (k) => (n[snakeCase(k)] = keysToSnake(obj[k])),
    );
    return n;
  } else if (isArray(obj)) {
    return obj.map((i) => keysToSnake(i));
  }
  return obj;
};

/**
 * Converts a domain string to camelCase
 */
export const domainToCamel = (domain: string): string => camelCase(domain);

/**
 * Creates a visual progress indicator by cycling through a sequence of characters
 */
export const logTicker = (
  tick: string | null,
  options: { chars?: string[] } = {},
): string => {
  const { chars = ['.', '..', '...'] } = options;
  if (tick) {
    const index = chars.indexOf(tick);
    return index + 1 >= chars.length ? chars[0] : chars[index + 1];
  } else {
    return chars[0];
  }
};

/**
 * Parses an Amazon date string format (YYYYMMDDTHHMMSSZ) to a Date object
 */
export const parseAmazonDateString = (dateStr: string): Date => {
  const regex =
    /^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})([A-Z0-9]+)/;
  const match = dateStr.match(regex);
  if (!match) {
    throw new ParsingError('Could not parse Amazon date string', {
      dateString: dateStr,
      expectedFormat: 'YYYYMMDDTHHMMSSZ',
    });
  }
  
  const [matched, year, month, day, hour, minutes, seconds, timezone] = match;
  if (matched !== dateStr) {
    throw new ParsingError('Invalid Amazon date string format', {
      dateString: dateStr,
      matched,
      expectedFormat: 'YYYYMMDDTHHMMSSZ',
    });
  }

  const date = new Date(
    `${year}-${month}-${day}T${hour}:${minutes}:${seconds}${timezone}`,
  );
  return date;
};

/**
 * Extracts and parses a date from a string
 */
export const dateInString = (str: string): Date | null => {
  const cleanFilename =
    str.split('/').pop()?.replace('.pdf', '').toLowerCase() || '';

  const yearMatch = cleanFilename.match(/20\d{2}/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[0], 10);

  const monthPatterns = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
    april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
    august: 8, aug: 8, september: 9, sep: 9, october: 10, oct: 10,
    november: 11, nov: 11, december: 12, dec: 12,
  };

  let foundMonth: number | null = null;
  let monthStart = -1;
  let monthName = '';

  for (const [name, monthNum] of Object.entries(monthPatterns)) {
    const monthIndex = cleanFilename.indexOf(name);
    if (monthIndex !== -1) {
      foundMonth = monthNum;
      monthStart = monthIndex;
      monthName = name;
      break;
    }
  }

  if (!foundMonth) return null;

  const beforeMonth = cleanFilename.substring(
    Math.max(0, monthStart - 15),
    monthStart,
  );
  const afterMonth = cleanFilename.substring(
    monthStart + monthName.length,
    Math.min(cleanFilename.length, monthStart + monthName.length + 15),
  );

  const dayMatch =
    beforeMonth.match(/(\d{1,2})\s*$/) ||
    afterMonth.match(/^\s*(\d{1,2})/) ||
    afterMonth.match(/(\d{1,2})/);

  const day = dayMatch ? parseInt(dayMatch[1], 10) : null;
  if (!day) return null;

  const date = new Date(year, foundMonth - 1, day);
  return !isNaN(date.getTime()) ? date : null;
};

/**
 * Formats a date string into a human-readable format using the system locale
 */
export const prettyDate = (dateString: string): string => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
};

/**
 * String pluralization utilities using the pluralize library
 */
export const pluralizeWord = pluralize;
export const singularize = pluralize.singular;
export const isPlural = pluralize.isPlural;
export const isSingular = pluralize.isSingular;

/**
 * Enhanced date utilities using date-fns library
 */
export const formatDate = (date: Date | string, formatStr: string = 'yyyy-MM-dd'): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, formatStr);
};

export const parseDate = (dateStr: string, formatStr?: string): Date => {
  if (formatStr) {
    return parse(dateStr, formatStr, new Date());
  }
  return parseISO(dateStr);
};

export const isValidDate = isValid;
export const addInterval = add;