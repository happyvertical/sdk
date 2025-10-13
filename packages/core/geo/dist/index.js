import { AuthenticationError, GeoError, InvalidQueryError, NoResultsError, RateLimitError } from "./index4.js";
import { isValidLatitude, isValidLongitude, mapGooglePlaceType, mapOSMPlaceType, normalizeCountryCode, validateCoordinates } from "./index5.js";
function isGoogleMapsOptions(options) {
  return options.provider === "google";
}
function isOpenStreetMapOptions(options) {
  return options.provider === "openstreetmap";
}
async function getGeoAdapter(options) {
  if (isGoogleMapsOptions(options)) {
    const { GoogleMapsProvider } = await import("./index2.js");
    return new GoogleMapsProvider(options);
  }
  if (isOpenStreetMapOptions(options)) {
    const { OpenStreetMapProvider } = await import("./index3.js");
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
