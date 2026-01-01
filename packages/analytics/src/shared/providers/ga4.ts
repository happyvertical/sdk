/**
 * Google Analytics 4 provider implementation
 *
 * Uses three APIs internally:
 * - Admin API: Property management, data streams, custom definitions
 * - Data API: Reports and analytics queries
 * - Measurement Protocol: Server-side event tracking
 */

import { readFile } from 'node:fs/promises';
import {
  type analyticsadmin_v1beta,
  type analyticsdata_v1beta,
  google,
} from 'googleapis';

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
  GA4Options,
  KeyEvent,
  KeyEventOptions,
  MetricMetadata,
  PageviewEvent,
  Property,
  RealtimeReportOptions,
  ReportOptions,
  ReportResult,
  ServiceAccountCredentials,
  SnippetOptions,
  TrackEvent,
  TrackingSnippet,
  UpdatePropertyOptions,
} from '../types.js';
import {
  AnalyticsError,
  AuthenticationError,
  PropertyNotFoundError,
  QuotaExceededError,
  RateLimitError,
} from '../types.js';

/**
 * Measurement Protocol endpoint
 */
const MEASUREMENT_PROTOCOL_URL = 'https://www.google-analytics.com/mp/collect';

/**
 * Convert null to undefined for optional fields
 * Google APIs return null for missing fields, but our types use undefined
 */
function _nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

/**
 * Google Analytics 4 provider
 */
export class GA4Provider implements AnalyticsInterface {
  private adminClient: analyticsadmin_v1beta.Analyticsadmin | null = null;
  private dataClient: analyticsdata_v1beta.Analyticsdata | null = null;
  private options: GA4Options;
  private credentials: ServiceAccountCredentials | null = null;

  constructor(options: GA4Options) {
    this.options = {
      timeout: 30000,
      maxRetries: 3,
      cacheTTL: 3600000, // 1 hour
      ...options,
    };
  }

  /**
   * Initialize Google API clients with service account credentials
   */
  private async ensureClients(): Promise<void> {
    if (this.adminClient && this.dataClient) {
      return;
    }

    // Load credentials if needed
    if (!this.credentials && this.options.serviceAccountKey) {
      if (typeof this.options.serviceAccountKey === 'string') {
        // It's a file path, read and parse
        const content = await readFile(this.options.serviceAccountKey, 'utf-8');
        this.credentials = JSON.parse(content) as ServiceAccountCredentials;
      } else {
        this.credentials = this.options.serviceAccountKey;
      }
    }

    if (!this.credentials) {
      throw new AuthenticationError('ga4');
    }

    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials: this.credentials,
      scopes: [
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/analytics.edit',
      ],
    });

    // Initialize Admin API client
    this.adminClient = google.analyticsadmin({
      version: 'v1beta',
      auth,
    });

    // Initialize Data API client
    this.dataClient = google.analyticsdata({
      version: 'v1beta',
      auth,
    });
  }

  /**
   * Normalize property ID to numeric format
   */
  private normalizePropertyId(propertyId: string): string {
    // Remove 'properties/' prefix if present
    return propertyId.replace(/^properties\//, '');
  }

  /**
   * Get full property resource name
   */
  private getPropertyName(propertyId: string): string {
    const id = this.normalizePropertyId(propertyId);
    return `properties/${id}`;
  }

  /**
   * Map Google API errors to our error types
   */
  private mapError(error: unknown): AnalyticsError {
    if (error instanceof AnalyticsError) {
      return error;
    }

    const err = error as { code?: number; message?: string; status?: number };
    const status = err.code || err.status;
    const message = err.message || 'Unknown error';

    switch (status) {
      case 401:
      case 403:
        return new AuthenticationError('ga4');
      case 404:
        return new PropertyNotFoundError(message, 'ga4');
      case 429:
        return new RateLimitError('ga4');
      case 402:
        return new QuotaExceededError('ga4');
      default:
        return new AnalyticsError(message, 'API_ERROR', 'ga4');
    }
  }

  // ===========================================================================
  // Property Management
  // ===========================================================================

  async createProperty(options: CreatePropertyOptions): Promise<Property> {
    await this.ensureClients();

    if (!options.parent) {
      throw new AnalyticsError(
        'Parent account is required for creating GA4 properties',
        'MISSING_PARENT',
        'ga4',
      );
    }

    try {
      const response = await this.adminClient?.properties.create({
        requestBody: {
          displayName: options.displayName,
          timeZone: options.timeZone || 'America/Los_Angeles',
          currencyCode: options.currencyCode || 'USD',
          industryCategory: options.industryCategory,
          parent: options.parent,
        },
      });

      const property = response.data;
      return {
        id: property.name?.replace('properties/', '') || '',
        name: property.name || '',
        displayName: property.displayName || '',
        createTime: property.createTime || new Date().toISOString(),
        updateTime: property.updateTime ?? undefined,
        timeZone: property.timeZone ?? undefined,
        currencyCode: property.currencyCode ?? undefined,
        industryCategory: property.industryCategory ?? undefined,
        serviceLevel: property.serviceLevel as
          | 'STANDARD'
          | 'PREMIUM'
          | undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async listProperties(): Promise<Property[]> {
    await this.ensureClients();

    try {
      const response = await this.adminClient?.properties.list({
        filter: 'ancestor:accounts/-',
        showDeleted: false,
      });

      return (response.data.properties || []).map(
        (
          p: analyticsadmin_v1beta.Schema$GoogleAnalyticsAdminV1betaProperty,
        ) => ({
          id: p.name?.replace('properties/', '') || '',
          name: p.name || '',
          displayName: p.displayName || '',
          createTime: p.createTime || '',
          updateTime: p.updateTime ?? undefined,
          timeZone: p.timeZone ?? undefined,
          currencyCode: p.currencyCode ?? undefined,
          industryCategory: p.industryCategory ?? undefined,
          serviceLevel: p.serviceLevel as 'STANDARD' | 'PREMIUM' | undefined,
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getProperty(propertyId: string): Promise<Property> {
    await this.ensureClients();

    try {
      const response = await this.adminClient?.properties.get({
        name: this.getPropertyName(propertyId),
      });

      const p = response.data;
      return {
        id: p.name?.replace('properties/', '') || '',
        name: p.name || '',
        displayName: p.displayName || '',
        createTime: p.createTime || '',
        updateTime: p.updateTime ?? undefined,
        timeZone: p.timeZone ?? undefined,
        currencyCode: p.currencyCode ?? undefined,
        industryCategory: p.industryCategory ?? undefined,
        serviceLevel: p.serviceLevel as 'STANDARD' | 'PREMIUM' | undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async updateProperty(
    propertyId: string,
    data: UpdatePropertyOptions,
  ): Promise<Property> {
    await this.ensureClients();

    const updateMask: string[] = [];
    if (data.displayName) updateMask.push('displayName');
    if (data.timeZone) updateMask.push('timeZone');
    if (data.currencyCode) updateMask.push('currencyCode');
    if (data.industryCategory) updateMask.push('industryCategory');

    try {
      const response = await this.adminClient?.properties.patch({
        name: this.getPropertyName(propertyId),
        updateMask: updateMask.join(','),
        requestBody: {
          displayName: data.displayName,
          timeZone: data.timeZone,
          currencyCode: data.currencyCode,
          industryCategory: data.industryCategory,
        },
      });

      const p = response.data;
      return {
        id: p.name?.replace('properties/', '') || '',
        name: p.name || '',
        displayName: p.displayName || '',
        createTime: p.createTime || '',
        updateTime: p.updateTime ?? undefined,
        timeZone: p.timeZone ?? undefined,
        currencyCode: p.currencyCode ?? undefined,
        industryCategory: p.industryCategory ?? undefined,
        serviceLevel: p.serviceLevel as 'STANDARD' | 'PREMIUM' | undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async deleteProperty(propertyId: string): Promise<void> {
    await this.ensureClients();

    try {
      await this.adminClient?.properties.delete({
        name: this.getPropertyName(propertyId),
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ===========================================================================
  // Data Streams
  // ===========================================================================

  async getDataStreams(propertyId: string): Promise<DataStream[]> {
    await this.ensureClients();

    try {
      const response = await this.adminClient?.properties.dataStreams.list({
        parent: this.getPropertyName(propertyId),
      });

      return (response.data.dataStreams || []).map(
        (
          ds: analyticsadmin_v1beta.Schema$GoogleAnalyticsAdminV1betaDataStream,
        ) => ({
          id: ds.name?.split('/').pop() || '',
          type: ds.type as DataStream['type'],
          displayName: ds.displayName || '',
          measurementId: ds.webStreamData?.measurementId ?? undefined,
          firebaseAppId:
            ds.androidAppStreamData?.firebaseAppId ??
            ds.iosAppStreamData?.firebaseAppId ??
            undefined,
          defaultUri: ds.webStreamData?.defaultUri ?? undefined,
          createTime: ds.createTime || '',
          updateTime: ds.updateTime ?? undefined,
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async createDataStream(
    propertyId: string,
    options: CreateDataStreamOptions,
  ): Promise<DataStream> {
    await this.ensureClients();

    try {
      const requestBody: analyticsadmin_v1beta.Schema$GoogleAnalyticsAdminV1betaDataStream =
        {
          type: options.type,
          displayName: options.displayName,
        };

      if (options.type === 'WEB_DATA_STREAM') {
        requestBody.webStreamData = {
          defaultUri: options.defaultUri,
        };
      } else if (options.type === 'ANDROID_APP_DATA_STREAM') {
        requestBody.androidAppStreamData = {
          packageName: options.packageName,
        };
      } else if (options.type === 'IOS_APP_DATA_STREAM') {
        requestBody.iosAppStreamData = {
          bundleId: options.bundleId,
        };
      }

      const response = await this.adminClient?.properties.dataStreams.create({
        parent: this.getPropertyName(propertyId),
        requestBody,
      });

      const ds = response.data;
      return {
        id: ds.name?.split('/').pop() || '',
        type: ds.type as DataStream['type'],
        displayName: ds.displayName || '',
        measurementId: ds.webStreamData?.measurementId ?? undefined,
        firebaseAppId:
          ds.androidAppStreamData?.firebaseAppId ??
          ds.iosAppStreamData?.firebaseAppId ??
          undefined,
        defaultUri: ds.webStreamData?.defaultUri ?? undefined,
        createTime: ds.createTime || '',
        updateTime: ds.updateTime ?? undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async deleteDataStream(propertyId: string, streamId: string): Promise<void> {
    await this.ensureClients();

    try {
      await this.adminClient?.properties.dataStreams.delete({
        name: `${this.getPropertyName(propertyId)}/dataStreams/${streamId}`,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ===========================================================================
  // Custom Definitions
  // ===========================================================================

  async getCustomDimensions(propertyId: string): Promise<CustomDimension[]> {
    await this.ensureClients();

    try {
      const response = await this.adminClient?.properties.customDimensions.list(
        {
          parent: this.getPropertyName(propertyId),
        },
      );

      return (response.data.customDimensions || []).map(
        (
          cd: analyticsadmin_v1beta.Schema$GoogleAnalyticsAdminV1betaCustomDimension,
        ) => ({
          id: cd.name?.split('/').pop() || '',
          name: cd.name || '',
          parameterName: cd.parameterName || '',
          displayName: cd.displayName || '',
          description: cd.description ?? undefined,
          scope: cd.scope as CustomDimension['scope'],
          disallowAdsPersonalization:
            cd.disallowAdsPersonalization ?? undefined,
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async createCustomDimension(
    propertyId: string,
    options: CustomDimensionOptions,
  ): Promise<CustomDimension> {
    await this.ensureClients();

    try {
      const response =
        await this.adminClient?.properties.customDimensions.create({
          parent: this.getPropertyName(propertyId),
          requestBody: {
            parameterName: options.parameterName,
            displayName: options.displayName,
            description: options.description,
            scope: options.scope,
            disallowAdsPersonalization: options.disallowAdsPersonalization,
          },
        });

      const cd = response.data;
      return {
        id: cd.name?.split('/').pop() || '',
        name: cd.name || '',
        parameterName: cd.parameterName || '',
        displayName: cd.displayName || '',
        description: cd.description ?? undefined,
        scope: cd.scope as CustomDimension['scope'],
        disallowAdsPersonalization: cd.disallowAdsPersonalization ?? undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async archiveCustomDimension(
    propertyId: string,
    dimensionId: string,
  ): Promise<void> {
    await this.ensureClients();

    try {
      await this.adminClient?.properties.customDimensions.archive({
        name: `${this.getPropertyName(propertyId)}/customDimensions/${dimensionId}`,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getCustomMetrics(propertyId: string): Promise<CustomMetric[]> {
    await this.ensureClients();

    try {
      const response = await this.adminClient?.properties.customMetrics.list({
        parent: this.getPropertyName(propertyId),
      });

      return (response.data.customMetrics || []).map(
        (
          cm: analyticsadmin_v1beta.Schema$GoogleAnalyticsAdminV1betaCustomMetric,
        ) => ({
          id: cm.name?.split('/').pop() || '',
          name: cm.name || '',
          parameterName: cm.parameterName || '',
          displayName: cm.displayName || '',
          description: cm.description ?? undefined,
          scope: 'EVENT' as const,
          measurementUnit:
            cm.measurementUnit as CustomMetric['measurementUnit'],
          restrictedMetricType:
            (cm
              .restrictedMetricType?.[0] as CustomMetric['restrictedMetricType']) ??
            undefined,
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async createCustomMetric(
    propertyId: string,
    options: CustomMetricOptions,
  ): Promise<CustomMetric> {
    await this.ensureClients();

    try {
      const response = await this.adminClient?.properties.customMetrics.create({
        parent: this.getPropertyName(propertyId),
        requestBody: {
          parameterName: options.parameterName,
          displayName: options.displayName,
          description: options.description,
          measurementUnit: options.measurementUnit,
          restrictedMetricType: options.restrictedMetricType
            ? [options.restrictedMetricType]
            : undefined,
          scope: 'EVENT',
        },
      });

      const cm = response.data!;
      return {
        id: cm.name?.split('/').pop() || '',
        name: cm.name || '',
        parameterName: cm.parameterName || '',
        displayName: cm.displayName || '',
        description: cm.description ?? undefined,
        scope: 'EVENT' as const,
        measurementUnit: cm.measurementUnit as CustomMetric['measurementUnit'],
        restrictedMetricType:
          (cm
            .restrictedMetricType?.[0] as CustomMetric['restrictedMetricType']) ??
          undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async archiveCustomMetric(
    propertyId: string,
    metricId: string,
  ): Promise<void> {
    await this.ensureClients();

    try {
      await this.adminClient?.properties.customMetrics.archive({
        name: `${this.getPropertyName(propertyId)}/customMetrics/${metricId}`,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ===========================================================================
  // Key Events (Conversions)
  // ===========================================================================

  async getKeyEvents(propertyId: string): Promise<KeyEvent[]> {
    await this.ensureClients();

    try {
      const response = await this.adminClient?.properties.keyEvents.list({
        parent: this.getPropertyName(propertyId),
      });

      return (response.data.keyEvents || []).map(
        (
          ke: analyticsadmin_v1beta.Schema$GoogleAnalyticsAdminV1betaKeyEvent,
        ) => ({
          id: ke.name?.split('/').pop() || '',
          name: ke.name || '',
          eventName: ke.eventName || '',
          createTime: ke.createTime || '',
          countingMethod: ke.countingMethod as KeyEvent['countingMethod'],
          defaultValue: ke.defaultValue
            ? {
                numericValue: ke.defaultValue.numericValue ?? undefined,
                currencyCode: ke.defaultValue.currencyCode ?? undefined,
              }
            : undefined,
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async createKeyEvent(
    propertyId: string,
    options: KeyEventOptions,
  ): Promise<KeyEvent> {
    await this.ensureClients();

    try {
      const response = await this.adminClient?.properties.keyEvents.create({
        parent: this.getPropertyName(propertyId),
        requestBody: {
          eventName: options.eventName,
          countingMethod: options.countingMethod,
          defaultValue: options.defaultValue,
        },
      });

      const ke = response.data;
      return {
        id: ke.name?.split('/').pop() || '',
        name: ke.name || '',
        eventName: ke.eventName || '',
        createTime: ke.createTime || '',
        countingMethod: ke.countingMethod as KeyEvent['countingMethod'],
        defaultValue: ke.defaultValue
          ? {
              numericValue: ke.defaultValue.numericValue ?? undefined,
              currencyCode: ke.defaultValue.currencyCode ?? undefined,
            }
          : undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async deleteKeyEvent(propertyId: string, eventId: string): Promise<void> {
    await this.ensureClients();

    try {
      await this.adminClient?.properties.keyEvents.delete({
        name: `${this.getPropertyName(propertyId)}/keyEvents/${eventId}`,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ===========================================================================
  // Reporting
  // ===========================================================================

  async runReport(
    propertyId: string,
    options: ReportOptions,
  ): Promise<ReportResult> {
    await this.ensureClients();

    try {
      const response = await this.dataClient?.properties.runReport({
        property: this.getPropertyName(propertyId),
        requestBody: {
          dateRanges: options.dateRanges,
          dimensions: options.dimensions,
          metrics: options.metrics,
          dimensionFilter: options.dimensionFilter,
          metricFilter: options.metricFilter,
          offset: options.offset ? String(options.offset) : undefined,
          limit: options.limit ? String(options.limit) : undefined,
          orderBys: options.orderBys,
          keepEmptyRows: options.keepEmptyRows,
          returnPropertyQuota: options.returnPropertyQuota,
        },
      });

      const data = response.data;
      return {
        dimensionHeaders: (data.dimensionHeaders || []).map(
          (h: analyticsdata_v1beta.Schema$DimensionHeader) => ({
            name: h.name || '',
          }),
        ),
        metricHeaders: (data.metricHeaders || []).map(
          (h: analyticsdata_v1beta.Schema$MetricHeader) => ({
            name: h.name || '',
            type: h.type || '',
          }),
        ),
        rows: (data.rows || []).map((r: analyticsdata_v1beta.Schema$Row) => ({
          dimensionValues: (r.dimensionValues || []).map(
            (v: analyticsdata_v1beta.Schema$DimensionValue) => ({
              value: v.value || '',
            }),
          ),
          metricValues: (r.metricValues || []).map(
            (v: analyticsdata_v1beta.Schema$MetricValue) => ({
              value: v.value || '',
            }),
          ),
        })),
        rowCount: data.rowCount ?? undefined,
        metadata: data.metadata
          ? {
              currencyCode: data.metadata.currencyCode ?? undefined,
              timeZone: data.metadata.timeZone ?? undefined,
              dataLossFromOtherRow:
                data.metadata.dataLossFromOtherRow ?? undefined,
              emptyReason: data.metadata.emptyReason ?? undefined,
            }
          : undefined,
        propertyQuota: data.propertyQuota
          ? {
              tokensPerDay: {
                consumed: data.propertyQuota.tokensPerDay?.consumed || 0,
                remaining: data.propertyQuota.tokensPerDay?.remaining || 0,
              },
              tokensPerHour: {
                consumed: data.propertyQuota.tokensPerHour?.consumed || 0,
                remaining: data.propertyQuota.tokensPerHour?.remaining || 0,
              },
              concurrentRequests: {
                consumed: data.propertyQuota.concurrentRequests?.consumed || 0,
                remaining:
                  data.propertyQuota.concurrentRequests?.remaining || 0,
              },
            }
          : undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async runRealtimeReport(
    propertyId: string,
    options?: RealtimeReportOptions,
  ): Promise<ReportResult> {
    await this.ensureClients();

    try {
      const response = await this.dataClient?.properties.runRealtimeReport({
        property: this.getPropertyName(propertyId),
        requestBody: {
          dimensions: options?.dimensions,
          metrics: options?.metrics || [{ name: 'activeUsers' }],
          dimensionFilter: options?.dimensionFilter,
          metricFilter: options?.metricFilter,
          limit: options?.limit ? String(options.limit) : undefined,
          minuteRanges: options?.minuteRanges,
        },
      });

      const data = response.data;
      return {
        dimensionHeaders: (data.dimensionHeaders || []).map(
          (h: analyticsdata_v1beta.Schema$DimensionHeader) => ({
            name: h.name || '',
          }),
        ),
        metricHeaders: (data.metricHeaders || []).map(
          (h: analyticsdata_v1beta.Schema$MetricHeader) => ({
            name: h.name || '',
            type: h.type || '',
          }),
        ),
        rows: (data.rows || []).map((r: analyticsdata_v1beta.Schema$Row) => ({
          dimensionValues: (r.dimensionValues || []).map(
            (v: analyticsdata_v1beta.Schema$DimensionValue) => ({
              value: v.value || '',
            }),
          ),
          metricValues: (r.metricValues || []).map(
            (v: analyticsdata_v1beta.Schema$MetricValue) => ({
              value: v.value || '',
            }),
          ),
        })),
        rowCount: data.rowCount ?? undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getMetrics(propertyId: string): Promise<MetricMetadata[]> {
    await this.ensureClients();

    try {
      const response = await this.dataClient?.properties.getMetadata({
        name: `${this.getPropertyName(propertyId)}/metadata`,
      });

      return (response.data.metrics || []).map(
        (m: analyticsdata_v1beta.Schema$MetricMetadata) => ({
          apiName: m.apiName || '',
          uiName: m.uiName || '',
          description: m.description || '',
          deprecatedApiNames: m.deprecatedApiNames ?? undefined,
          type: m.type as MetricMetadata['type'],
          expression: m.expression ?? undefined,
          customDefinition: m.customDefinition ?? undefined,
          blockedReasons: m.blockedReasons ?? undefined,
          category: m.category ?? undefined,
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getDimensions(propertyId: string): Promise<DimensionMetadata[]> {
    await this.ensureClients();

    try {
      const response = await this.dataClient?.properties.getMetadata({
        name: `${this.getPropertyName(propertyId)}/metadata`,
      });

      return (response.data.dimensions || []).map(
        (d: analyticsdata_v1beta.Schema$DimensionMetadata) => ({
          apiName: d.apiName || '',
          uiName: d.uiName || '',
          description: d.description || '',
          deprecatedApiNames: d.deprecatedApiNames ?? undefined,
          customDefinition: d.customDefinition ?? undefined,
          category: d.category ?? undefined,
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ===========================================================================
  // Event Tracking (Measurement Protocol)
  // ===========================================================================

  async track(event: TrackEvent): Promise<void> {
    if (!this.options.measurementId || !this.options.apiSecret) {
      throw new AnalyticsError(
        'Measurement ID and API Secret are required for server-side tracking',
        'MISSING_CREDENTIALS',
        'ga4',
      );
    }

    const clientId = event.clientId || this.generateClientId();
    const url = `${MEASUREMENT_PROTOCOL_URL}?measurement_id=${this.options.measurementId}&api_secret=${this.options.apiSecret}`;

    const payload = {
      client_id: clientId,
      user_id: event.userId,
      timestamp_micros: event.timestamp,
      non_personalized_ads: event.nonPersonalizedAds,
      events: [
        {
          name: event.name,
          params: event.params,
        },
      ],
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new AnalyticsError(
          `Measurement Protocol error: ${response.status}`,
          'TRACKING_ERROR',
          'ga4',
        );
      }
    } catch (error) {
      if (error instanceof AnalyticsError) {
        throw error;
      }
      throw this.mapError(error);
    }
  }

  async trackPageview(pageview: PageviewEvent): Promise<void> {
    await this.track({
      name: 'page_view',
      params: {
        page_path: pageview.pagePath,
        page_title: pageview.pageTitle || '',
        page_location: pageview.pageLocation || '',
        ...pageview.params,
      },
      clientId: pageview.clientId,
      userId: pageview.userId,
    });
  }

  async trackBatch(events: TrackEvent[]): Promise<void> {
    if (!this.options.measurementId || !this.options.apiSecret) {
      throw new AnalyticsError(
        'Measurement ID and API Secret are required for server-side tracking',
        'MISSING_CREDENTIALS',
        'ga4',
      );
    }

    // GA4 Measurement Protocol supports up to 25 events per request
    const batchSize = 25;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      // Group by client_id
      const byClient = new Map<string, TrackEvent[]>();
      for (const event of batch) {
        const clientId = event.clientId || this.generateClientId();
        const existing = byClient.get(clientId) || [];
        existing.push(event);
        byClient.set(clientId, existing);
      }

      // Send one request per client
      for (const [clientId, clientEvents] of byClient) {
        const url = `${MEASUREMENT_PROTOCOL_URL}?measurement_id=${this.options.measurementId}&api_secret=${this.options.apiSecret}`;

        const payload = {
          client_id: clientId,
          events: clientEvents.map((e) => ({
            name: e.name,
            params: e.params,
          })),
        };

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new AnalyticsError(
              `Measurement Protocol error: ${response.status}`,
              'TRACKING_ERROR',
              'ga4',
            );
          }
        } catch (error) {
          if (error instanceof AnalyticsError) {
            throw error;
          }
          throw this.mapError(error);
        }
      }
    }
  }

  async identify(
    userId: string,
    traits?: Record<string, unknown>,
  ): Promise<void> {
    // GA4 uses user_id and user properties
    // Send a synthetic event to associate user properties
    await this.track({
      name: 'user_engagement',
      userId,
      params: traits as Record<string, string | number | boolean> | undefined,
    });
  }

  /**
   * Generate a random client ID for Measurement Protocol
   */
  private generateClientId(): string {
    return `${Math.floor(Math.random() * 2147483647)}.${Math.floor(Date.now() / 1000)}`;
  }

  // ===========================================================================
  // Client-Side Helpers
  // ===========================================================================

  generateTrackingSnippet(
    propertyId: string,
    options?: SnippetOptions,
  ): TrackingSnippet {
    const measurementId = this.options.measurementId || `G-${propertyId}`;

    const configOptions: Record<string, unknown> = {};
    if (options?.anonymizeIp) {
      configOptions.anonymize_ip = true;
    }
    if (options?.sendPageView === false) {
      configOptions.send_page_view = false;
    }
    if (options?.cookieFlags) {
      configOptions.cookie_flags = options.cookieFlags;
    }
    if (options?.customConfig) {
      Object.assign(configOptions, options.customConfig);
    }

    const configStr =
      Object.keys(configOptions).length > 0
        ? `, ${JSON.stringify(configOptions)}`
        : '';

    const html = `<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${measurementId}'${configStr});
</script>`;

    return {
      html,
      config: {
        measurementId,
        ...configOptions,
      },
      scripts: [`https://www.googletagmanager.com/gtag/js?id=${measurementId}`],
    };
  }

  generateConfig(
    propertyId: string,
    options?: ConfigOptions,
  ): Record<string, unknown> {
    const measurementId = this.options.measurementId || `G-${propertyId}`;

    const config: Record<string, unknown> = {
      measurement_id: measurementId,
    };

    if (options?.anonymizeIp) {
      config.anonymize_ip = true;
    }
    if (options?.sendPageView === false) {
      config.send_page_view = false;
    }
    if (options?.userId) {
      config.user_id = options.userId;
    }
    if (options?.customDimensions) {
      Object.entries(options.customDimensions).forEach(([key, value]) => {
        config[key] = value;
      });
    }

    return config;
  }

  // ===========================================================================
  // Provider Info
  // ===========================================================================

  async getCapabilities(): Promise<AnalyticsCapabilities> {
    return {
      propertyManagement: true,
      dataStreams: true,
      customDimensions: true,
      customMetrics: true,
      keyEvents: true,
      reporting: true,
      realtimeReporting: true,
      serverSideTracking: true,
      clientSideSnippet: true,
      userIdentification: true,
      batchTracking: true,
    };
  }
}
