import * as deepl from "deepl-node";
import { getCache } from "@have/cache";
import { InvalidTextError, AuthenticationError, QuotaExceededError, UnsupportedLanguageError, TranslationError } from "./index5.js";
import { isValidText } from "./index6.js";
class DeepLProvider {
  client;
  timeout;
  cache = null;
  constructor(options) {
    this.client = new deepl.Translator(options.apiKey, {
      serverUrl: options.freeApi ? "https://api-free.deepl.com" : void 0
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
        namespace: "translator:deepl",
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
      throw new InvalidTextError("Text cannot be empty", "deepl");
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
      const result = await this.client.translateText(
        text,
        sourceLanguage || null,
        targetLanguage
      );
      const translationResult = {
        translatedText: result.text,
        sourceText: text,
        sourceLanguage: result.detectedSourceLang.toLowerCase(),
        targetLanguage: targetLanguage.toLowerCase(),
        detectedSourceLanguage: !sourceLanguage,
        raw: result
      };
      if (this.cache) {
        await this.cache.set(cacheKey, translationResult);
      }
      return translationResult;
    } catch (error) {
      throw this.mapError(error);
    }
  }
  /**
   * Detects the language of the provided text
   * Note: DeepL doesn't have a dedicated language detection API,
   * so we translate to English and use the detected source language
   */
  async detectLanguage(text) {
    if (!isValidText(text)) {
      throw new InvalidTextError("Text cannot be empty", "deepl");
    }
    const cacheKey = this.getCacheKey("detect", text);
    if (this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    try {
      const result = await this.client.translateText(
        text,
        null,
        "en-US"
      );
      const detectionResult = {
        language: result.detectedSourceLang.toLowerCase(),
        confidence: 1,
        // DeepL doesn't provide confidence scores
        raw: result
      };
      if (this.cache) {
        await this.cache.set(cacheKey, detectionResult);
      }
      return detectionResult;
    } catch (error) {
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
      const [sourceLanguages, targetLanguages] = await Promise.all([
        this.client.getSourceLanguages(),
        this.client.getTargetLanguages()
      ]);
      const languageMap = /* @__PURE__ */ new Map();
      for (const lang of sourceLanguages) {
        languageMap.set(lang.code.toLowerCase(), {
          code: lang.code.toLowerCase(),
          name: lang.name
        });
      }
      for (const lang of targetLanguages) {
        const code = lang.code.toLowerCase();
        if (!languageMap.has(code)) {
          languageMap.set(code, {
            code,
            name: lang.name
          });
        }
      }
      const result = Array.from(languageMap.values());
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
      const results = await this.client.translateText(
        texts,
        sourceLanguage || null,
        targetLanguage
      );
      const resultsArray = Array.isArray(results) ? results : [results];
      return texts.map((text, index) => {
        const result = resultsArray[index];
        return {
          translatedText: result.text,
          sourceText: text,
          sourceLanguage: result.detectedSourceLang.toLowerCase(),
          targetLanguage: targetLanguage.toLowerCase(),
          detectedSourceLanguage: !sourceLanguage,
          raw: result
        };
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }
  /**
   * Maps DeepL errors to standardized error types
   */
  mapError(error) {
    if (error instanceof deepl.DeepLError) {
      if (error.message.includes("401") || error.message.includes("403")) {
        return new AuthenticationError("deepl");
      }
      if (error.message.includes("429") || error.message.includes("quota")) {
        return new QuotaExceededError("deepl");
      }
      if (error.message.includes("language") || error.message.includes("not supported")) {
        const match = error.message.match(/language[:\s]+([a-z-]+)/i);
        const language = match ? match[1] : "unknown";
        return new UnsupportedLanguageError(language, "deepl");
      }
      return new TranslationError(error.message, "DEEPL_ERROR", "deepl");
    }
    const err = error;
    return new TranslationError(
      err?.message || "Translation failed",
      err?.code || "UNKNOWN_ERROR",
      "deepl"
    );
  }
}
export {
  DeepLProvider
};
//# sourceMappingURL=index3.js.map
