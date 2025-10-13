function mapLocationTypeToPlaceType(locationType) {
  const typeMap = {
    // Standard types
    country: "country",
    region: "region",
    city: "city",
    address: "address",
    point_of_interest: "point_of_interest",
    // Additional mappings
    state: "region",
    province: "region",
    town: "city",
    village: "city",
    building: "building",
    room: "room",
    zone: "zone"
  };
  return typeMap[locationType.toLowerCase()] || "address";
}
function locationToGeoData(location) {
  const components = location.addressComponents || {};
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    streetNumber: components.streetNumber,
    streetName: components.streetName,
    city: components.city,
    region: components.region,
    country: components.country,
    postalCode: components.postalCode,
    countryCode: location.countryCode,
    timezone: location.timezone
  };
}
function validateCoordinates(latitude, longitude) {
  if (latitude < -90 || latitude > 90) {
    return { valid: false, error: "Invalid latitude (must be -90 to 90)" };
  }
  if (longitude < -180 || longitude > 180) {
    return { valid: false, error: "Invalid longitude (must be -180 to 180)" };
  }
  return { valid: true };
}
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function toRad(degrees) {
  return degrees * (Math.PI / 180);
}
function formatCoordinates(latitude, longitude, precision = 6) {
  return `${latitude.toFixed(precision)}, ${longitude.toFixed(precision)}`;
}
function parseCoordinates(coordString) {
  const parts = coordString.trim().replace(/\s+/g, " ").replace(/,\s*/g, ",").split(/[,\s]+/);
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  const validation = validateCoordinates(lat, lng);
  if (!validation.valid) return null;
  return { lat, lng };
}
function normalizeAddressComponents(components) {
  const normalized = {};
  for (const [key, value] of Object.entries(components)) {
    if (value === null || value === void 0) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        normalized[key] = trimmed;
      }
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}
function generateDisplayName(components) {
  const parts = [];
  if (components.streetNumber && components.streetName) {
    parts.push(`${components.streetNumber} ${components.streetName}`);
  } else if (components.streetName) {
    parts.push(components.streetName);
  }
  if (components.city) parts.push(components.city);
  if (components.region) parts.push(components.region);
  if (components.country) parts.push(components.country);
  return parts.join(", ");
}
function areCoordinatesNear(lat1, lng1, lat2, lng2, thresholdKm = 0.1) {
  const distance = calculateDistance(lat1, lng1, lat2, lng2);
  return distance <= thresholdKm;
}
export {
  areCoordinatesNear,
  calculateDistance,
  formatCoordinates,
  generateDisplayName,
  locationToGeoData,
  mapLocationTypeToPlaceType,
  normalizeAddressComponents,
  parseCoordinates,
  validateCoordinates
};
//# sourceMappingURL=index6.js.map
