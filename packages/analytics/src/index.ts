/**
 * @happyvertical/analytics - Unified analytics interface
 *
 * Provides a common interface for interacting with analytics services
 * including Google Analytics 4 and Plausible Analytics.
 *
 * @example
 * ```typescript
 * import { getAnalytics } from '@happyvertical/analytics';
 *
 * // Create a GA4 client
 * const analytics = await getAnalytics({
 *   type: 'ga4',
 *   serviceAccountKey: '/path/to/service-account.json',
 *   measurementId: 'G-XXXXXXXXXX',
 *   apiSecret: 'your-api-secret'
 * });
 *
 * // Run a report
 * const report = await analytics.runReport('123456789', {
 *   dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
 *   metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
 *   dimensions: [{ name: 'country' }]
 * });
 *
 * // Track an event
 * await analytics.track({
 *   name: 'purchase',
 *   params: { value: 99.99, currency: 'USD' },
 *   clientId: 'user-123'
 * });
 * ```
 */

// Factory function
export { getAnalytics } from './shared/factory.js';

// All types
export type {
  // Admin / provisioning types
  AnalyticsAccessRole,
  AnalyticsAdminInterface,
  // Capabilities
  AnalyticsCapabilities,
  AnalyticsHealthResult,
  // Interface
  AnalyticsInterface,
  AnalyticsSite,
  AnalyticsUser,
  AnalyticsUserToken,
  // Base options
  BaseAnalyticsOptions,
  BetweenFilter,
  ConfigOptions,
  // Key event types
  CountingMethod,
  CreateAnalyticsSiteOptions,
  CreateAnalyticsUserOptions,
  CreateDataStreamOptions,
  CreatePropertyOptions,
  CustomDimension,
  CustomDimensionOptions,
  // Custom dimension/metric types
  CustomDimensionScope,
  CustomMetric,
  CustomMetricOptions,
  DataStream,
  // Data stream types
  DataStreamType,
  // Reporting types
  DateRange,
  Dimension,
  DimensionMetadata,
  DimensionOrderType,
  Filter,
  FilterExpression,
  // Provider options
  GA4Options,
  GetAnalyticsOptions,
  InListFilter,
  KeyEvent,
  KeyEventOptions,
  ListPropertiesOptions,
  MatomoOptions,
  MeasurementUnit,
  Metric,
  MetricMetadata,
  // Metadata types
  MetricType,
  MintUserTokenOptions,
  MinuteRange,
  NumericFilter,
  NumericOperation,
  NumericValue,
  OrderBy,
  PageviewEvent,
  PlausibleOptions,
  // Property types
  Property,
  PropertyQuota,
  QuotaInfo,
  RealtimeReportOptions,
  ReportOptions,
  ReportResult,
  ReportRow,
  ServiceAccountCredentials,
  SetUserAccessOptions,
  SnippetOptions,
  StringFilter,
  StringMatchType,
  // Event tracking types
  TrackEvent,
  // Snippet types
  TrackingSnippet,
  UpdatePropertyOptions,
} from './shared/types.js';

// Error classes
export {
  AnalyticsError,
  AuthenticationError,
  InvalidDimensionError,
  InvalidMetricError,
  NotSupportedError,
  PropertyNotFoundError,
  QuotaExceededError,
  RateLimitError,
} from './shared/types.js';
