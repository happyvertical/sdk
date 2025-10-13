class GeoError extends Error {
  constructor(message, code, provider) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.name = "GeoError";
  }
}
class RateLimitError extends GeoError {
  constructor(provider, retryAfter) {
    super(
      `Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ""}`,
      "RATE_LIMIT",
      provider
    );
    this.name = "RateLimitError";
  }
}
class InvalidQueryError extends GeoError {
  constructor(query, provider) {
    super(`Invalid query: ${query}`, "INVALID_QUERY", provider);
    this.name = "InvalidQueryError";
  }
}
class AuthenticationError extends GeoError {
  constructor(provider) {
    super("Authentication failed", "AUTH_ERROR", provider);
    this.name = "AuthenticationError";
  }
}
class NoResultsError extends GeoError {
  constructor(query, provider) {
    super(`No results found for query: ${query}`, "NO_RESULTS", provider);
    this.name = "NoResultsError";
  }
}
export {
  AuthenticationError,
  GeoError,
  InvalidQueryError,
  NoResultsError,
  RateLimitError
};
//# sourceMappingURL=index4.js.map
