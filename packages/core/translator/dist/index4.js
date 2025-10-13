import { InvalidTextError, TranslationError, AuthenticationError, UnsupportedLanguageError } from "./index5.js";
import { isValidText, getLanguageName } from "./index6.js";
class LibreTranslateProvider {
  baseUrl;
  apiKey;
  timeout;
  constructor(options) {
    this.baseUrl = options.apiUrl || "https://libretranslate.com";
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 3e4;
  }
  /**
   * Translates text from source language to target language
   */
  async translate(text, targetLanguage, sourceLanguage) {
    if (!isValidText(text)) {
      throw new InvalidTextError("Text cannot be empty", "libretranslate");
    }
    try {
      const body = {
        q: text,
        target: targetLanguage,
        format: "text"
      };
      if (sourceLanguage) {
        body.source = sourceLanguage;
      } else {
        body.source = "auto";
      }
      if (this.apiKey) {
        body.api_key = this.apiKey;
      }
      const response = await this.fetchLibreTranslate("/translate", body);
      const data = response;
      return {
        translatedText: data.translatedText,
        sourceText: text,
        sourceLanguage: data.detectedLanguage?.language || sourceLanguage || "unknown",
        targetLanguage,
        confidence: data.detectedLanguage?.confidence,
        detectedSourceLanguage: !sourceLanguage,
        raw: data
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }
  /**
   * Detects the language of the provided text
   */
  async detectLanguage(text) {
    if (!isValidText(text)) {
      throw new InvalidTextError("Text cannot be empty", "libretranslate");
    }
    try {
      const body = {
        q: text
      };
      if (this.apiKey) {
        body.api_key = this.apiKey;
      }
      const response = await this.fetchLibreTranslate("/detect", body);
      if (Array.isArray(response)) {
        const detections = response;
        if (detections.length === 0) {
          throw new TranslationError(
            "No language detected",
            "NO_DETECTION",
            "libretranslate"
          );
        }
        return {
          language: detections[0].language,
          confidence: detections[0].confidence,
          alternatives: detections.slice(1).map((d) => ({
            language: d.language,
            confidence: d.confidence
          })),
          raw: response
        };
      }
      throw new TranslationError(
        "Invalid detection response",
        "INVALID_RESPONSE",
        "libretranslate"
      );
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
    try {
      const response = await this.fetchLibreTranslate(
        "/languages",
        void 0,
        "GET"
      );
      if (Array.isArray(response)) {
        const languages = response;
        return languages.map((lang) => ({
          code: lang.code,
          name: lang.name || getLanguageName(lang.code)
        }));
      }
      throw new TranslationError(
        "Invalid languages response",
        "INVALID_RESPONSE",
        "libretranslate"
      );
    } catch (error) {
      if (error instanceof TranslationError) {
        throw error;
      }
      throw this.mapError(error);
    }
  }
  /**
   * Translates multiple texts in a single batch operation
   * Note: LibreTranslate doesn't have native batch support,
   * so we translate texts sequentially
   */
  async translateBatch(texts, targetLanguage, sourceLanguage) {
    if (texts.length === 0) {
      return [];
    }
    const results = [];
    for (const text of texts) {
      const result = await this.translate(text, targetLanguage, sourceLanguage);
      results.push(result);
    }
    return results;
  }
  /**
   * Makes an HTTP request to LibreTranslate API
   */
  async fetchLibreTranslate(endpoint, body, method = "POST") {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const options = {
        method,
        signal: controller.signal
      };
      if (method === "POST" && body) {
        options.headers = {
          "Content-Type": "application/json"
        };
        options.body = JSON.stringify(body);
      }
      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError("libretranslate");
        }
        if (response.status === 400) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.error?.includes("language")) {
            throw new UnsupportedLanguageError(
              body.source || body.target || "unknown",
              "libretranslate"
            );
          }
        }
        throw new TranslationError(
          `HTTP ${response.status}: ${response.statusText}`,
          "HTTP_ERROR",
          "libretranslate"
        );
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof TranslationError) {
        throw error;
      }
      if (error.name === "AbortError") {
        throw new TranslationError(
          "Request timeout",
          "TIMEOUT",
          "libretranslate"
        );
      }
      throw error;
    }
  }
  /**
   * Maps LibreTranslate errors to standardized error types
   */
  mapError(error) {
    if (error instanceof TranslationError) {
      return error;
    }
    const err = error;
    return new TranslationError(
      err?.message || "Translation failed",
      err?.code || "UNKNOWN_ERROR",
      "libretranslate"
    );
  }
}
export {
  LibreTranslateProvider
};
//# sourceMappingURL=index4.js.map
