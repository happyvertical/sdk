/**
 * Core types and interfaces for the Analytics library
 */

// =============================================================================
// Base Options
// =============================================================================

/**
 * Base configuration options for all analytics providers
 */
export interface BaseAnalyticsOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts for failed requests */
  maxRetries?: number;
  /** Cache TTL in milliseconds for metadata operations */
  cacheTTL?: number;
}

/**
 * Service account credentials for Google APIs
 */
export interface ServiceAccountCredentials {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// =============================================================================
// Provider Options (Discriminated Union)
// =============================================================================

/**
 * Google Analytics 4 provider options
 */
export interface GA4Options extends BaseAnalyticsOptions {
  type: 'ga4';
  /**
   * Service account credentials for Admin API and Data API
   * Can be path to JSON key file or parsed JSON object
   */
  serviceAccountKey?: string | ServiceAccountCredentials;
  /**
   * Measurement ID (G-XXXXXXX) for Measurement Protocol
   * Required for server-side event tracking
   */
  measurementId?: string;
  /**
   * API Secret for Measurement Protocol
   * Required for server-side event tracking
   */
  apiSecret?: string;
  /**
   * Default property ID for operations that don't specify one
   */
  defaultPropertyId?: string;
}

/**
 * Plausible Analytics provider options
 */
export interface PlausibleOptions extends BaseAnalyticsOptions {
  type: 'plausible';
  /**
   * Plausible API key
   */
  apiKey: string;
  /**
   * Base URL for self-hosted instances
   * @default "https://plausible.io"
   */
  baseUrl?: string;
  /**
   * Default site ID (domain) for operations
   */
  defaultSiteId?: string;
}

/**
 * Union type for all provider options
 */
export type GetAnalyticsOptions = GA4Options | PlausibleOptions;

// =============================================================================
// Property Types
// =============================================================================

/**
 * Analytics property/site representation
 */
export interface Property {
  /** Unique identifier */
  id: string;
  /** Internal name (GA4: properties/123456789) */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Creation timestamp (ISO 8601) */
  createTime: string;
  /** Last update timestamp (ISO 8601) */
  updateTime?: string;
  /** Property timezone */
  timeZone?: string;
  /** Currency code (e.g., 'USD', 'EUR') */
  currencyCode?: string;
  /** Industry category */
  industryCategory?: string;
  /** Service level */
  serviceLevel?: 'STANDARD' | 'PREMIUM';
}

/**
 * Options for listing properties
 */
export interface ListPropertiesOptions {
  /**
   * When true, fetch full metadata for each discovered property.
   *
   * This may require an additional API request per property for providers
   * that only expose lightweight discovery endpoints.
   */
  hydrate?: boolean;
}

/**
 * Options for creating a new property
 */
export interface CreatePropertyOptions {
  /** Human-readable display name */
  displayName: string;
  /** Timezone (e.g., 'America/Los_Angeles') */
  timeZone?: string;
  /** Currency code (e.g., 'USD') */
  currencyCode?: string;
  /** Industry category */
  industryCategory?: string;
  /** Parent account (GA4: accounts/{account_id}) */
  parent?: string;
}

/**
 * Options for updating a property
 */
export interface UpdatePropertyOptions {
  /** Human-readable display name */
  displayName?: string;
  /** Timezone */
  timeZone?: string;
  /** Currency code */
  currencyCode?: string;
  /** Industry category */
  industryCategory?: string;
}

// =============================================================================
// Data Stream Types
// =============================================================================

/**
 * Data stream types
 */
export type DataStreamType =
  | 'WEB_DATA_STREAM'
  | 'ANDROID_APP_DATA_STREAM'
  | 'IOS_APP_DATA_STREAM';

/**
 * Data stream representation
 */
export interface DataStream {
  /** Unique identifier */
  id: string;
  /** Stream type */
  type: DataStreamType;
  /** Human-readable display name */
  displayName: string;
  /** Measurement ID for web streams (G-XXXXXXX) */
  measurementId?: string;
  /** Firebase App ID for app streams */
  firebaseAppId?: string;
  /** Default URI for web streams */
  defaultUri?: string;
  /** Creation timestamp */
  createTime: string;
  /** Last update timestamp */
  updateTime?: string;
}

/**
 * Options for creating a data stream
 */
export interface CreateDataStreamOptions {
  /** Stream type */
  type: DataStreamType;
  /** Human-readable display name */
  displayName: string;
  /** Default URI for web streams */
  defaultUri?: string;
  /** Bundle ID for iOS apps */
  bundleId?: string;
  /** Package name for Android apps */
  packageName?: string;
}

// =============================================================================
// Custom Dimension/Metric Types
// =============================================================================

/**
 * Scope for custom dimensions
 */
export type CustomDimensionScope = 'EVENT' | 'USER' | 'ITEM';

/**
 * Custom dimension representation
 */
export interface CustomDimension {
  /** Unique identifier */
  id: string;
  /** Resource name */
  name: string;
  /** Parameter name used in events */
  parameterName: string;
  /** Human-readable display name */
  displayName: string;
  /** Description */
  description?: string;
  /** Scope of the dimension */
  scope: CustomDimensionScope;
  /** Whether to disallow ads personalization */
  disallowAdsPersonalization?: boolean;
}

/**
 * Options for creating a custom dimension
 */
export interface CustomDimensionOptions {
  /** Parameter name used in events */
  parameterName: string;
  /** Human-readable display name */
  displayName: string;
  /** Description */
  description?: string;
  /** Scope of the dimension */
  scope: CustomDimensionScope;
  /** Whether to disallow ads personalization */
  disallowAdsPersonalization?: boolean;
}

/**
 * Measurement unit for custom metrics
 */
export type MeasurementUnit =
  | 'STANDARD'
  | 'CURRENCY'
  | 'FEET'
  | 'METERS'
  | 'KILOMETERS'
  | 'MILES'
  | 'MILLISECONDS'
  | 'SECONDS'
  | 'MINUTES'
  | 'HOURS';

/**
 * Custom metric representation
 */
export interface CustomMetric {
  /** Unique identifier */
  id: string;
  /** Resource name */
  name: string;
  /** Parameter name used in events */
  parameterName: string;
  /** Human-readable display name */
  displayName: string;
  /** Description */
  description?: string;
  /** Scope (always EVENT for metrics) */
  scope: 'EVENT';
  /** Measurement unit */
  measurementUnit: MeasurementUnit;
  /** Restricted metric type */
  restrictedMetricType?: 'COST_DATA' | 'REVENUE_DATA';
}

/**
 * Options for creating a custom metric
 */
export interface CustomMetricOptions {
  /** Parameter name used in events */
  parameterName: string;
  /** Human-readable display name */
  displayName: string;
  /** Description */
  description?: string;
  /** Measurement unit */
  measurementUnit: MeasurementUnit;
  /** Restricted metric type */
  restrictedMetricType?: 'COST_DATA' | 'REVENUE_DATA';
}

// =============================================================================
// Key Event (Conversion) Types
// =============================================================================

/**
 * Counting method for key events
 */
export type CountingMethod = 'ONCE_PER_EVENT' | 'ONCE_PER_SESSION';

/**
 * Key event (conversion) representation
 */
export interface KeyEvent {
  /** Unique identifier */
  id: string;
  /** Resource name */
  name: string;
  /** Event name that triggers this key event */
  eventName: string;
  /** Creation timestamp */
  createTime: string;
  /** How to count the conversion */
  countingMethod?: CountingMethod;
  /** Default value for the conversion */
  defaultValue?: {
    numericValue?: number;
    currencyCode?: string;
  };
}

/**
 * Options for creating a key event
 */
export interface KeyEventOptions {
  /** Event name that triggers this key event */
  eventName: string;
  /** How to count the conversion */
  countingMethod?: CountingMethod;
  /** Default value for the conversion */
  defaultValue?: {
    numericValue?: number;
    currencyCode?: string;
  };
}

// =============================================================================
// Reporting Types
// =============================================================================

/**
 * Date range for reports
 */
export interface DateRange {
  /** Start date (YYYY-MM-DD or relative: 'today', 'yesterday', '7daysAgo', '30daysAgo') */
  startDate: string;
  /** End date (YYYY-MM-DD or relative: 'today', 'yesterday') */
  endDate: string;
  /** Optional name for this date range */
  name?: string;
}

/**
 * Dimension specification for reports
 */
export interface Dimension {
  /** Dimension name (e.g., 'country', 'deviceCategory') */
  name: string;
}

/**
 * Metric specification for reports
 */
export interface Metric {
  /** Metric name (e.g., 'activeUsers', 'sessions') */
  name: string;
}

/**
 * Filter match types
 */
export type StringMatchType =
  | 'EXACT'
  | 'BEGINS_WITH'
  | 'ENDS_WITH'
  | 'CONTAINS'
  | 'FULL_REGEXP'
  | 'PARTIAL_REGEXP';

/**
 * Numeric filter operations
 */
export type NumericOperation =
  | 'EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL';

/**
 * Filter value (numeric)
 */
export interface NumericValue {
  int64Value?: string;
  doubleValue?: number;
}

/**
 * String filter specification
 */
export interface StringFilter {
  matchType: StringMatchType;
  value: string;
  caseSensitive?: boolean;
}

/**
 * In-list filter specification
 */
export interface InListFilter {
  values: string[];
  caseSensitive?: boolean;
}

/**
 * Numeric filter specification
 */
export interface NumericFilter {
  operation: NumericOperation;
  value: NumericValue;
}

/**
 * Between filter specification
 */
export interface BetweenFilter {
  fromValue: NumericValue;
  toValue: NumericValue;
}

/**
 * Individual filter specification
 */
export interface Filter {
  fieldName: string;
  stringFilter?: StringFilter;
  inListFilter?: InListFilter;
  numericFilter?: NumericFilter;
  betweenFilter?: BetweenFilter;
}

/**
 * Filter expression (supports AND/OR/NOT combinations)
 */
export interface FilterExpression {
  andGroup?: { expressions: FilterExpression[] };
  orGroup?: { expressions: FilterExpression[] };
  notExpression?: FilterExpression;
  filter?: Filter;
}

/**
 * Order type for dimension sorting
 */
export type DimensionOrderType =
  | 'ALPHANUMERIC'
  | 'CASE_INSENSITIVE_ALPHANUMERIC'
  | 'NUMERIC';

/**
 * Order specification
 */
export interface OrderBy {
  metric?: { metricName: string };
  dimension?: {
    dimensionName: string;
    orderType?: DimensionOrderType;
  };
  desc?: boolean;
}

/**
 * Minute range for realtime reports
 */
export interface MinuteRange {
  name?: string;
  startMinutesAgo: number;
  endMinutesAgo: number;
}

/**
 * Report request options
 */
export interface ReportOptions {
  /** Date ranges to query */
  dateRanges: DateRange[];
  /** Dimensions to group by */
  dimensions?: Dimension[];
  /** Metrics to retrieve */
  metrics: Metric[];
  /** Dimension filter expression */
  dimensionFilter?: FilterExpression;
  /** Metric filter expression */
  metricFilter?: FilterExpression;
  /** Result offset for pagination */
  offset?: number;
  /** Maximum results to return */
  limit?: number;
  /** Sort order */
  orderBys?: OrderBy[];
  /** Whether to keep empty rows */
  keepEmptyRows?: boolean;
  /** Whether to return property quota information */
  returnPropertyQuota?: boolean;
}

/**
 * Realtime report options
 */
export interface RealtimeReportOptions {
  /** Dimensions to group by */
  dimensions?: Dimension[];
  /** Metrics to retrieve */
  metrics?: Metric[];
  /** Dimension filter expression */
  dimensionFilter?: FilterExpression;
  /** Metric filter expression */
  metricFilter?: FilterExpression;
  /** Maximum results to return */
  limit?: number;
  /** Minute ranges to query */
  minuteRanges?: MinuteRange[];
}

/**
 * Report row
 */
export interface ReportRow {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

/**
 * Quota information
 */
export interface QuotaInfo {
  consumed: number;
  remaining: number;
}

/**
 * Property quota information
 */
export interface PropertyQuota {
  tokensPerDay: QuotaInfo;
  tokensPerHour: QuotaInfo;
  concurrentRequests: QuotaInfo;
}

/**
 * Report result
 */
export interface ReportResult {
  /** Column headers for dimensions */
  dimensionHeaders: { name: string }[];
  /** Column headers for metrics */
  metricHeaders: { name: string; type: string }[];
  /** Data rows */
  rows: ReportRow[];
  /** Total row count */
  rowCount?: number;
  /** Report metadata */
  metadata?: {
    currencyCode?: string;
    timeZone?: string;
    dataLossFromOtherRow?: boolean;
    emptyReason?: string;
  };
  /** Property quota usage */
  propertyQuota?: PropertyQuota;
}

// =============================================================================
// Metadata Types
// =============================================================================

/**
 * Metric type
 */
export type MetricType =
  | 'METRIC_TYPE_UNSPECIFIED'
  | 'TYPE_INTEGER'
  | 'TYPE_FLOAT'
  | 'TYPE_SECONDS'
  | 'TYPE_MILLISECONDS'
  | 'TYPE_MINUTES'
  | 'TYPE_HOURS'
  | 'TYPE_STANDARD'
  | 'TYPE_CURRENCY'
  | 'TYPE_FEET'
  | 'TYPE_MILES'
  | 'TYPE_METERS'
  | 'TYPE_KILOMETERS';

/**
 * Metric metadata
 */
export interface MetricMetadata {
  /** API name for the metric */
  apiName: string;
  /** UI display name */
  uiName: string;
  /** Description */
  description: string;
  /** Deprecated API names */
  deprecatedApiNames?: string[];
  /** Metric data type */
  type: MetricType;
  /** Expression for calculated metrics */
  expression?: string;
  /** Whether this is a custom definition */
  customDefinition?: boolean;
  /** Reasons metric may be blocked */
  blockedReasons?: string[];
  /** Category */
  category?: string;
}

/**
 * Dimension metadata
 */
export interface DimensionMetadata {
  /** API name for the dimension */
  apiName: string;
  /** UI display name */
  uiName: string;
  /** Description */
  description: string;
  /** Deprecated API names */
  deprecatedApiNames?: string[];
  /** Whether this is a custom definition */
  customDefinition?: boolean;
  /** Category */
  category?: string;
}

// =============================================================================
// Event Tracking Types
// =============================================================================

/**
 * Track event payload
 */
export interface TrackEvent {
  /** Event name */
  name: string;
  /** Event parameters */
  params?: Record<string, string | number | boolean>;
  /** Client ID for anonymous tracking */
  clientId?: string;
  /** User ID for identified tracking */
  userId?: string;
  /** Event timestamp (Unix epoch in microseconds) */
  timestamp?: number;
  /** Whether to disable personalized ads */
  nonPersonalizedAds?: boolean;
}

/**
 * Pageview event payload
 */
export interface PageviewEvent {
  /** Page path */
  pagePath: string;
  /** Page title */
  pageTitle?: string;
  /** Full page location URL */
  pageLocation?: string;
  /** Client ID for anonymous tracking */
  clientId?: string;
  /** User ID for identified tracking */
  userId?: string;
  /** Additional parameters */
  params?: Record<string, string | number | boolean>;
}

// =============================================================================
// Client-Side Snippet Types
// =============================================================================

/**
 * Generated tracking snippet
 */
export interface TrackingSnippet {
  /** HTML snippet ready to embed */
  html: string;
  /** Configuration object */
  config: Record<string, unknown>;
  /** External script URLs */
  scripts: string[];
}

/**
 * Options for snippet generation
 */
export interface SnippetOptions {
  /** Whether to anonymize IP addresses */
  anonymizeIp?: boolean;
  /** Whether to send initial pageview */
  sendPageView?: boolean;
  /** Cookie flags */
  cookieFlags?: string;
  /** Custom configuration options */
  customConfig?: Record<string, unknown>;
}

/**
 * Options for config generation
 */
export interface ConfigOptions {
  /** Whether to anonymize IP addresses */
  anonymizeIp?: boolean;
  /** Whether to send initial pageview */
  sendPageView?: boolean;
  /** User ID for cross-device tracking */
  userId?: string;
  /** Custom dimensions to set */
  customDimensions?: Record<string, string>;
}

// =============================================================================
// Capabilities
// =============================================================================

/**
 * Analytics provider capabilities
 */
export interface AnalyticsCapabilities {
  /** Whether property management is supported */
  propertyManagement: boolean;
  /** Whether data streams are supported */
  dataStreams: boolean;
  /** Whether custom dimensions are supported */
  customDimensions: boolean;
  /** Whether custom metrics are supported */
  customMetrics: boolean;
  /** Whether key events (conversions) are supported */
  keyEvents: boolean;
  /** Whether reporting is supported */
  reporting: boolean;
  /** Whether realtime reporting is supported */
  realtimeReporting: boolean;
  /** Whether server-side tracking is supported */
  serverSideTracking: boolean;
  /** Whether client-side snippet generation is supported */
  clientSideSnippet: boolean;
  /** Whether user identification is supported */
  userIdentification: boolean;
  /** Whether batch tracking is supported */
  batchTracking: boolean;
}

// =============================================================================
// Analytics Interface
// =============================================================================

/**
 * Core analytics interface that all providers must implement
 */
export interface AnalyticsInterface {
  // -------------------------------------------------------------------------
  // Property Management
  // -------------------------------------------------------------------------

  /**
   * Create a new analytics property
   */
  createProperty(options: CreatePropertyOptions): Promise<Property>;

  /**
   * List all properties accessible to this account
   */
  listProperties(options?: ListPropertiesOptions): Promise<Property[]>;

  /**
   * Get a specific property by ID
   */
  getProperty(propertyId: string): Promise<Property>;

  /**
   * Update a property
   */
  updateProperty(
    propertyId: string,
    data: UpdatePropertyOptions,
  ): Promise<Property>;

  /**
   * Delete a property
   */
  deleteProperty(propertyId: string): Promise<void>;

  // -------------------------------------------------------------------------
  // Data Streams
  // -------------------------------------------------------------------------

  /**
   * Get all data streams for a property
   */
  getDataStreams(propertyId: string): Promise<DataStream[]>;

  /**
   * Create a new data stream
   */
  createDataStream(
    propertyId: string,
    options: CreateDataStreamOptions,
  ): Promise<DataStream>;

  /**
   * Delete a data stream
   */
  deleteDataStream(propertyId: string, streamId: string): Promise<void>;

  // -------------------------------------------------------------------------
  // Custom Definitions
  // -------------------------------------------------------------------------

  /**
   * Get all custom dimensions for a property
   */
  getCustomDimensions(propertyId: string): Promise<CustomDimension[]>;

  /**
   * Create a new custom dimension
   */
  createCustomDimension(
    propertyId: string,
    options: CustomDimensionOptions,
  ): Promise<CustomDimension>;

  /**
   * Archive (soft-delete) a custom dimension
   */
  archiveCustomDimension(
    propertyId: string,
    dimensionId: string,
  ): Promise<void>;

  /**
   * Get all custom metrics for a property
   */
  getCustomMetrics(propertyId: string): Promise<CustomMetric[]>;

  /**
   * Create a new custom metric
   */
  createCustomMetric(
    propertyId: string,
    options: CustomMetricOptions,
  ): Promise<CustomMetric>;

  /**
   * Archive (soft-delete) a custom metric
   */
  archiveCustomMetric(propertyId: string, metricId: string): Promise<void>;

  // -------------------------------------------------------------------------
  // Key Events (Conversions)
  // -------------------------------------------------------------------------

  /**
   * Get all key events for a property
   */
  getKeyEvents(propertyId: string): Promise<KeyEvent[]>;

  /**
   * Create a new key event
   */
  createKeyEvent(
    propertyId: string,
    options: KeyEventOptions,
  ): Promise<KeyEvent>;

  /**
   * Delete a key event
   */
  deleteKeyEvent(propertyId: string, eventId: string): Promise<void>;

  // -------------------------------------------------------------------------
  // Reporting
  // -------------------------------------------------------------------------

  /**
   * Run a report query
   */
  runReport(propertyId: string, options: ReportOptions): Promise<ReportResult>;

  /**
   * Run a realtime report query
   */
  runRealtimeReport(
    propertyId: string,
    options?: RealtimeReportOptions,
  ): Promise<ReportResult>;

  /**
   * Get available metrics for a property
   */
  getMetrics(propertyId: string): Promise<MetricMetadata[]>;

  /**
   * Get available dimensions for a property
   */
  getDimensions(propertyId: string): Promise<DimensionMetadata[]>;

  // -------------------------------------------------------------------------
  // Event Tracking (Server-Side)
  // -------------------------------------------------------------------------

  /**
   * Track a single event
   */
  track(event: TrackEvent): Promise<void>;

  /**
   * Track a pageview
   */
  trackPageview(pageview: PageviewEvent): Promise<void>;

  /**
   * Track multiple events in a batch
   */
  trackBatch(events: TrackEvent[]): Promise<void>;

  /**
   * Identify a user with traits
   */
  identify(userId: string, traits?: Record<string, unknown>): Promise<void>;

  // -------------------------------------------------------------------------
  // Client-Side Helpers
  // -------------------------------------------------------------------------

  /**
   * Generate a tracking snippet for embedding in HTML
   */
  generateTrackingSnippet(
    propertyId: string,
    options?: SnippetOptions,
  ): TrackingSnippet;

  /**
   * Generate a configuration object for programmatic use
   */
  generateConfig(
    propertyId: string,
    options?: ConfigOptions,
  ): Record<string, unknown>;

  // -------------------------------------------------------------------------
  // Provider Info
  // -------------------------------------------------------------------------

  /**
   * Get provider capabilities
   */
  getCapabilities(): Promise<AnalyticsCapabilities>;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Base error class for analytics operations
 */
export class AnalyticsError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: string,
    public propertyId?: string,
  ) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

/**
 * Authentication failed
 */
export class AuthenticationError extends AnalyticsError {
  constructor(provider?: string) {
    super('Authentication failed', 'AUTH_ERROR', provider);
    this.name = 'AuthenticationError';
  }
}

/**
 * Rate limit exceeded
 */
export class RateLimitError extends AnalyticsError {
  public retryAfter?: number;

  constructor(provider?: string, retryAfter?: number) {
    super(
      `Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ''}`,
      'RATE_LIMIT',
      provider,
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Property not found
 */
export class PropertyNotFoundError extends AnalyticsError {
  constructor(propertyId: string, provider?: string) {
    super(
      `Property not found: ${propertyId}`,
      'PROPERTY_NOT_FOUND',
      provider,
      propertyId,
    );
    this.name = 'PropertyNotFoundError';
  }
}

/**
 * Invalid dimension specified
 */
export class InvalidDimensionError extends AnalyticsError {
  public dimension: string;

  constructor(dimension: string, provider?: string) {
    super(`Invalid dimension: ${dimension}`, 'INVALID_DIMENSION', provider);
    this.name = 'InvalidDimensionError';
    this.dimension = dimension;
  }
}

/**
 * Invalid metric specified
 */
export class InvalidMetricError extends AnalyticsError {
  public metric: string;

  constructor(metric: string, provider?: string) {
    super(`Invalid metric: ${metric}`, 'INVALID_METRIC', provider);
    this.name = 'InvalidMetricError';
    this.metric = metric;
  }
}

/**
 * Quota exceeded
 */
export class QuotaExceededError extends AnalyticsError {
  public quotaType?: string;

  constructor(provider?: string, quotaType?: string) {
    super(
      `Quota exceeded${quotaType ? `: ${quotaType}` : ''}`,
      'QUOTA_EXCEEDED',
      provider,
    );
    this.name = 'QuotaExceededError';
    this.quotaType = quotaType;
  }
}

/**
 * Feature not supported by this provider
 */
export class NotSupportedError extends AnalyticsError {
  public feature: string;

  constructor(feature: string, provider?: string) {
    super(`Feature not supported: ${feature}`, 'NOT_SUPPORTED', provider);
    this.name = 'NotSupportedError';
    this.feature = feature;
  }
}
