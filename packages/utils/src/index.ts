import { tmpdir } from 'os';
import path from 'path';
import { URL } from 'url';

import { v4 as uuidv4 } from 'uuid';

/**
 * Default temporary directory for SDK tests
 */
export const TMP_DIR = path.resolve(`${tmpdir()}/.have-sdk/tests`);

/**
 * Converts a URL to a file path by joining hostname and pathname
 * 
 * @param url - The URL to convert to a path
 * @returns The path representation of the URL (hostname/pathname)
 */
export const urlPath = (url: string) => {
  const parsedUrl = new URL(url);
  return path.join(parsedUrl.hostname, parsedUrl.pathname);
};

/**
 * Extracts the filename from a URL's pathname
 * 
 * @param url - The URL to extract filename from
 * @returns The filename from the URL or 'index.html' if no filename found
 */
export const urlFilename = (url: string) => {
  const parsedUrl = new URL(url);
  const filename = path.basename(parsedUrl.pathname);
  return filename || 'index.html';
};

/**
 * Generates a unique UUID v4 identifier
 * 
 * @returns A UUID v4 string
 */
export const makeId = () => {
  return uuidv4();
};

/**
 * Converts a string to a URL-friendly slug
 * 
 * @param str - The string to convert to a slug
 * @returns A lowercase, hyphenated slug with special characters removed
 */
export const makeSlug = (str: string) => {
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
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(textToCompare, (c) => to.charAt(from.indexOf(c))) // Replace special characters
    .replace(/[&.]/g, '-') // Replace DOT with -
    .replace(/[^\w-º+]+/g, '') // Remove all non-word characters, except for º, + and -
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
};

/**
 * Gets current time in milliseconds using high-resolution timer
 * 
 * @returns Current time in milliseconds
 */
export const timeNow = () => {
  const time = process.hrtime();
  return Math.round(time[0] * 1e3 + time[1] / 1e6);
};

/**
 * Repeatedly calls a function until it returns a defined value or times out
 * 
 * @param it - Function to call repeatedly that returns a Promise
 * @param options - Configuration options
 * @param options.timeout - Maximum time to wait in milliseconds (0 = no timeout)
 * @param options.delay - Delay between attempts in milliseconds
 * @returns Promise that resolves with the first defined result or rejects on timeout
 */
export function waitFor(
  it: () => Promise<any>,
  { timeout = 0, delay = 1000 }: { timeout?: number; delay?: number },
) {
  return new Promise((resolve, reject) => {
    const beginTime = timeNow();
    (async function waitATick() {
      const result = await it();
      if (typeof result !== 'undefined') {
        return resolve(result);
      }
      if (timeout > 0) {
        if (timeNow() > beginTime + timeout) {
          return reject('Timed out');
        }
      }
      setTimeout(waitATick, delay);
    })();
  });
}

/**
 * Creates a Promise that resolves after a specified duration
 * 
 * @param duration - Time to sleep in milliseconds
 * @returns Promise that resolves after the specified duration
 */
export const sleep = (duration: number) => {
  return new Promise<void>((resolve) => {
    console.log(`sleeping for ${duration}ms`);
    setTimeout(resolve, duration);
  });
};

/**
 * Type guard to check if a value is an array
 * 
 * @param obj - Value to check
 * @returns True if the value is an array, false otherwise
 */
export const isArray = (obj: unknown): obj is unknown[] => {
  return Array.isArray(obj);
};

/**
 * Recursively converts all object keys to camelCase
 * 
 * @param obj - Object to convert
 * @returns Object with all keys converted to camelCase
 */
export const keysToCamel = (obj: unknown): unknown => {
  if (isPlainObject(obj)) {
    const n: Record<string, unknown> = {};
    Object.keys(obj as Record<string, unknown>).forEach(
      (k) =>
        (n[camelCase(k)] = keysToCamel((obj as Record<string, unknown>)[k])),
    );
    return n;
  } else if (isArray(obj)) {
    return (obj as unknown[]).map((i) => keysToCamel(i));
  }
  return obj;
};

/**
 * Converts a domain string to camelCase
 * 
 * @param domain - Domain string to convert
 * @returns camelCase version of the domain string
 */
export const domainToCamel = (domain: string): string => camelCase(domain);

/**
 * Recursively converts all object keys to snake_case
 * 
 * @param obj - Object to convert
 * @returns Object with all keys converted to snake_case
 */
export const keysToSnake = (obj: unknown): unknown => {
  if (isPlainObject(obj)) {
    const n: Record<string, unknown> = {};
    Object.keys(obj as Record<string, unknown>).forEach(
      (k) =>
        (n[snakeCase(k)] = keysToSnake((obj as Record<string, unknown>)[k])),
    );
    return n;
  } else if (isArray(obj)) {
    return (obj as unknown[]).map((i) => keysToSnake(i));
  }
  return obj;
};

/**
 * Parses an Amazon date string format (YYYYMMDDTHHMMSSZ) to a Date object
 * 
 * @param dateStr - Amazon format date string (YYYYMMDDTHHMMSSZ)
 * @returns Parsed Date object
 * @throws Error if the date string format is invalid
 */
export const parseAmazonDateString = (dateStr: string): Date => {
  const regex =
    /^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})([A-Z0-9]+)/;
  const match = dateStr.match(regex);
  if (!match) {
    throw new Error('Couldnt parse date');
  }
  const [matched, year, month, day, hour, minutes, seconds, timezone] = match;
  if (matched !== dateStr) {
    throw new Error('Couldnt parse date');
  }

  const date = new Date(
    `${year}-${month}-${day}T${hour}:${minutes}:${seconds}${timezone}`,
  );
  return date;
};

/**
 * Creates a visual progress indicator by cycling through a sequence of characters
 * 
 * @param tick - Current tick state or null to initialize
 * @param options - Configuration options
 * @param options.chars - Array of characters to cycle through
 * @returns The next character in the sequence
 */
export const logTicker = (
  tick: string | null,
  options: { chars?: string[] } = {},
) => {
  const { chars = ['.', '..', '...'] } = options;
  if (tick) {
    const index = chars.indexOf(tick);
    return index + 1 >= chars.length ? chars[0] : chars[index + 1];
  } else {
    return chars[0];
  }
};

// export function addInterval(dateStr: string, interval: string): string {
//   // For dates without time, assume start of day in UTC
//   let date = dateFns.parse(dateStr, 'yyyy-MM-dd', new Date());
//   if (!dateFns.isValid(date)) {
//     date = dateFns.parseISO(dateStr);
//     if (!dateFns.isValid(date)) {
//       throw new Error('Invalid date string provided');
//     }
//   }

//   // split interval into value and unit
//   let [value, unit] = interval.split(' ');

//   // use pluralize to convert the unit to singular form
//   unit = pluralize.singular(unit);

//   // create an object for the add function with proper typing
//   const addOptions: dateFns.Duration = {};
//   const unitValue = Number(value);

//   switch (unit) {
//     case 'year':
//       addOptions.years = unitValue;
//       break;
//     case 'month':
//       addOptions.months = unitValue;
//       break;
//     case 'week':
//       addOptions.weeks = unitValue;
//       break;
//     case 'day':
//       addOptions.days = unitValue;
//       break;
//     case 'hour':
//       addOptions.hours = unitValue;
//       break;
//     case 'minute':
//       addOptions.minutes = unitValue;
//       break;
//     case 'second':
//       addOptions.seconds = unitValue;
//       break;
//     default:
//       throw new Error(`Unsupported time unit: ${unit}`);
//   }

//   const calculatedDate = dateFns.add(date, addOptions);
//   return dateFns.format(calculatedDate, 'yyyy-MM-dd HH:mm:ss');
// }

/**
 * Checks if a string is a valid URL
 * 
 * @param url - String to check
 * @returns True if the string is a valid URL, false otherwise
 */
export const isUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Type guard to check if a value is a plain object
 * 
 * @param obj - Value to check
 * @returns True if the value is a plain object, false otherwise
 */
export const isPlainObject = (obj: unknown): obj is Record<string, unknown> => {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
};

/**
 * Converts a string to camelCase
 * 
 * @param str - String to convert
 * @returns camelCase version of the string
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
 * 
 * @param str - String to convert
 * @returns snake_case version of the string
 */
export const snakeCase = (str: string): string => {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[-\s]+/g, '_');
};

/**
 * Extracts and parses a date from a string
 * 
 * @param str - The string to parse (typically a filename)
 * @returns Date object if found, null otherwise
 */
export const dateInString = (str: string): Date | null => {
  // Get just the str without extension and path
  const cleanFilename =
    str.split('/').pop()?.replace('.pdf', '').toLowerCase() || '';

  const yearMatch = cleanFilename.match(/20\d{2}/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[0], 10);
  const yearIndex = cleanFilename.indexOf(yearMatch[0]);

  const monthPatterns = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };

  // Find month and its position
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

  // Look for a day number before or after the month
  const beforeMonth = cleanFilename.substring(
    Math.max(0, monthStart - 15),
    monthStart,
  );
  const afterMonth = cleanFilename.substring(
    monthStart + monthName.length,
    Math.min(cleanFilename.length, monthStart + monthName.length + 15),
  );

  const dayMatch =
    beforeMonth.match(/(\d{1,2})\s*$/) || // number at the end before month
    afterMonth.match(/^\s*(\d{1,2})/) || // number at the start after month
    afterMonth.match(/(\d{1,2})/); // any number after month

  const day = dayMatch ? parseInt(dayMatch[1], 10) : null;
  if (!day) return null;

  // Construct and validate date
  const date = new Date(year, foundMonth - 1, day);
  return !isNaN(date.getTime()) ? date : null;
};

/**
 * Formats a date string into a human-readable format using the system locale
 * 
 * @param dateString - Date string to format
 * @returns Formatted date string (e.g., "January 1, 2023")
 */
export const prettyDate = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
};