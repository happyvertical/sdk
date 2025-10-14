class TranslationError extends Error {
  constructor(message, code, provider) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.name = "TranslationError";
  }
}
class UnsupportedLanguageError extends TranslationError {
  constructor(language, provider) {
    super(
      `Unsupported language: ${language}`,
      "UNSUPPORTED_LANGUAGE",
      provider
    );
    this.name = "UnsupportedLanguageError";
  }
}
class QuotaExceededError extends TranslationError {
  constructor(provider) {
    super("Translation quota exceeded", "QUOTA_EXCEEDED", provider);
    this.name = "QuotaExceededError";
  }
}
class AuthenticationError extends TranslationError {
  constructor(provider) {
    super("Authentication failed", "AUTH_ERROR", provider);
    this.name = "AuthenticationError";
  }
}
class InvalidTextError extends TranslationError {
  constructor(reason, provider) {
    super(`Invalid text: ${reason}`, "INVALID_TEXT", provider);
    this.name = "InvalidTextError";
  }
}
const LANGUAGE_NAMES = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ar: "Arabic",
  hi: "Hindi",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  cs: "Czech",
  el: "Greek",
  he: "Hebrew",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ro: "Romanian",
  uk: "Ukrainian",
  bg: "Bulgarian",
  hr: "Croatian",
  sk: "Slovak",
  sl: "Slovenian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
  hu: "Hungarian",
  ca: "Catalan",
  gl: "Galician",
  eu: "Basque",
  fa: "Persian",
  ur: "Urdu",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  ml: "Malayalam",
  kn: "Kannada",
  gu: "Gujarati",
  pa: "Punjabi",
  sw: "Swahili",
  ms: "Malay",
  tl: "Tagalog",
  af: "Afrikaans",
  sq: "Albanian",
  am: "Amharic",
  hy: "Armenian",
  az: "Azerbaijani",
  be: "Belarusian",
  bs: "Bosnian",
  my: "Burmese",
  ceb: "Cebuano",
  ny: "Chichewa",
  co: "Corsican",
  eo: "Esperanto",
  fy: "Frisian",
  ka: "Georgian",
  haw: "Hawaiian",
  hmn: "Hmong",
  is: "Icelandic",
  ig: "Igbo",
  ga: "Irish",
  jw: "Javanese",
  kk: "Kazakh",
  km: "Khmer",
  ku: "Kurdish",
  ky: "Kyrgyz",
  lo: "Lao",
  la: "Latin",
  lb: "Luxembourgish",
  mk: "Macedonian",
  mg: "Malagasy",
  mt: "Maltese",
  mi: "Maori",
  mn: "Mongolian",
  ne: "Nepali",
  ps: "Pashto",
  sm: "Samoan",
  gd: "Scots Gaelic",
  sr: "Serbian",
  st: "Sesotho",
  sn: "Shona",
  sd: "Sindhi",
  si: "Sinhala",
  so: "Somali",
  su: "Sundanese",
  tg: "Tajik",
  tt: "Tatar",
  tk: "Turkmen",
  ug: "Uyghur",
  uz: "Uzbek",
  cy: "Welsh",
  xh: "Xhosa",
  yi: "Yiddish",
  yo: "Yoruba",
  zu: "Zulu"
};
function isValidLanguageCode(code) {
  return code.length === 2 && /^[a-z]{2}$/.test(code);
}
function getLanguageName(code) {
  return LANGUAGE_NAMES[code] || code;
}
function normalizeConfidence(score) {
  if (score > 1 && score <= 100) {
    return score / 100;
  }
  return Math.max(0, Math.min(1, score));
}
function isValidText(text) {
  return typeof text === "string" && text.trim().length > 0;
}
function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + "...";
}
function isGoogleTranslateOptions(options) {
  return options.provider === "google";
}
function isDeepLOptions(options) {
  return options.provider === "deepl";
}
function isLibreTranslateOptions(options) {
  return options.provider === "libretranslate";
}
class TranslatorWrapper {
  constructor(provider) {
    this.provider = provider;
  }
  async translate(text, targetLanguage, sourceLanguage) {
    return this.provider.translate(text, targetLanguage, sourceLanguage);
  }
  async detectLanguage(text) {
    return this.provider.detectLanguage(text);
  }
  async getSupportedLanguages() {
    return this.provider.getSupportedLanguages();
  }
  async translateBatch(texts, targetLanguage, sourceLanguage) {
    return this.provider.translateBatch(texts, targetLanguage, sourceLanguage);
  }
  /**
   * Creates a pre-configured translation function
   * This is the key ergonomic feature that makes repeated translations simple
   */
  templateFunction(sourceLanguage, targetLanguage = "en") {
    return async (text) => {
      const result = await this.provider.translate(
        text,
        targetLanguage,
        sourceLanguage
      );
      return result.translatedText;
    };
  }
}
async function getTranslator(options) {
  let provider;
  if (isGoogleTranslateOptions(options)) {
    const { GoogleTranslateProvider } = await import("./chunks/google-B6Rg_2jZ.js");
    provider = new GoogleTranslateProvider(options);
  } else if (isDeepLOptions(options)) {
    const { DeepLProvider } = await import("./chunks/deepl-3hUFR70B.js");
    provider = new DeepLProvider(options);
  } else if (isLibreTranslateOptions(options)) {
    const { LibreTranslateProvider } = await import("./chunks/libretranslate-BeC38-0r.js");
    provider = new LibreTranslateProvider(options);
  } else {
    throw new Error(`Unsupported provider: ${options.provider}`);
  }
  return new TranslatorWrapper(provider);
}
export {
  AuthenticationError,
  InvalidTextError,
  LANGUAGE_NAMES,
  QuotaExceededError,
  TranslationError,
  UnsupportedLanguageError,
  getLanguageName,
  getTranslator,
  isValidLanguageCode,
  isValidText,
  normalizeConfidence,
  truncateText
};
//# sourceMappingURL=index.js.map
