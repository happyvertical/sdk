---
id: geo
title: "@happyvertical/geo: Geographic Utilities"
sidebar_label: "@happyvertical/geo"
sidebar_position: 7
---

# @happyvertical/geo: Geographic Utilities

Standardized geographical information interface supporting Google Maps and OpenStreetMap.

## Overview

The `@happyvertical/geo` package provides unified access to geographic services across multiple providers:

- **🗺️ Multi-Provider Support**: Google Maps and OpenStreetMap (Nominatim)
- **📍 Location Lookup**: Search for places, addresses, and points of interest
- **🔄 Reverse Geocoding**: Convert coordinates to location information
- **🔒 Type Safety**: Standardized `Location` objects across all providers
- **⚡ Performance**: Built-in rate limiting and request optimization
- **🌍 Global Coverage**: Access to worldwide geographic data

## Quick Start

```typescript
import { getGeoAdapter } from '@happyvertical/geo';

// Create Google Maps adapter
const googleGeo = await getGeoAdapter({
  provider: 'google',
  apiKey: process.env.GOOGLE_MAPS_API_KEY!,
  timeout: 10000,
  maxResults: 10
});

// Create OpenStreetMap adapter (no API key needed)
const osmGeo = await getGeoAdapter({
  provider: 'openstreetmap',
  rateLimitDelay: 1000,      // Required: 1 request per second
  userAgent: 'MyApp/1.0',    // Required by OSM
  timeout: 10000,
  maxResults: 10
});
```

## Location Lookup

```typescript
// Search for a location
const results = await adapter.lookup('Eiffel Tower, Paris');

results.forEach(location => {
  console.log('Name:', location.name);
  console.log('Coordinates:', location.latitude, location.longitude);
  console.log('Type:', location.type); // 'point_of_interest', 'city', etc.
  console.log('Country:', location.countryCode); // ISO code

  if (location.addressComponents) {
    console.log('City:', location.addressComponents.city);
    console.log('Street:', location.addressComponents.streetName);
  }
});
```

## Reverse Geocoding

```typescript
// Convert coordinates to location information
const latitude = 48.8584;   // Eiffel Tower
const longitude = 2.2945;

const locations = await adapter.reverseGeocode(latitude, longitude);

console.log('Location:', locations[0].name);
console.log('Address:', locations[0].addressComponents);
```

## Location Structure

All providers return standardized `Location` objects:

```typescript
interface Location {
  id: string;              // Provider-specific unique ID
  type: LocationType;      // 'address', 'city', 'region', 'country', 'point_of_interest'
  name: string;            // Formatted address/name
  latitude: number;
  longitude: number;
  addressComponents?: {
    streetNumber?: string;
    streetName?: string;
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  countryCode: string;     // ISO 3166-1 alpha-2 code
  timezone?: string;
  raw: any;                // Original provider response
}
```

## Provider Comparison

### Google Maps
- **Strengths**: Excellent data quality, comprehensive POI coverage
- **API Key**: Required (paid service with free tier)
- **Rate Limits**: Generous (depends on plan)
- **Best For**: Production apps, high-quality geocoding, POI search

### OpenStreetMap (Nominatim)
- **Strengths**: Free, open data, good global coverage
- **API Key**: Not required
- **Rate Limits**: 1 request/second (free tier)
- **Best For**: Development, non-commercial use, open-source projects

## Error Handling

```typescript
import {
  GeoError,
  RateLimitError,
  AuthenticationError,
  InvalidQueryError
} from '@happyvertical/geo';

try {
  const results = await adapter.lookup(query);
} catch (error) {
  if (error instanceof RateLimitError) {
    // Handle rate limiting
    console.error('Rate limit exceeded');
  } else if (error instanceof AuthenticationError) {
    // Handle auth failures (Google Maps)
    console.error('Invalid API key');
  } else if (error instanceof InvalidQueryError) {
    // Handle invalid coordinates or query
    console.error('Invalid location query');
  }
}
```

*Full documentation coming soon...*
