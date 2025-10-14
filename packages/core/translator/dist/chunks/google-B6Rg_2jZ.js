import { v2 } from "@google-cloud/translate";
import { getCache } from "@have/cache";
import { isValidText, InvalidTextError, TranslationError, normalizeConfidence, getLanguageName, AuthenticationError, QuotaExceededError, UnsupportedLanguageError } from "../index.js";
const { Translate } = v2;
class GoogleTranslateProvider {
  client;
  timeout;
  cache = null;
  constructor(options) {
    this.client = new Translate({
      key: options.apiKey,
      projectId: options.projectId
    });
    this.timeout = options.timeout || 3e4;
    this.initCache();
  }
  /**
   * Initializes the memory cache for translation results
   */
  async initCache() {
    try {
      this.cache = await getCache({
        provider: "memory",
        namespace: "translator:google",
        defaultTTL: 3600,
        // 1 hour cache
        maxSize: 10 * 1024 * 1024,
        // 10MB
        maxEntries: 1e3,
        evictionPolicy: "lru"
      });
    } catch (error) {
      console.warn("Failed to initialize translation cache:", error);
    }
  }
  /**
   * Generates a cache key for translation requests
   */
  getCacheKey(type, ...parts) {
    return `${type}:${parts.join(":")}`;
  }
  /**
   * Translates text from source language to target language
   */
  async translate(text, targetLanguage, sourceLanguage) {
    if (!isValidText(text)) {
      throw new InvalidTextError("Text cannot be empty", "google");
    }
    const cacheKey = this.getCacheKey(
      "translate",
      text,
      sourceLanguage || "auto",
      targetLanguage
    );
    if (this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    try {
      const [translation] = await this.client.translate(text, {
        from: sourceLanguage,
        to: targetLanguage
      });
      const detectedSourceLanguage = !sourceLanguage;
      let actualSourceLanguage = sourceLanguage;
      if (!actualSourceLanguage) {
        const [detection] = await this.client.detect(text);
        actualSourceLanguage = Array.isArray(detection) ? detection[0].language : detection.language;
      }
      const result = {
        translatedText: translation,
        sourceText: text,
        sourceLanguage: actualSourceLanguage || "unknown",
        targetLanguage,
        detectedSourceLanguage,
        raw: translation
      };
      if (this.cache) {
        await this.cache.set(cacheKey, result);
      }
      return result;
    } catch (error) {
      throw this.mapError(error);
    }
  }
  /**
   * Detects the language of the provided text
   */
  async detectLanguage(text) {
    if (!isValidText(text)) {
      throw new InvalidTextError("Text cannot be empty", "google");
    }
    const cacheKey = this.getCacheKey("detect", text);
    if (this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    try {
      const [detections] = await this.client.detect(text);
      const detectionsArray = Array.isArray(detections) ? detections : [detections];
      if (detectionsArray.length === 0) {
        throw new TranslationError(
          "No language detected",
          "NO_DETECTION",
          "google"
        );
      }
      const primary = detectionsArray[0];
      const result = {
        language: primary.language,
        confidence: normalizeConfidence(primary.confidence || 0),
        alternatives: detectionsArray.slice(1).map((d) => ({
          language: d.language,
          confidence: normalizeConfidence(d.confidence || 0)
        })),
        raw: detections
      };
      if (this.cache) {
        await this.cache.set(cacheKey, result);
      }
      return result;
    } catch (error) {
      if (error instanceof TranslationError) {
        throw error;
      }
      throw this.mapError(error);
    }
  }
  /**
   * Gets the list of languages supported by this provider
   */
  async getSupportedLanguages() {
    const cacheKey = this.getCacheKey("languages");
    if (this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    try {
      const [languages] = await this.client.getLanguages();
      const result = languages.map((lang) => ({
        code: lang.code,
        name: lang.name || getLanguageName(lang.code)
      }));
      if (this.cache) {
        await this.cache.set(cacheKey, result, 86400);
      }
      return result;
    } catch (error) {
      throw this.mapError(error);
    }
  }
  /**
   * Translates multiple texts in a single batch operation
   */
  async translateBatch(texts, targetLanguage, sourceLanguage) {
    if (texts.length === 0) {
      return [];
    }
    try {
      const [translations] = await this.client.translate(texts, {
        from: sourceLanguage,
        to: targetLanguage
      });
      const translationsArray = Array.isArray(translations) ? translations : [translations];
      const detectedSourceLanguage = !sourceLanguage;
      let actualSourceLanguage = sourceLanguage;
      if (!actualSourceLanguage && texts.length > 0) {
        const [detection] = await this.client.detect(texts[0]);
        actualSourceLanguage = Array.isArray(detection) ? detection[0].language : detection.language;
      }
      return texts.map((text, index) => ({
        translatedText: translationsArray[index] || text,
        sourceText: text,
        sourceLanguage: actualSourceLanguage || "unknown",
        targetLanguage,
        detectedSourceLanguage,
        raw: translationsArray[index]
      }));
    } catch (error) {
      throw this.mapError(error);
    }
  }
  /**
   * Maps Google Translate errors to standardized error types
   */
  mapError(error) {
    const err = error;
    if (err.code === 403 || err.code === 401) {
      return new AuthenticationError("google");
    }
    if (err.code === 429) {
      return new QuotaExceededError("google");
    }
    if (err.code === 400 && err.message?.includes("language")) {
      const match = err.message.match(/language[:\s]+([a-z-]+)/i);
      const language = match ? match[1] : "unknown";
      return new UnsupportedLanguageError(language, "google");
    }
    return new TranslationError(
      err.message || "Translation failed",
      err.code || "UNKNOWN_ERROR",
      "google"
    );
  }
}
export {
  GoogleTranslateProvider
};
//# sourceMappingURL=google-B6Rg_2jZ.js.map
