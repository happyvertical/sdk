import { SmrtCollection } from "@have/smrt";
import { Place } from "./index2.js";
import { PlaceTypeCollection } from "./index5.js";
import { getGeoAdapter } from "@have/geo";
class PlaceCollection extends SmrtCollection {
  static _itemClass = Place;
  /**
   * Look up a place by query or coordinates, creating it if not found
   *
   * This is the key method for organic database growth:
   * 1. Search local database first
   * 2. If not found, query @have/geo
   * 3. Create place from geocoding result
   * 4. Return place
   *
   * @param query - Address or location query string
   * @param options - Lookup options (provider, type, parent, etc.)
   * @returns Place instance
   */
  async lookupOrCreate(query, options = {}) {
    const {
      geoProvider = "openstreetmap",
      typeSlug,
      parentId,
      createIfNotFound = true,
      coords
    } = options;
    let existingPlace = null;
    if (coords) {
      existingPlace = await this.findByCoordinates(coords.lat, coords.lng);
    }
    if (!existingPlace) {
      existingPlace = await this.findByQuery(query);
    }
    if (existingPlace) {
      return existingPlace;
    }
    if (!createIfNotFound) {
      return null;
    }
    const locations = await this.geocode(
      query,
      coords,
      geoProvider
    );
    if (locations.length === 0) {
      return null;
    }
    const location = locations[0];
    return await this.createFromLocation(location, typeSlug, parentId);
  }
  /**
   * Find place by coordinates (within small threshold)
   *
   * @param latitude - Latitude to search
   * @param longitude - Longitude to search
   * @param threshold - Max distance in degrees (default: 0.0001 ~11m)
   * @returns Place instance or null
   */
  async findByCoordinates(latitude, longitude, threshold = 1e-4) {
    const places = await this.list({
      where: {
        latitude: { $ne: null },
        longitude: { $ne: null }
      }
    });
    for (const place of places) {
      if (place.latitude === null || place.longitude === null) continue;
      const latDiff = Math.abs(place.latitude - latitude);
      const lngDiff = Math.abs(place.longitude - longitude);
      if (latDiff < threshold && lngDiff < threshold) {
        return place;
      }
    }
    return null;
  }
  /**
   * Find place by query text (matches name, city, region, country)
   *
   * @param query - Search query
   * @returns Place instance or null
   */
  async findByQuery(query) {
    const normalizedQuery = query.toLowerCase().trim();
    const places = await this.list({});
    for (const place of places) {
      if (place.name.toLowerCase().includes(normalizedQuery)) {
        return place;
      }
      const addressParts = [
        place.streetNumber,
        place.streetName,
        place.city,
        place.region,
        place.country
      ].filter((p) => p).join(" ").toLowerCase();
      if (addressParts.includes(normalizedQuery)) {
        return place;
      }
    }
    return null;
  }
  /**
   * Geocode query or coordinates using @have/geo
   *
   * @param query - Address query
   * @param coords - Optional coordinates for reverse geocoding
   * @param provider - Geo provider to use
   * @returns Array of Location results
   */
  async geocode(query, coords, provider = "openstreetmap") {
    const geoOptions = provider === "google" ? {
      provider: "google",
      apiKey: process.env.GOOGLE_MAPS_API_KEY || ""
    } : {
      provider: "openstreetmap",
      userAgent: "@have/places"
    };
    const geo = await getGeoAdapter(geoOptions);
    if (coords) {
      return await geo.reverseGeocode(coords.lat, coords.lng);
    }
    return await geo.lookup(query);
  }
  /**
   * Create place from @have/geo Location data
   *
   * @param location - Location from geocoding
   * @param typeSlug - Optional type slug override
   * @param parentId - Optional parent place ID
   * @returns Created Place instance
   */
  async createFromLocation(location, typeSlug, parentId) {
    const typeCollection = await PlaceTypeCollection.create(this.options);
    const slug = typeSlug || location.type || "address";
    const placeType = await typeCollection.getOrCreate(slug);
    const components = location.addressComponents || {};
    return await this.create({
      typeId: placeType.id,
      parentId: parentId || "",
      name: location.name,
      description: "",
      // Geo fields from location
      latitude: location.latitude,
      longitude: location.longitude,
      streetNumber: components.streetNumber || "",
      streetName: components.streetName || "",
      city: components.city || "",
      region: components.region || "",
      country: components.country || "",
      postalCode: components.postalCode || "",
      countryCode: location.countryCode || "",
      timezone: location.timezone || "",
      // Metadata
      externalId: location.id,
      source: location.raw?.provider || "unknown",
      metadata: { raw: location.raw }
    });
  }
  /**
   * Get immediate children of a parent place
   *
   * @param parentId - The parent place ID
   * @returns Array of child places
   */
  async getChildren(parentId) {
    return await this.list({
      where: { parentId }
    });
  }
  /**
   * Get root places (no parent)
   *
   * @returns Array of root places
   */
  async getRootPlaces() {
    return await this.list({
      where: { parentId: "" }
    });
  }
  /**
   * Get places by type
   *
   * @param typeSlug - PlaceType slug
   * @returns Array of places of that type
   */
  async getByType(typeSlug) {
    const typeCollection = await PlaceTypeCollection.create(this.options);
    const placeType = await typeCollection.getBySlug(typeSlug);
    if (!placeType) return [];
    return await this.list({
      where: { typeId: placeType.id }
    });
  }
  /**
   * Get place hierarchy (all ancestors and descendants)
   *
   * @param placeId - The place ID
   * @returns Object with ancestors, current place, and descendants
   */
  async getHierarchy(placeId) {
    const place = await this.get({ id: placeId });
    if (!place) throw new Error(`Place '${placeId}' not found`);
    return await place.getHierarchy();
  }
  /**
   * Search places by proximity to coordinates
   *
   * @param latitude - Center latitude
   * @param longitude - Center longitude
   * @param radiusKm - Search radius in kilometers
   * @returns Array of places within radius, sorted by distance
   */
  async searchByProximity(latitude, longitude, radiusKm = 10) {
    const places = await this.list({
      where: {
        latitude: { $ne: null },
        longitude: { $ne: null }
      }
    });
    const placesWithDistance = places.map((place) => {
      if (place.latitude === null || place.longitude === null) return null;
      const distance = this.calculateDistance(
        latitude,
        longitude,
        place.latitude,
        place.longitude
      );
      return { place, distance };
    }).filter((p) => p !== null && p.distance <= radiusKm).sort((a, b) => a.distance - b.distance);
    return placesWithDistance.map((p) => p.place);
  }
  /**
   * Calculate distance between two coordinates using Haversine formula
   *
   * @param lat1 - First latitude
   * @param lng1 - First longitude
   * @param lat2 - Second latitude
   * @param lng2 - Second longitude
   * @returns Distance in kilometers
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  /**
   * Convert degrees to radians
   */
  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }
}
export {
  PlaceCollection
};
//# sourceMappingURL=index4.js.map
