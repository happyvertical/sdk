/**
 * Utility functions for translation operations
 */

/**
 * Common ISO 639-1 language codes and their names
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ro: 'Romanian',
  uk: 'Ukrainian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sk: 'Slovak',
  sl: 'Slovenian',
  lt: 'Lithuanian',
  lv: 'Latvian',
  et: 'Estonian',
  hu: 'Hungarian',
  ca: 'Catalan',
  gl: 'Galician',
  eu: 'Basque',
  fa: 'Persian',
  ur: 'Urdu',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  mr: 'Marathi',
  ml: 'Malayalam',
  kn: 'Kannada',
  gu: 'Gujarati',
  pa: 'Punjabi',
  sw: 'Swahili',
  ms: 'Malay',
  tl: 'Tagalog',
  af: 'Afrikaans',
  sq: 'Albanian',
  am: 'Amharic',
  hy: 'Armenian',
  az: 'Azerbaijani',
  be: 'Belarusian',
  bs: 'Bosnian',
  my: 'Burmese',
  ceb: 'Cebuano',
  ny: 'Chichewa',
  co: 'Corsican',
  eo: 'Esperanto',
  fy: 'Frisian',
  ka: 'Georgian',
  haw: 'Hawaiian',
  hmn: 'Hmong',
  is: 'Icelandic',
  ig: 'Igbo',
  ga: 'Irish',
  jw: 'Javanese',
  kk: 'Kazakh',
  km: 'Khmer',
  ku: 'Kurdish',
  ky: 'Kyrgyz',
  lo: 'Lao',
  la: 'Latin',
  lb: 'Luxembourgish',
  mk: 'Macedonian',
  mg: 'Malagasy',
  mt: 'Maltese',
  mi: 'Maori',
  mn: 'Mongolian',
  ne: 'Nepali',
  ps: 'Pashto',
  sm: 'Samoan',
  gd: 'Scots Gaelic',
  sr: 'Serbian',
  st: 'Sesotho',
  sn: 'Shona',
  sd: 'Sindhi',
  si: 'Sinhala',
  so: 'Somali',
  su: 'Sundanese',
  tg: 'Tajik',
  tt: 'Tatar',
  tk: 'Turkmen',
  ug: 'Uyghur',
  uz: 'Uzbek',
  cy: 'Welsh',
  xh: 'Xhosa',
  yi: 'Yiddish',
  yo: 'Yoruba',
  zu: 'Zulu',
};

/**
 * Validates an ISO 639-1 language code
 * @param code Language code to validate
 * @returns True if valid
 */
export function isValidLanguageCode(code: string): boolean {
  return code.length === 2 && /^[a-z]{2}$/.test(code);
}

/**
 * Gets the language name from a language code
 * @param code ISO 639-1 language code
 * @returns Language name or the code if not found
 */
export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] || code;
}

/**
 * Normalizes a confidence score to 0-1 range
 * @param score Confidence score (may be 0-1 or 0-100)
 * @returns Normalized score between 0 and 1
 */
export function normalizeConfidence(score: number): number {
  if (score > 1 && score <= 100) {
    return score / 100;
  }
  return Math.max(0, Math.min(1, score));
}

/**
 * Validates that text is not empty
 * @param text Text to validate
 * @returns True if text is valid
 */
export function isValidText(text: string): boolean {
  return typeof text === 'string' && text.trim().length > 0;
}

/**
 * Truncates text to a maximum length
 * @param text Text to truncate
 * @param maxLength Maximum length
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}
