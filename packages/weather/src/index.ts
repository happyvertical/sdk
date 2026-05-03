/**
 * @happyvertical/weather - Weather data provider abstraction
 *
 * Unified interface for fetching weather forecasts from multiple providers:
 * - Environment Canada (free, Canada only)
 * - OpenWeatherMap (free tier, global, 3-hour forecasts)
 * - OpenWeatherMap One Call (paid tier, global, hourly + daily)
 * - Google Weather (paid, global, 240h hourly + 10 day daily + alerts)
 * - Open-Meteo (free/community, global forecast + long-range hourly archive)
 *
 * @example
 * ```typescript
 * import { getWeatherAdapter } from '@happyvertical/weather';
 *
 * // Environment Canada
 * const weather = await getWeatherAdapter({ provider: 'environment-canada' });
 * const forecasts = await weather.fetchForLocation(51.0447, -114.0719);
 *
 * // OpenWeatherMap (free tier)
 * const weather = await getWeatherAdapter({
 *   provider: 'openweathermap',
 *   apiKey: process.env.OPENWEATHER_API_KEY
 * });
 *
 * // OpenWeatherMap One Call (paid tier)
 * const weather = await getWeatherAdapter({
 *   provider: 'openweathermap-onecall',
 *   apiKey: process.env.OPENWEATHER_API_KEY
 * });
 *
 * // Google Weather (paid)
 * const weather = await getWeatherAdapter({
 *   provider: 'google-weather',
 *   apiKey: process.env.GOOGLE_API_KEY
 * });
 * ```
 */

import { loadEnvConfig } from '@happyvertical/utils';
// Provider imports
import { EnvironmentCanadaProvider } from './providers/environment-canada';
import { GoogleWeatherProvider } from './providers/google-weather';
import { OpenMeteoProvider } from './providers/open-meteo';
import { OpenWeatherMapProvider } from './providers/openweathermap';
import { OpenWeatherMapOneCallProvider } from './providers/openweathermap-onecall';
import type {
  IWeatherAdapter,
  PartialWeatherAdapterOptions,
  WeatherAdapterOptions,
} from './shared/types';
import { WeatherError } from './shared/types';

// Re-export types
export type {
  EnvironmentCanadaOptions,
  FetchOptions,
  GoogleWeatherOptions,
  HistoricalFetchOptions,
  IWeatherAdapter,
  IWeatherProvider,
  OpenMeteoOptions,
  OpenWeatherMapOneCallOptions,
  OpenWeatherMapOptions,
  PartialWeatherAdapterOptions,
  WeatherAdapterOptions,
  WeatherAlert,
  WeatherForecast,
} from './shared/types';

// Re-export error classes
export {
  AuthenticationError,
  InvalidLocationError,
  NoResultsError,
  RateLimitError,
  UnsupportedWeatherCapabilityError,
  WeatherError,
} from './shared/types';

// Re-export utilities
export {
  calculateDistance,
  ensureValidCoordinates,
  fahrenheitToCelsius,
  isInCanada,
  kelvinToCelsius,
  metersPerSecondToKmPerHour,
  metersToKilometers,
  milesPerHourToKmPerHour,
  milesToKilometers,
  validateCoordinates,
} from './shared/utils';

/**
 * Environment variable configuration keys
 */
const ENV_CONFIG_KEYS = {
  // Provider selection
  provider: 'HAVE_WEATHER_PROVIDER',

  // OpenWeatherMap API key
  apiKey: 'OPENWEATHER_API_KEY',

  // Google API key
  googleApiKey: 'GOOGLE_API_KEY',

  // Timeouts
  timeout: 'HAVE_WEATHER_TIMEOUT',
} as const;

/**
 * Load weather adapter configuration from environment variables
 */
function loadWeatherEnvConfig(): PartialWeatherAdapterOptions & {
  googleApiKey?: string;
} {
  const rawConfig = loadEnvConfig(ENV_CONFIG_KEYS);

  // Build properly typed config
  const config: PartialWeatherAdapterOptions & { googleApiKey?: string } = {};

  // Provider
  if (rawConfig.provider) {
    config.provider = rawConfig.provider as any;
  }

  // API Key (OpenWeatherMap)
  if (rawConfig.apiKey) {
    config.apiKey = rawConfig.apiKey as any;
  }

  // Google API Key
  if (rawConfig.googleApiKey) {
    config.googleApiKey = rawConfig.googleApiKey as string;
  }

  // Timeout - convert to number
  if (rawConfig.timeout) {
    const timeout = Number.parseInt(rawConfig.timeout as string, 10);
    if (!Number.isNaN(timeout)) {
      config.timeout = timeout;
    }
  }

  return config;
}

/**
 * Merge environment config with user options
 * User-provided options take precedence
 */
function mergeConfig(
  userOptions?: PartialWeatherAdapterOptions,
): WeatherAdapterOptions {
  const envConfig = loadWeatherEnvConfig();

  // Merge with user options (user options take precedence)
  const merged = { ...envConfig, ...userOptions };

  // Determine provider
  const provider =
    merged.provider || envConfig.provider || 'environment-canada'; // Default to Environment Canada

  // Build provider-specific options
  switch (provider) {
    case 'environment-canada':
      return {
        provider: 'environment-canada',
        timeout: merged.timeout,
      };

    case 'openweathermap':
      if (!merged.apiKey) {
        throw new WeatherError(
          'OpenWeatherMap requires an API key. Set OPENWEATHER_API_KEY environment variable or pass apiKey option.',
          'openweathermap',
          'MISSING_API_KEY',
        );
      }
      return {
        provider: 'openweathermap',
        apiKey: merged.apiKey,
        timeout: merged.timeout,
      };

    case 'openweathermap-onecall':
      if (!merged.apiKey) {
        throw new WeatherError(
          'OpenWeatherMap One Call requires an API key. Set OPENWEATHER_API_KEY environment variable or pass apiKey option.',
          'openweathermap-onecall',
          'MISSING_API_KEY',
        );
      }
      return {
        provider: 'openweathermap-onecall',
        apiKey: merged.apiKey,
        timeout: merged.timeout,
      };

    case 'google-weather': {
      // Support both explicit apiKey option and googleApiKey from env
      // Only fall back to env if apiKey was not explicitly provided (undefined)
      const googleKey =
        merged.apiKey !== undefined ? merged.apiKey : envConfig.googleApiKey;
      if (!googleKey) {
        throw new WeatherError(
          'Google Weather requires an API key. Set GOOGLE_API_KEY environment variable or pass apiKey option.',
          'google-weather',
          'MISSING_API_KEY',
        );
      }
      return {
        provider: 'google-weather',
        apiKey: googleKey,
        timeout: merged.timeout,
      };
    }

    case 'open-meteo':
      return {
        provider: 'open-meteo',
        timeout: merged.timeout,
      };

    default:
      throw new WeatherError(
        `Unknown provider: ${provider}. Supported providers: environment-canada, openweathermap, openweathermap-onecall, google-weather, open-meteo`,
        'unknown',
        'INVALID_PROVIDER',
      );
  }
}

/**
 * Create a weather adapter instance
 *
 * @param options - Weather adapter options or undefined to use environment variables
 * @returns Weather adapter instance
 *
 * @example
 * ```typescript
 * // Use environment variables (HAVE_WEATHER_PROVIDER, OPENWEATHER_API_KEY)
 * const weather = await getWeatherAdapter();
 *
 * // Explicit configuration
 * const weather = await getWeatherAdapter({
 *   provider: 'openweathermap',
 *   apiKey: 'your-api-key'
 * });
 * ```
 */
export async function getWeatherAdapter(
  options?: PartialWeatherAdapterOptions,
): Promise<IWeatherAdapter> {
  // Merge options with environment config
  const config = mergeConfig(options);

  // Create provider based on configuration
  switch (config.provider) {
    case 'environment-canada':
      return new EnvironmentCanadaProvider({
        timeout: config.timeout,
      });

    case 'openweathermap':
      return new OpenWeatherMapProvider({
        apiKey: config.apiKey,
        timeout: config.timeout,
      });

    case 'openweathermap-onecall':
      return new OpenWeatherMapOneCallProvider({
        apiKey: config.apiKey,
        timeout: config.timeout,
      });

    case 'google-weather':
      return new GoogleWeatherProvider({
        apiKey: config.apiKey,
        timeout: config.timeout,
      });

    case 'open-meteo':
      return new OpenMeteoProvider({
        timeout: config.timeout,
      });

    default:
      // TypeScript should prevent this, but handle it just in case
      throw new WeatherError(
        `Unsupported provider: ${(config as any).provider}`,
        'unknown',
        'INVALID_PROVIDER',
      );
  }
}

/**
 * Default export
 */
export default getWeatherAdapter;

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
