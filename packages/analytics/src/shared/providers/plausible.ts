/**
 * Plausible Analytics provider implementation
 *
 * Uses three APIs:
 * - Sites API: Site management
 * - Stats API v2: Reports and analytics queries
 * - Events API: Server-side event tracking
 */

import type {
  AnalyticsCapabilities,
  AnalyticsInterface,
  ConfigOptions,
  CreateDataStreamOptions,
  CreatePropertyOptions,
  CustomDimension,
  CustomDimensionOptions,
  CustomMetric,
  CustomMetricOptions,
  DataStream,
  DimensionMetadata,
  KeyEvent,
  KeyEventOptions,
  ListPropertiesOptions,
  MetricMetadata,
  PageviewEvent,
  PlausibleOptions,
  Property,
  RealtimeReportOptions,
  ReportOptions,
  ReportResult,
  SnippetOptions,
  TrackEvent,
  TrackingSnippet,
  UpdatePropertyOptions,
} from '../types.js';
import {
  AnalyticsError,
  AuthenticationError,
  NotSupportedError,
  PropertyNotFoundError,
  RateLimitError,
} from '../types.js';

/**
 * Default Plausible base URL
 */
const DEFAULT_BASE_URL = 'https://plausible.io';

/**
 * Plausible Analytics provider
 */
export class PlausibleProvider implements AnalyticsInterface {
  private options: PlausibleOptions;
  private baseUrl: string;

  constructor(options: PlausibleOptions) {
    this.options = {
      timeout: 30000,
      maxRetries: 3,
      baseUrl: DEFAULT_BASE_URL,
      ...options,
    };
    this.baseUrl = this.options.baseUrl || DEFAULT_BASE_URL;
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method || 'GET';

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthenticationError('plausible');
        }
        if (response.status === 404) {
          throw new PropertyNotFoundError(endpoint, 'plausible');
        }
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(
            'plausible',
            retryAfter ? Number.parseInt(retryAfter, 10) : undefined,
          );
        }

        const errorText = await response.text();
        throw new AnalyticsError(
          `Plausible API error: ${response.status} - ${errorText}`,
          'API_ERROR',
          'plausible',
        );
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) {
        return {} as T;
      }

      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof AnalyticsError) {
        throw error;
      }
      throw new AnalyticsError(
        `Network error: ${(error as Error).message}`,
        'NETWORK_ERROR',
        'plausible',
      );
    }
  }

  // ===========================================================================
  // Property Management (Sites API)
  // ===========================================================================

  async createProperty(options: CreatePropertyOptions): Promise<Property> {
    // Plausible uses domain as the site ID
    const domain = options.displayName;

    interface PlausibleSite {
      domain: string;
      timezone?: string;
    }

    const site = await this.request<PlausibleSite>('/api/v1/sites', {
      method: 'POST',
      body: {
        domain,
        timezone: options.timeZone || 'Etc/UTC',
      },
    });

    return {
      id: site.domain,
      name: site.domain,
      displayName: site.domain,
      createTime: new Date().toISOString(),
      timeZone: site.timezone,
    };
  }

  async listProperties(_options?: ListPropertiesOptions): Promise<Property[]> {
    // Plausible doesn't have a list sites endpoint in the public API
    // This will need to be implemented when they add it
    throw new NotSupportedError('listProperties', 'plausible');
  }

  async getProperty(propertyId: string): Promise<Property> {
    // Plausible doesn't have a get site endpoint
    // Return a minimal property object
    return {
      id: propertyId,
      name: propertyId,
      displayName: propertyId,
      createTime: '',
    };
  }

  async updateProperty(
    _propertyId: string,
    _data: UpdatePropertyOptions,
  ): Promise<Property> {
    // Plausible doesn't support updating site settings via API
    throw new NotSupportedError('updateProperty', 'plausible');
  }

  async deleteProperty(propertyId: string): Promise<void> {
    await this.request(`/api/v1/sites/${propertyId}`, {
      method: 'DELETE',
    });
  }

  // ===========================================================================
  // Data Streams (Not supported by Plausible)
  // ===========================================================================

  async getDataStreams(_propertyId: string): Promise<DataStream[]> {
    throw new NotSupportedError('getDataStreams', 'plausible');
  }

  async createDataStream(
    _propertyId: string,
    _options: CreateDataStreamOptions,
  ): Promise<DataStream> {
    throw new NotSupportedError('createDataStream', 'plausible');
  }

  async deleteDataStream(
    _propertyId: string,
    _streamId: string,
  ): Promise<void> {
    throw new NotSupportedError('deleteDataStream', 'plausible');
  }

  // ===========================================================================
  // Custom Definitions (Not supported by Plausible via API)
  // ===========================================================================

  async getCustomDimensions(_propertyId: string): Promise<CustomDimension[]> {
    throw new NotSupportedError('getCustomDimensions', 'plausible');
  }

  async createCustomDimension(
    _propertyId: string,
    _options: CustomDimensionOptions,
  ): Promise<CustomDimension> {
    throw new NotSupportedError('createCustomDimension', 'plausible');
  }

  async archiveCustomDimension(
    _propertyId: string,
    _dimensionId: string,
  ): Promise<void> {
    throw new NotSupportedError('archiveCustomDimension', 'plausible');
  }

  async getCustomMetrics(_propertyId: string): Promise<CustomMetric[]> {
    throw new NotSupportedError('getCustomMetrics', 'plausible');
  }

  async createCustomMetric(
    _propertyId: string,
    _options: CustomMetricOptions,
  ): Promise<CustomMetric> {
    throw new NotSupportedError('createCustomMetric', 'plausible');
  }

  async archiveCustomMetric(
    _propertyId: string,
    _metricId: string,
  ): Promise<void> {
    throw new NotSupportedError('archiveCustomMetric', 'plausible');
  }

  // ===========================================================================
  // Key Events (Goals in Plausible - limited API support)
  // ===========================================================================

  async getKeyEvents(_propertyId: string): Promise<KeyEvent[]> {
    throw new NotSupportedError('getKeyEvents', 'plausible');
  }

  async createKeyEvent(
    propertyId: string,
    options: KeyEventOptions,
  ): Promise<KeyEvent> {
    // Plausible supports creating goals via API
    interface PlausibleGoal {
      id: number;
      display_name: string;
      goal_type: string;
    }

    const goal = await this.request<PlausibleGoal>(
      `/api/v1/sites/${propertyId}/goals`,
      {
        method: 'PUT',
        body: {
          goal_type: 'event',
          event_name: options.eventName,
        },
      },
    );

    return {
      id: String(goal.id),
      name: goal.display_name,
      eventName: options.eventName,
      createTime: new Date().toISOString(),
    };
  }

  async deleteKeyEvent(propertyId: string, eventId: string): Promise<void> {
    await this.request(`/api/v1/sites/${propertyId}/goals/${eventId}`, {
      method: 'DELETE',
    });
  }

  // ===========================================================================
  // Reporting (Stats API v2)
  // ===========================================================================

  async runReport(
    propertyId: string,
    options: ReportOptions,
  ): Promise<ReportResult> {
    const siteId = propertyId;
    const dateRange = options.dateRanges[0];

    // Convert to Plausible Stats API v2 format
    interface PlausibleQueryRequest {
      site_id: string;
      metrics: string[];
      date_range: [string, string];
      dimensions?: string[];
      filters?: Array<[string, string, string[]]>;
      order_by?: Array<[string, string]>;
      pagination?: {
        limit?: number;
        offset?: number;
      };
    }

    const queryBody: PlausibleQueryRequest = {
      site_id: siteId,
      metrics: options.metrics.map((m) => this.mapMetricName(m.name)),
      date_range: [dateRange.startDate, dateRange.endDate],
    };

    if (options.dimensions) {
      queryBody.dimensions = options.dimensions.map((d) =>
        this.mapDimensionName(d.name),
      );
    }

    if (options.orderBys) {
      queryBody.order_by = options.orderBys.map((o) => [
        o.metric?.metricName || o.dimension?.dimensionName || '',
        o.desc ? 'desc' : 'asc',
      ]);
    }

    if (options.limit || options.offset) {
      queryBody.pagination = {
        limit: options.limit,
        offset: options.offset,
      };
    }

    interface PlausibleQueryResponse {
      results: Array<{
        dimensions: string[];
        metrics: number[];
      }>;
      meta: {
        imports_included?: boolean;
        time_labels?: string[];
        total_rows?: number;
      };
      query: PlausibleQueryRequest;
    }

    const response = await this.request<PlausibleQueryResponse>(
      '/api/v2/query',
      {
        method: 'POST',
        body: queryBody,
      },
    );

    // Convert Plausible response to our format
    return {
      dimensionHeaders: (options.dimensions || []).map((d) => ({
        name: d.name,
      })),
      metricHeaders: options.metrics.map((m) => ({
        name: m.name,
        type: 'TYPE_INTEGER',
      })),
      rows: response.results.map((r) => ({
        dimensionValues: r.dimensions.map((v) => ({ value: String(v) })),
        metricValues: r.metrics.map((v) => ({ value: String(v) })),
      })),
      rowCount: response.meta.total_rows,
    };
  }

  async runRealtimeReport(
    propertyId: string,
    _options?: RealtimeReportOptions,
  ): Promise<ReportResult> {
    // Use the legacy v1 realtime endpoint
    interface PlausibleRealtimeResponse {
      visitors: number;
    }

    const response = await this.request<PlausibleRealtimeResponse>(
      `/api/v1/stats/realtime/visitors?site_id=${propertyId}`,
    );

    return {
      dimensionHeaders: [],
      metricHeaders: [{ name: 'activeUsers', type: 'TYPE_INTEGER' }],
      rows: [
        {
          dimensionValues: [],
          metricValues: [{ value: String(response.visitors) }],
        },
      ],
    };
  }

  async getMetrics(_propertyId: string): Promise<MetricMetadata[]> {
    // Plausible has a fixed set of metrics
    return [
      {
        apiName: 'visitors',
        uiName: 'Visitors',
        description: 'Unique visitors',
        type: 'TYPE_INTEGER',
      },
      {
        apiName: 'pageviews',
        uiName: 'Pageviews',
        description: 'Total page views',
        type: 'TYPE_INTEGER',
      },
      {
        apiName: 'bounce_rate',
        uiName: 'Bounce Rate',
        description: 'Percentage of single-page sessions',
        type: 'TYPE_FLOAT',
      },
      {
        apiName: 'visit_duration',
        uiName: 'Visit Duration',
        description: 'Average visit duration in seconds',
        type: 'TYPE_SECONDS',
      },
      {
        apiName: 'events',
        uiName: 'Events',
        description: 'Total events',
        type: 'TYPE_INTEGER',
      },
      {
        apiName: 'visits',
        uiName: 'Visits',
        description: 'Total visits (sessions)',
        type: 'TYPE_INTEGER',
      },
      {
        apiName: 'views_per_visit',
        uiName: 'Views per Visit',
        description: 'Average page views per visit',
        type: 'TYPE_FLOAT',
      },
    ];
  }

  async getDimensions(_propertyId: string): Promise<DimensionMetadata[]> {
    // Plausible has a fixed set of dimensions
    return [
      {
        apiName: 'event:page',
        uiName: 'Page',
        description: 'Page path',
      },
      {
        apiName: 'visit:source',
        uiName: 'Source',
        description: 'Traffic source',
      },
      {
        apiName: 'visit:referrer',
        uiName: 'Referrer',
        description: 'Referrer URL',
      },
      {
        apiName: 'visit:utm_source',
        uiName: 'UTM Source',
        description: 'UTM source parameter',
      },
      {
        apiName: 'visit:utm_medium',
        uiName: 'UTM Medium',
        description: 'UTM medium parameter',
      },
      {
        apiName: 'visit:utm_campaign',
        uiName: 'UTM Campaign',
        description: 'UTM campaign parameter',
      },
      {
        apiName: 'visit:device',
        uiName: 'Device',
        description: 'Device type',
      },
      {
        apiName: 'visit:browser',
        uiName: 'Browser',
        description: 'Browser name',
      },
      {
        apiName: 'visit:os',
        uiName: 'OS',
        description: 'Operating system',
      },
      {
        apiName: 'visit:country',
        uiName: 'Country',
        description: 'Country name',
      },
      {
        apiName: 'visit:city',
        uiName: 'City',
        description: 'City name',
      },
    ];
  }

  /**
   * Map GA4-style metric names to Plausible format
   */
  private mapMetricName(name: string): string {
    const mapping: Record<string, string> = {
      activeUsers: 'visitors',
      users: 'visitors',
      sessions: 'visits',
      pageviews: 'pageviews',
      bounceRate: 'bounce_rate',
      avgSessionDuration: 'visit_duration',
      events: 'events',
    };
    return mapping[name] || name;
  }

  /**
   * Map GA4-style dimension names to Plausible format
   */
  private mapDimensionName(name: string): string {
    const mapping: Record<string, string> = {
      pagePath: 'event:page',
      page: 'event:page',
      source: 'visit:source',
      medium: 'visit:utm_medium',
      campaign: 'visit:utm_campaign',
      country: 'visit:country',
      city: 'visit:city',
      deviceCategory: 'visit:device',
      browser: 'visit:browser',
      operatingSystem: 'visit:os',
    };
    return mapping[name] || name;
  }

  // ===========================================================================
  // Event Tracking (Events API)
  // ===========================================================================

  async track(event: TrackEvent): Promise<void> {
    const siteId = this.options.defaultSiteId;

    if (!siteId) {
      throw new AnalyticsError(
        'Default site ID is required for server-side tracking',
        'MISSING_SITE_ID',
        'plausible',
      );
    }

    // Plausible Events API requires specific headers
    await this.request('/api/event', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PlausibleBot/1.0)',
        'X-Forwarded-For': '127.0.0.1', // Will be overwritten by actual IP in production
      },
      body: {
        name: event.name,
        url: `https://${siteId}`,
        domain: siteId,
        props: event.params,
      },
    });
  }

  async trackPageview(pageview: PageviewEvent): Promise<void> {
    const siteId = this.options.defaultSiteId;

    if (!siteId) {
      throw new AnalyticsError(
        'Default site ID is required for server-side tracking',
        'MISSING_SITE_ID',
        'plausible',
      );
    }

    await this.request('/api/event', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PlausibleBot/1.0)',
        'X-Forwarded-For': '127.0.0.1',
      },
      body: {
        name: 'pageview',
        url: pageview.pageLocation || `https://${siteId}${pageview.pagePath}`,
        domain: siteId,
        props: pageview.params,
      },
    });
  }

  async trackBatch(events: TrackEvent[]): Promise<void> {
    // Plausible doesn't have a batch API, so we send events sequentially
    for (const event of events) {
      await this.track(event);
    }
  }

  async identify(
    _userId: string,
    _traits?: Record<string, unknown>,
  ): Promise<void> {
    // Plausible is privacy-focused and doesn't support user identification
    throw new NotSupportedError('identify', 'plausible');
  }

  // ===========================================================================
  // Client-Side Helpers
  // ===========================================================================

  generateTrackingSnippet(
    propertyId: string,
    _options?: SnippetOptions,
  ): TrackingSnippet {
    const domain = propertyId;
    const scriptUrl = `${this.baseUrl}/js/script.js`;

    // Plausible supports various script extensions
    const _scriptPath = 'script.js';
    const _extensions: string[] = [];

    // Note: These would need to be configured based on Plausible plan features
    // For now, using the basic script

    const html = `<script defer data-domain="${domain}" src="${scriptUrl}"></script>`;

    return {
      html,
      config: {
        domain,
        scriptUrl,
      },
      scripts: [scriptUrl],
    };
  }

  generateConfig(
    propertyId: string,
    _options?: ConfigOptions,
  ): Record<string, unknown> {
    return {
      domain: propertyId,
      apiHost: this.baseUrl,
    };
  }

  // ===========================================================================
  // Provider Info
  // ===========================================================================

  async getCapabilities(): Promise<AnalyticsCapabilities> {
    return {
      propertyManagement: true, // Limited - create and delete only
      dataStreams: false,
      customDimensions: false, // Via UI only
      customMetrics: false,
      keyEvents: true, // Goals
      reporting: true,
      realtimeReporting: true,
      serverSideTracking: true,
      clientSideSnippet: true,
      userIdentification: false, // Privacy-focused
      batchTracking: false, // No batch API
    };
  }
}
