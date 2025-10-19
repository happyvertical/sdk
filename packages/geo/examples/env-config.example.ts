/**
 * Example: Using environment variables for geo configuration
 *
 * This example demonstrates how to use the HAVE_GEO_* environment variables
 * to configure the geo adapter without hardcoding credentials.
 */

import { getGeoAdapter } from '../src/index';

async function main() {
  console.log('=== Geo Environment Configuration Examples ===\n');

  // Example 1: Using only environment variables
  console.log('Example 1: Using environment variables');
  console.log('Set these environment variables:');
  console.log('  HAVE_GEO_PROVIDER=openstreetmap');
  console.log('  HAVE_GEO_TIMEOUT=15000');
  console.log('  HAVE_GEO_MAX_RESULTS=5\n');

  try {
    // Uncomment to test with env vars:
    // process.env.HAVE_GEO_PROVIDER = 'openstreetmap';
    // process.env.HAVE_GEO_TIMEOUT = '15000';
    // process.env.HAVE_GEO_MAX_RESULTS = '5';

    // const adapter = await getGeoAdapter();
    // const results = await adapter.lookup('Paris, France');
    // console.log(`Found ${results.length} results`);
    // console.log(`First result: ${results[0].name}\n`);

    console.log('(Commented out - uncomment to test)\n');
  } catch (error) {
    console.error('Error:', error);
  }

  // Example 2: Using Google Maps with environment variables
  console.log('Example 2: Google Maps with environment variables');
  console.log('Set these environment variables:');
  console.log('  HAVE_GEO_PROVIDER=google');
  console.log('  GOOGLE_MAPS_API_KEY=your-api-key');
  console.log('  HAVE_GEO_TIMEOUT=20000\n');

  try {
    // Uncomment to test with env vars:
    // process.env.HAVE_GEO_PROVIDER = 'google';
    // process.env.GOOGLE_MAPS_API_KEY = 'your-api-key-here';

    // const adapter = await getGeoAdapter();
    // const results = await adapter.lookup('Eiffel Tower');
    // console.log(`Found ${results.length} results`);

    console.log('(Commented out - uncomment to test)\n');
  } catch (error) {
    console.error('Error:', error);
  }

  // Example 3: Mixing environment variables with explicit options
  console.log('Example 3: Mixing environment variables with explicit options');
  console.log('Environment provides defaults, user options override specific values\n');

  try {
    process.env.HAVE_GEO_PROVIDER = 'openstreetmap';
    process.env.HAVE_GEO_TIMEOUT = '10000';
    process.env.HAVE_GEO_MAX_RESULTS = '3';

    // Override maxResults while using other env vars
    const adapter = await getGeoAdapter({
      maxResults: 10,  // Overrides HAVE_GEO_MAX_RESULTS=3
    });

    const results = await adapter.lookup('London, UK');
    console.log(`Found ${results.length} results (maxResults overridden to 10)`);
    console.log(`First result: ${results[0].name}\n`);
  } catch (error) {
    console.error('Error:', error);
  }

  // Example 4: Complete explicit configuration (no env vars)
  console.log('Example 4: Explicit configuration (ignoring env vars)');

  try {
    const adapter = await getGeoAdapter({
      provider: 'openstreetmap',
      timeout: 5000,
      maxResults: 1,
      rateLimitDelay: 1000,
    });

    const results = await adapter.lookup('Tokyo, Japan');
    console.log(`Found ${results.length} results`);
    if (results.length > 0) {
      console.log(`Result: ${results[0].name}`);
      console.log(`Coordinates: ${results[0].latitude}, ${results[0].longitude}`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run examples
main().catch(console.error);
