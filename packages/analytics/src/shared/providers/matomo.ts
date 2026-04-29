/**
 * Matomo Analytics provider implementation.
 *
 * This first cut implements:
 * - The full `AnalyticsAdminInterface` (sites, users, access, tokens, health)
 *   via {@link MatomoAdmin}. This is the API the tenant doctor uses.
 * - The `AnalyticsInterface` property-management surface, by delegating to the
 *   admin (a Matomo "site" maps 1:1 to a GA4-style "property").
 * - Capabilities and tracking-snippet generation.
 *
 * Reporting (`runReport`/`runRealtimeReport`) and server-side tracking
 * (`track`/`trackPageview`) are intentionally left as `NotSupportedError` for
 * this slice. They land in a follow-up — they hit different Matomo endpoints
 * (`Live.*`, `VisitsSummary.*`, `/matomo.php`) and warrant their own tests.
 *
 * GA4-specific concepts that don't translate cleanly (data streams, custom
 * dimensions/metrics, key events) throw `NotSupportedError`. Matomo has its
 * own analogues (goals, custom dimensions plugin) — they need a different
 * shape and don't belong on the GA4-shaped methods.
 */

import {
  type AnalyticsCapabilities,
  type AnalyticsInterface,
  type ConfigOptions,
  type CreateDataStreamOptions,
  type CreatePropertyOptions,
  type CustomDimension,
  type CustomDimensionOptions,
  type CustomMetric,
  type CustomMetricOptions,
  type DataStream,
  type DimensionMetadata,
  type KeyEvent,
  type KeyEventOptions,
  type ListPropertiesOptions,
  type MatomoOptions,
  type MetricMetadata,
  NotSupportedError,
  type PageviewEvent,
  type Property,
  PropertyNotFoundError,
  type RealtimeReportOptions,
  type ReportOptions,
  type ReportResult,
  type SnippetOptions,
  type TrackEvent,
  type TrackingSnippet,
  type UpdatePropertyOptions,
} from '../types.js';
import {
  MatomoAdmin,
  MatomoAdminTransport,
  normalizeMatomoBaseUrl,
} from './matomo-admin.js';

const PROVIDER = 'matomo';

export class MatomoProvider implements AnalyticsInterface {
  private readonly options: MatomoOptions;
  private readonly baseUrl: string;
  private readonly reportingTransport: MatomoAdminTransport;
  public readonly admin: MatomoAdmin;

  constructor(options: MatomoOptions) {
    this.options = options;
    this.baseUrl = normalizeMatomoBaseUrl(options.baseUrl);
    this.reportingTransport = new MatomoAdminTransport({
      baseUrl: this.baseUrl,
      tokenAuth: options.tokenAuth,
      timeout: options.timeout,
    });
    this.admin = new MatomoAdmin({
      baseUrl: this.baseUrl,
      tokenAuth: options.tokenAuth,
      timeout: options.timeout,
    });
  }

  // ---------------------------------------------------------------------------
  // Property management — delegated to admin (site === property in Matomo)
  // ---------------------------------------------------------------------------

  createProperty(_options: CreatePropertyOptions): Promise<Property> {
    // GA4's CreatePropertyOptions doesn't carry a website URL. Matomo
    // mandates one on every site, so use `admin.createSite({ urls: [...] })`
    // directly rather than overloading this method.
    throw new NotSupportedError(
      'createProperty (use admin.createSite instead)',
      PROVIDER,
    );
  }

  async listProperties(_options?: ListPropertiesOptions): Promise<Property[]> {
    const sites = await this.admin.listSites();
    return sites.map((site) => propertyFromSite(site));
  }

  async getProperty(propertyId: string): Promise<Property> {
    const site = await this.admin.getSite(propertyId);
    if (!site) {
      throw new PropertyNotFoundError(propertyId, PROVIDER);
    }
    return propertyFromSite(site);
  }

  async updateProperty(
    _propertyId: string,
    _data: UpdatePropertyOptions,
  ): Promise<Property> {
    // SitesManager.updateSite exists; landing it requires shaping the
    // GA4-style fields onto Matomo's params (siteName/urls/timezone/...).
    // Deferred to the reporting follow-up where we round-trip these fields.
    throw new NotSupportedError('updateProperty', PROVIDER);
  }

  async deleteProperty(propertyId: string): Promise<void> {
    await this.admin.deleteSite(propertyId);
  }

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------

  async getCapabilities(): Promise<AnalyticsCapabilities> {
    return {
      propertyManagement: true,
      dataStreams: false,
      customDimensions: false,
      customMetrics: false,
      keyEvents: false,
      reporting: true,
      realtimeReporting: true,
      serverSideTracking: false,
      clientSideSnippet: true,
      userIdentification: false,
      batchTracking: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Client-side snippet
  // ---------------------------------------------------------------------------

  /**
   * Generate a Matomo `_paq` tracking snippet.
   *
   * Note on `SnippetOptions.anonymizeIp`: Matomo handles IP anonymization
   * **server-side** via the PrivacyManager plugin (Matomo admin → Privacy →
   * Anonymize visitors' IP addresses). The JS tracker has no equivalent
   * client-side directive — `setDoNotTrack` respects the browser's DNT
   * signal but does not anonymize IPs, so we deliberately do not emit it
   * here. The flag is preserved on the returned `config` object as a
   * caller-visible signal, but its enforcement is the operator's
   * responsibility on the Matomo install.
   */
  generateTrackingSnippet(
    propertyId: string,
    options: SnippetOptions = {},
  ): TrackingSnippet {
    const trackerUrl = `${this.baseUrl}/matomo.php`;
    const scriptUrl = `${this.baseUrl}/matomo.js`;
    const sendPageView = options.sendPageView ?? true;

    const lines: string[] = ['var _paq = window._paq = window._paq || [];'];
    if (sendPageView) {
      lines.push("_paq.push(['trackPageView']);");
    }
    lines.push("_paq.push(['enableLinkTracking']);");
    if (options.customConfig) {
      for (const [key, value] of Object.entries(options.customConfig)) {
        lines.push(
          `_paq.push([${JSON.stringify(key)}, ${JSON.stringify(value)}]);`,
        );
      }
    }
    lines.push(
      `(function() { var u=${JSON.stringify(`${this.baseUrl}/`)};` +
        ` _paq.push(['setTrackerUrl', u+'matomo.php']);` +
        ` _paq.push(['setSiteId', ${JSON.stringify(propertyId)}]);` +
        ` var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];` +
        ` g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s); })();`,
    );

    return {
      html: `<script>\n${lines.join('\n')}\n</script>`,
      config: {
        trackerUrl,
        scriptUrl,
        siteId: propertyId,
        anonymizeIp: !!options.anonymizeIp,
        sendPageView,
      },
      scripts: [scriptUrl],
    };
  }

  generateConfig(
    propertyId: string,
    options: ConfigOptions = {},
  ): Record<string, unknown> {
    return {
      trackerUrl: `${this.baseUrl}/matomo.php`,
      scriptUrl: `${this.baseUrl}/matomo.js`,
      siteId: propertyId,
      anonymizeIp: !!options.anonymizeIp,
      sendPageView: options.sendPageView ?? true,
      userId: options.userId,
      customDimensions: options.customDimensions,
    };
  }

  // ---------------------------------------------------------------------------
  // Methods deferred to a follow-up PR — they have meaningful Matomo analogues
  // but warrant their own tests and a wider review surface.
  // ---------------------------------------------------------------------------

  getDataStreams(_propertyId: string): Promise<DataStream[]> {
    throw new NotSupportedError('dataStreams', PROVIDER);
  }
  createDataStream(
    _propertyId: string,
    _options: CreateDataStreamOptions,
  ): Promise<DataStream> {
    throw new NotSupportedError('dataStreams', PROVIDER);
  }
  deleteDataStream(_propertyId: string, _streamId: string): Promise<void> {
    throw new NotSupportedError('dataStreams', PROVIDER);
  }
  getCustomDimensions(_propertyId: string): Promise<CustomDimension[]> {
    throw new NotSupportedError('customDimensions', PROVIDER);
  }
  createCustomDimension(
    _propertyId: string,
    _options: CustomDimensionOptions,
  ): Promise<CustomDimension> {
    throw new NotSupportedError('customDimensions', PROVIDER);
  }
  archiveCustomDimension(
    _propertyId: string,
    _dimensionId: string,
  ): Promise<void> {
    throw new NotSupportedError('customDimensions', PROVIDER);
  }
  getCustomMetrics(_propertyId: string): Promise<CustomMetric[]> {
    throw new NotSupportedError('customMetrics', PROVIDER);
  }
  createCustomMetric(
    _propertyId: string,
    _options: CustomMetricOptions,
  ): Promise<CustomMetric> {
    throw new NotSupportedError('customMetrics', PROVIDER);
  }
  archiveCustomMetric(_propertyId: string, _metricId: string): Promise<void> {
    throw new NotSupportedError('customMetrics', PROVIDER);
  }
  getKeyEvents(_propertyId: string): Promise<KeyEvent[]> {
    throw new NotSupportedError('keyEvents', PROVIDER);
  }
  createKeyEvent(
    _propertyId: string,
    _options: KeyEventOptions,
  ): Promise<KeyEvent> {
    throw new NotSupportedError('keyEvents', PROVIDER);
  }
  deleteKeyEvent(_propertyId: string, _eventId: string): Promise<void> {
    throw new NotSupportedError('keyEvents', PROVIDER);
  }
  async runReport(
    propertyId: string,
    options: ReportOptions,
  ): Promise<ReportResult> {
    const dimensions = options.dimensions ?? [];
    const metrics = options.metrics;
    const dateRange = options.dateRanges[0] ?? {
      startDate: '7daysAgo',
      endDate: 'today',
    };
    const query = matomoDateQuery(dateRange);
    const dimensionNames = dimensions.map((dimension) => dimension.name);
    const method = reportMethodForDimensions(dimensionNames);
    const response = await this.reportingTransport.call<unknown>(method, {
      idSite: propertyId,
      period: method === 'VisitsSummary.get' ? 'day' : query.period,
      date: query.date,
      filter_limit: options.limit,
      filter_offset: options.offset,
      flat: dimensionNames.some(isPageDimension) ? 1 : undefined,
    });

    const sourceRows = normalizeMatomoRows(response);
    const rows = sourceRows.map((row, index) => ({
      dimensionValues: dimensions.map((dimension) => ({
        value: dimensionValue(row, dimension.name, index),
      })),
      metricValues: metrics.map((metric) => ({
        value: metricValue(row, metric.name),
      })),
    }));

    return {
      dimensionHeaders: dimensions.map((dimension) => ({
        name: dimension.name,
      })),
      metricHeaders: metrics.map((metric) => ({
        name: metric.name,
        type: metricType(metric.name),
      })),
      rows,
      rowCount: rows.length,
    };
  }
  async runRealtimeReport(
    propertyId: string,
    options: RealtimeReportOptions = {},
  ): Promise<ReportResult> {
    const dimensions = options.dimensions ?? [];
    const metrics = options.metrics ?? [{ name: 'activeUsers' }];
    const limit = options.limit ?? 10;
    const lastMinutes = options.minuteRanges?.[0]?.startMinutesAgo ?? 30;

    if (dimensions.some(isPageDimension)) {
      const response = await this.reportingTransport.call<unknown>(
        'Live.getLastVisitsDetails',
        {
          idSite: propertyId,
          period: 'day',
          date: 'today',
          filter_limit: limit,
          lastMinutes,
        },
      );
      const rows = realtimePageRows(response, dimensions, metrics, limit);
      return {
        dimensionHeaders: dimensions.map((dimension) => ({
          name: dimension.name,
        })),
        metricHeaders: metrics.map((metric) => ({
          name: metric.name,
          type: metricType(metric.name),
        })),
        rows,
        rowCount: rows.length,
      };
    }

    const response = await this.reportingTransport.call<unknown>(
      'Live.getCounters',
      {
        idSite: propertyId,
        lastMinutes,
      },
    );
    const counters = firstRecord(response);
    const row = {
      dimensionValues: dimensions.map((dimension) => ({
        value: dimensionValue(counters, dimension.name, 0),
      })),
      metricValues: metrics.map((metric) => ({
        value: realtimeMetricValue(counters, metric.name),
      })),
    };

    return {
      dimensionHeaders: dimensions.map((dimension) => ({
        name: dimension.name,
      })),
      metricHeaders: metrics.map((metric) => ({
        name: metric.name,
        type: metricType(metric.name),
      })),
      rows: [row],
      rowCount: 1,
    };
  }
  getMetrics(_propertyId: string): Promise<MetricMetadata[]> {
    throw new NotSupportedError('getMetrics', PROVIDER);
  }
  getDimensions(_propertyId: string): Promise<DimensionMetadata[]> {
    throw new NotSupportedError('getDimensions', PROVIDER);
  }
  track(_event: TrackEvent): Promise<void> {
    throw new NotSupportedError('track', PROVIDER);
  }
  trackPageview(_pageview: PageviewEvent): Promise<void> {
    throw new NotSupportedError('trackPageview', PROVIDER);
  }
  trackBatch(_events: TrackEvent[]): Promise<void> {
    throw new NotSupportedError('trackBatch', PROVIDER);
  }
  identify(_userId: string, _traits?: Record<string, unknown>): Promise<void> {
    throw new NotSupportedError('identify', PROVIDER);
  }
}

function propertyFromSite(site: {
  id: string;
  name: string;
  url?: string;
  timezone?: string;
  currency?: string;
}): Property {
  return {
    id: site.id,
    name: `sites/${site.id}`,
    displayName: site.name,
    createTime: '',
    timeZone: site.timezone,
    currencyCode: site.currency,
  };
}

type MatomoRow = Record<string, unknown>;

function isRecord(value: unknown): value is MatomoRow {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstRecord(value: unknown): MatomoRow {
  if (Array.isArray(value)) {
    return value.find(isRecord) ?? {};
  }
  return isRecord(value) ? value : {};
}

function normalizeMatomoRows(value: unknown): MatomoRow[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (!isRecord(value)) {
    return [];
  }
  const entries = Object.entries(value);
  if (entries.length > 0 && entries.every(([, row]) => isRecord(row))) {
    return entries.map(([key, row]) => ({ ...(row as MatomoRow), date: key }));
  }
  return [value];
}

function matomoDateQuery(range: { startDate: string; endDate: string }): {
  period: string;
  date: string;
} {
  if (range.endDate === 'today') {
    const daysAgo = /^(\d+)daysAgo$/.exec(range.startDate);
    if (daysAgo) {
      return { period: 'range', date: `last${daysAgo[1]}` };
    }
  }
  if (range.startDate === range.endDate) {
    return { period: 'day', date: range.startDate };
  }
  return { period: 'range', date: `${range.startDate},${range.endDate}` };
}

function reportMethodForDimensions(dimensions: string[]): string {
  if (dimensions.includes('date')) {
    return 'VisitsSummary.get';
  }
  if (dimensions.some(isPageDimension)) {
    return 'Actions.getPageUrls';
  }
  if (
    dimensions.includes('sessionSource') ||
    dimensions.includes('sessionMedium')
  ) {
    return 'Referrers.getAll';
  }
  return 'API.get';
}

function isPageDimension(dimension: { name: string } | string): boolean {
  const name = typeof dimension === 'string' ? dimension : dimension.name;
  return [
    'pagePath',
    'pageTitle',
    'unifiedScreenName',
    'unifiedPagePathScreen',
  ].includes(name);
}

function dimensionValue(row: MatomoRow, name: string, index: number): string {
  switch (name) {
    case 'date':
      return readString(row.date) ?? '';
    case 'pagePath':
    case 'unifiedPagePathScreen':
      return readString(row.url) ?? readString(row.label) ?? '';
    case 'pageTitle':
    case 'unifiedScreenName':
      return (
        readString(row.pageTitle) ??
        readString(row.title) ??
        readString(row.label) ??
        ''
      );
    case 'sessionSource':
      return (
        readString(row.label) ??
        readString(row.referer_name) ??
        readString(row.refererName) ??
        ''
      );
    case 'sessionMedium':
      return (
        readString(row.referer_type) ??
        readString(row.refererType) ??
        readString(row.type) ??
        ''
      );
    default:
      return readString(row[name]) ?? (index === 0 ? '' : String(index));
  }
}

function metricValue(row: MatomoRow, name: string): string {
  switch (name) {
    case 'activeUsers':
      return readNumericString(row.nb_uniq_visitors ?? row.nb_users);
    case 'sessions':
      return readNumericString(row.nb_visits);
    case 'bounceRate':
      return readNumericString(row.bounce_rate);
    case 'averageSessionDuration':
      return readNumericString(row.avg_time_on_site);
    case 'screenPageViews':
      return readNumericString(row.nb_hits ?? row.nb_pageviews);
    default:
      return readNumericString(row[name]);
  }
}

function realtimeMetricValue(row: MatomoRow, name: string): string {
  switch (name) {
    case 'activeUsers':
      return readNumericString(row.visitors ?? row.nb_uniq_visitors);
    case 'sessions':
      return readNumericString(row.visits ?? row.nb_visits);
    case 'screenPageViews':
      return readNumericString(row.actions ?? row.nb_hits ?? row.nb_pageviews);
    default:
      return metricValue(row, name);
  }
}

function metricType(name: string): string {
  return name === 'bounceRate' ? 'TYPE_FLOAT' : 'TYPE_INTEGER';
}

function readString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function readNumericString(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return '0';

  const trimmed = value.trim();
  if (!trimmed) return '0';
  if (trimmed.includes(':')) {
    return String(parseDurationSeconds(trimmed));
  }

  const numeric = Number(trimmed.replace('%', ''));
  return Number.isFinite(numeric) ? String(numeric) : '0';
}

function parseDurationSeconds(value: string): number {
  const parts = value.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function realtimePageRows(
  response: unknown,
  dimensions: { name: string }[],
  metrics: { name: string }[],
  limit: number,
): {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}[] {
  const pageCounts = new Map<string, MatomoRow & { visitors: Set<string> }>();
  const visits = normalizeMatomoRows(response);

  for (const visit of visits) {
    const visitorId =
      readString(visit.visitorId) ?? readString(visit.idVisit) ?? '';
    const actions = Array.isArray(visit.actionDetails)
      ? visit.actionDetails.filter(isRecord)
      : [];

    for (const action of actions) {
      const title =
        readString(action.pageTitle) ??
        readString(action.title) ??
        readString(action.url) ??
        '';
      const url = readString(action.url) ?? title;
      const key = `${title}\u0000${url}`;
      const existing = pageCounts.get(key) ?? {
        pageTitle: title,
        url,
        visitors: new Set<string>(),
        actions: 0,
      };
      existing.actions = Number(existing.actions ?? 0) + 1;
      if (visitorId) existing.visitors.add(visitorId);
      pageCounts.set(key, existing);
    }
  }

  return [...pageCounts.values()]
    .sort((a, b) => Number(b.actions ?? 0) - Number(a.actions ?? 0))
    .slice(0, limit)
    .map((row) => ({
      dimensionValues: dimensions.map((dimension, index) => ({
        value: dimensionValue(row, dimension.name, index),
      })),
      metricValues: metrics.map((metric) => ({
        value:
          metric.name === 'activeUsers'
            ? String(row.visitors.size)
            : realtimeMetricValue(row, metric.name),
      })),
    }));
}
