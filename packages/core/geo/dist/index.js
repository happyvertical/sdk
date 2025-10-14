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
function mapGooglePlaceType(types) {
  if (!types || types.length === 0) return "unknown";
  if (types.includes("street_address") || types.includes("premise")) {
    return "address";
  }
  if (types.includes("locality") || types.includes("postal_town")) {
    return "city";
  }
  if (types.includes("administrative_area_level_1") || types.includes("administrative_area_level_2")) {
    return "region";
  }
  if (types.includes("country")) {
    return "country";
  }
  if (types.includes("point_of_interest") || types.includes("establishment")) {
    return "point_of_interest";
  }
  return "unknown";
}
function mapOSMPlaceType(type, addressType) {
  const checkType = (type || "").toLowerCase();
  const checkAddressType = (addressType || "").toLowerCase();
  if (checkType === "house" || checkType === "building" || checkAddressType === "house") {
    return "address";
  }
  if (checkType === "city" || checkType === "town" || checkType === "village" || checkType === "hamlet" || checkAddressType === "city" || checkAddressType === "town" || checkAddressType === "village") {
    return "city";
  }
  if (checkType === "state" || checkType === "province" || checkType === "region" || checkAddressType === "state") {
    return "region";
  }
  if (checkType === "country" || checkAddressType === "country") {
    return "country";
  }
  if (checkType === "attraction" || checkType === "tourism" || checkType === "amenity") {
    return "point_of_interest";
  }
  return "unknown";
}
function normalizeCountryCode(code) {
  if (!code) return "XX";
  const normalized = code.toUpperCase().trim();
  if (normalized.length === 2) {
    return normalized;
  }
  return normalized.length === 3 ? normalized : "XX";
}
function isValidLatitude(lat) {
  return typeof lat === "number" && lat >= -90 && lat <= 90;
}
function isValidLongitude(lng) {
  return typeof lng === "number" && lng >= -180 && lng <= 180;
}
function validateCoordinates(latitude, longitude) {
  if (!isValidLatitude(latitude)) {
    return {
      valid: false,
      error: `Invalid latitude: ${latitude}. Must be between -90 and 90.`
    };
  }
  if (!isValidLongitude(longitude)) {
    return {
      valid: false,
      error: `Invalid longitude: ${longitude}. Must be between -180 and 180.`
    };
  }
  return { valid: true };
}
function isGoogleMapsOptions(options) {
  return options.provider === "google";
}
function isOpenStreetMapOptions(options) {
  return options.provider === "openstreetmap";
}
async function getGeoAdapter(options) {
  if (isGoogleMapsOptions(options)) {
    const { GoogleMapsProvider } = await import("./chunks/google-V7ro-DVX.js");
    return new GoogleMapsProvider(options);
  }
  if (isOpenStreetMapOptions(options)) {
    const { OpenStreetMapProvider } = await import("./chunks/openstreetmap-BCVHSxgD.js");
    return new OpenStreetMapProvider(options);
  }
  throw new Error(`Unsupported provider: ${options.provider}`);
}
export {
  AuthenticationError,
  GeoError,
  InvalidQueryError,
  NoResultsError,
  RateLimitError,
  getGeoAdapter,
  isValidLatitude,
  isValidLongitude,
  mapGooglePlaceType,
  mapOSMPlaceType,
  normalizeCountryCode,
  validateCoordinates
};
//# sourceMappingURL=index.js.map
