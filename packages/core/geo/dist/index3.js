import { getCache } from "@have/cache";
import { RateLimitError, GeoError, InvalidQueryError } from "./index4.js";
import { validateCoordinates, mapOSMPlaceType, normalizeCountryCode } from "./index5.js";
class OpenStreetMapProvider {
  baseUrl = "https://nominatim.openstreetmap.org";
  userAgent;
  rateLimitDelay;
  lastRequestTime = 0;
  timeout;
  maxResults;
  cache = null;
  constructor(options) {
    this.userAgent = options.userAgent || "@have/geo (Node.js)";
    this.rateLimitDelay = options.rateLimitDelay || 1e3;
    this.timeout = options.timeout || 1e4;
    this.maxResults = options.maxResults || 10;
    this.initCache();
  }
  /**
   * Initializes the memory cache for geocoding results
   */
  async initCache() {
    try {
      this.cache = await getCache({
        provider: "memory",
        namespace: "geo:osm",
        defaultTTL: 86400,
        // 24 hour cache for location data
        maxSize: 20 * 1024 * 1024,
        // 20MB
        maxEntries: 5e3,
        evictionPolicy: "lru"
      });
    } catch (error) {
      console.warn("Failed to initialize geo cache:", error);
    }
  }
  /**
   * Generates a cache key for geocoding requests
   */
  getCacheKey(type, ...parts) {
    return `${type}:${parts.join(":")}`;
  }
  /**
   * Enforce rate limiting by waiting if necessary
   */
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }
  /**
   * Make HTTP request to Nominatim API
   */
  async fetchNominatim(endpoint, params) {
    await this.enforceRateLimit();
    const queryParams = new URLSearchParams({
      ...params,
      format: "json",
      addressdetails: "1",
      limit: this.maxResults.toString()
    });
    const url = `${this.baseUrl}/${endpoint}?${queryParams.toString()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.status === 429) {
        throw new RateLimitError("openstreetmap");
      }
      if (!response.ok) {
        throw new GeoError(
          `Nominatim API error: ${response.status} ${response.statusText}`,
          "API_ERROR",
          "openstreetmap"
        );
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        return data;
      }
      return data ? [data] : [];
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof GeoError) {
        throw error;
      }
      if (error.name === "AbortError") {
        throw new GeoError("Request timeout", "TIMEOUT", "openstreetmap");
      }
      throw new GeoError(
        `Failed to fetch from Nominatim: ${error.message}`,
        "FETCH_FAILED",
        "openstreetmap"
      );
    }
  }
  /**
   * Look up locations based on a query string
   */
  async lookup(query) {
    if (!query || query.trim().length === 0) {
      throw new InvalidQueryError(query, "openstreetmap");
    }
    const cacheKey = this.getCacheKey("lookup", query, String(this.maxResults));
    if (this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    try {
      const results = await this.fetchNominatim("search", { q: query });
      const locations = results.map(
        (result) => this.mapNominatimResultToLocation(result)
      );
      if (this.cache) {
        await this.cache.set(cacheKey, locations);
      }
      return locations;
    } catch (error) {
      if (error instanceof GeoError) {
        throw error;
      }
      throw new GeoError(
        `Failed to lookup location: ${error.message}`,
        "LOOKUP_FAILED",
        "openstreetmap"
      );
    }
  }
  /**
   * Reverse geocode from coordinates to location
   */
  async reverseGeocode(latitude, longitude) {
    const validation = validateCoordinates(latitude, longitude);
    if (!validation.valid) {
      throw new InvalidQueryError(
        `${latitude}, ${longitude}: ${validation.error}`,
        "openstreetmap"
      );
    }
    const cacheKey = this.getCacheKey(
      "reverse",
      String(latitude),
      String(longitude),
      String(this.maxResults)
    );
    if (this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    try {
      const results = await this.fetchNominatim("reverse", {
        lat: latitude.toString(),
        lon: longitude.toString()
      });
      const locations = results.map(
        (result) => this.mapNominatimResultToLocation(result)
      );
      if (this.cache) {
        await this.cache.set(cacheKey, locations);
      }
      return locations;
    } catch (error) {
      if (error instanceof GeoError) {
        throw error;
      }
      throw new GeoError(
        `Failed to reverse geocode: ${error.message}`,
        "REVERSE_GEOCODE_FAILED",
        "openstreetmap"
      );
    }
  }
  /**
   * Map Nominatim result to standardized Location
   */
  mapNominatimResultToLocation(result) {
    const address = result.address || {};
    const addressComponents = {};
    if (address.house_number) {
      addressComponents.streetNumber = address.house_number;
    }
    if (address.road) {
      addressComponents.streetName = address.road;
    }
    if (address.city || address.town || address.village) {
      addressComponents.city = address.city || address.town || address.village;
    }
    if (address.state) {
      addressComponents.region = address.state;
    }
    if (address.country) {
      addressComponents.country = address.country;
    }
    if (address.postcode) {
      addressComponents.postalCode = address.postcode;
    }
    const type = mapOSMPlaceType(result.type || "", result.addresstype);
    const latitude = parseFloat(result.lat);
    const longitude = parseFloat(result.lon);
    return {
      id: `osm-${result.place_id}`,
      type,
      name: result.display_name,
      latitude,
      longitude,
      addressComponents,
      countryCode: normalizeCountryCode(address.country_code),
      raw: result
    };
  }
}
export {
  OpenStreetMapProvider
};
//# sourceMappingURL=index3.js.map
