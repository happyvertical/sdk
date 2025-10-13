import { AuthenticationError, InvalidTextError, QuotaExceededError, TranslationError, UnsupportedLanguageError } from "./index5.js";
import { LANGUAGE_NAMES, getLanguageName, isValidLanguageCode, isValidText, normalizeConfidence, truncateText } from "./index6.js";
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
    const { GoogleTranslateProvider } = await import("./index2.js");
    provider = new GoogleTranslateProvider(options);
  } else if (isDeepLOptions(options)) {
    const { DeepLProvider } = await import("./index3.js");
    provider = new DeepLProvider(options);
  } else if (isLibreTranslateOptions(options)) {
    const { LibreTranslateProvider } = await import("./index4.js");
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
