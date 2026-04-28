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
import { MatomoAdmin, normalizeMatomoBaseUrl } from './matomo-admin.js';

const PROVIDER = 'matomo';

export class MatomoProvider implements AnalyticsInterface {
  private readonly options: MatomoOptions;
  private readonly baseUrl: string;
  public readonly admin: MatomoAdmin;

  constructor(options: MatomoOptions) {
    this.options = options;
    this.baseUrl = normalizeMatomoBaseUrl(options.baseUrl);
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
      reporting: false,
      realtimeReporting: false,
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
  runReport(
    _propertyId: string,
    _options: ReportOptions,
  ): Promise<ReportResult> {
    throw new NotSupportedError('runReport', PROVIDER);
  }
  runRealtimeReport(
    _propertyId: string,
    _options?: RealtimeReportOptions,
  ): Promise<ReportResult> {
    throw new NotSupportedError('runRealtimeReport', PROVIDER);
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
