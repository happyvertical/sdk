# Geo Package Specification

## Overview

The Geo package provides a standardized interface for interacting with various geographical information providers (e.g., Google Maps, OpenStreetMap). It abstracts the provider-specific implementations, allowing consuming packages like `packages/places` to use a consistent API for geographical lookups.

The primary goal is to query for geographical entities (countries, regions, cities, addresses) and receive a rich, standardized `Location` object in return.

## Core Concepts

- **GeoManager**: The main entry point and public interface of the package. It is initialized with a specific provider and orchestrates the geographical lookups.
- **Provider**: An adapter that conforms to the `IGeoProvider` interface. Each provider is responsible for communicating with a specific backend service (e.g., Google Maps API) and transforming the response into the standardized `Location` format.
- **Location**: A standardized data structure representing a geographical entity. It contains detailed information like coordinates, address components, administrative levels, and timezone.

## Data Models

### Location

This is the standardized object returned from any lookup.

```typescript
interface Location {
  // A unique identifier for the location, often from the provider.
  id: string;

  // The type of location (e.g., 'country', 'region', 'city', 'address').
  type: 'country' | 'region' | 'city' | 'address' | 'point_of_interest' | 'unknown';

  // The full, formatted name of the location.
  // e.g., "1600 Amphitheatre Parkway, Mountain View, CA 94043, USA"
  name: string;

  // Geographic coordinates.
  latitude: number;
  longitude: number;

  // Address broken down into components.
  addressComponents: {
    streetNumber?: string;
    streetName?: string;
    city?: string;
    region?: string; // State, province, or administrative area
    country: string;
    postalCode?: string;
  };

  // ISO 3166-1 alpha-2 country code.
  countryCode: string;

  // Timezone information for the location.
  timezone?: string;

  // The original, raw response from the provider.
  // Useful for debugging or accessing provider-specific data.
  raw: any;
}
```

## Provider Interface

All providers must implement this interface.

```typescript
interface IGeoProvider {
  /**
   * Looks up a location based on a string query.
   * The query can be a country name, city, address, or point of interest.
   * @param query The search string.
   * @returns A promise that resolves to an array of matching Location objects.
   */
  lookup(query: string): Promise<Location[]>;

  /**
   * Performs a reverse geocode lookup from coordinates to a location.
   * @param latitude The latitude.
   * @param longitude The longitude.
   * @returns A promise that resolves to an array of matching Location objects.
   */
  reverseGeocode(latitude: number, longitude: number): Promise<Location[]>;
}
```

## Public API

The primary way to interact with this package is through the `getGeoAdapter` factory function.

### `getGeoAdapter(options)`

This function returns a standardized Geo Adapter that conforms to the `IGeoAdapter` interface, based on the provided options.

```typescript
// The interface of the returned adapter.
// Note: This is structurally identical to the IGeoProvider interface.
interface IGeoAdapter {
  lookup(query: string): Promise<Location[]>;
  reverseGeocode(latitude: number, longitude: number): Promise<Location[]>;
}

// Configuration options for the factory function.
// This allows for selecting and configuring the desired provider.
type GeoAdapterOptions =
  | {
      provider: 'google';
      apiKey: string;
    }
  | {
      provider: 'openstreetmap';
      // No options needed for the public API
    };

function getGeoAdapter(options: GeoAdapterOptions): IGeoAdapter;
```

### Example Usage

This demonstrates how the `places` package would use the `getGeoAdapter` factory.

```typescript
import { getGeoAdapter } from '@happyvertical/geo';

// The adapter is created by calling the factory with the desired provider and config.
const geoAdapter = getGeoAdapter({
  provider: 'google',
  apiKey: process.env.GOOGLE_MAPS_API_KEY, // API key from config/env
});

async function findAndStorePlace(query: string) {
  try {
    const locations = await geoAdapter.lookup(query);

    if (locations.length > 0) {
      const bestMatch = locations[0];
      console.log('Found location:', bestMatch.name);
      // Here, the 'places' package would save this standardized
      // location data into its own database.
      // db.places.create({ ...bestMatch });
    }
  } catch (error) {
    console.error('Geocoding lookup failed:', error);
  }
}

findAndStorePlace('Eiffel Tower');
```

## Future Work

- **Caching**: Implement a caching layer (e.g., Redis) to reduce redundant API calls to providers and improve performance.
- **Distance Calculation**: Add utility functions to calculate the distance between two `Location` objects.
- **Route Planning**: Extend the interface to support basic route planning between two or more points.
- **Additional Providers**: Implement providers for other services like OpenStreetMap (Nominatim), Mapbox, etc.
