# @happyvertical/analytics: Unified Analytics Interface

## Purpose and Responsibilities

The `@happyvertical/analytics` package provides a standardized interface for interacting with analytics platforms. It is designed to:

- **Unify Analytics Provider APIs**: Provide a consistent interface across Google Analytics 4 and Plausible Analytics
- **Simplify Provider Switching**: Enable seamless switching between analytics providers without code changes
- **Full Property Management**: Create, update, delete properties and configure data streams, custom dimensions, and key events
- **Comprehensive Reporting**: Run historical and real-time reports with flexible filtering and dimensions
- **Server-Side Event Tracking**: Track events and pageviews from server applications
- **Client-Side Snippet Generation**: Generate ready-to-embed tracking snippets for web pages

## Architecture Overview

### Core Components

1. **Factory Function** (`shared/factory.ts`)
   - `getAnalytics()` - Creates provider instances with type-discriminated options
   - Environment variable loading with `HAVE_ANALYTICS_*` prefix
   - Lazy dynamic imports for tree-shaking

2. **Provider Implementations** (`shared/providers/`)
   - `GA4Provider` - Google Analytics 4 with Admin API, Data API, and Measurement Protocol
   - `PlausibleProvider` - Plausible Analytics with Sites, Stats, and Events APIs

3. **Type Definitions** (`shared/types.ts`)
   - `AnalyticsInterface` - Core interface all providers implement
   - Property, DataStream, CustomDimension, KeyEvent types
   - Report options and result types
   - Error classes: `AnalyticsError`, `AuthenticationError`, `RateLimitError`, etc.

### Key Design Patterns

**Provider Pattern**: Each analytics service has its own provider class implementing `AnalyticsInterface`

**Factory Pattern**: Dynamic provider loading using async imports
```typescript
const analytics = await getAnalytics({ type: 'ga4', ... });
```

**Error Mapping**: Providers map native API errors to standardized types

## Quick Start

### Installation

```bash
pnpm add @happyvertical/analytics
```

### Creating a Client

```typescript
import { getAnalytics } from '@happyvertical/analytics';

// Create GA4 client
const ga4 = await getAnalytics({
  type: 'ga4',
  serviceAccountKey: '/path/to/service-account.json',
  measurementId: 'G-XXXXXXXXXX',
  apiSecret: 'your-api-secret'
});

// Create Plausible client
const plausible = await getAnalytics({
  type: 'plausible',
  apiKey: 'your-api-key',
  baseUrl: 'https://plausible.io' // or self-hosted URL
});
```

### Environment Variable Configuration

```bash
# GA4 Configuration
HAVE_ANALYTICS_TYPE=ga4
HAVE_ANALYTICS_SERVICE_ACCOUNT_KEY=/path/to/key.json
HAVE_ANALYTICS_MEASUREMENT_ID=G-XXXXXXXXXX
HAVE_ANALYTICS_API_SECRET=xxxxxxxxxxxx
HAVE_ANALYTICS_DEFAULT_PROPERTY_ID=123456789

# Plausible Configuration
HAVE_ANALYTICS_TYPE=plausible
HAVE_ANALYTICS_API_KEY=xxxxxxxxxxxxx
HAVE_ANALYTICS_BASE_URL=https://plausible.io
HAVE_ANALYTICS_DEFAULT_SITE_ID=example.com
```

## Key APIs

### Property Management

```typescript
// List all properties
const properties = await analytics.listProperties();

// Create a property (GA4)
const property = await analytics.createProperty({
  displayName: 'My Website',
  timeZone: 'America/Los_Angeles',
  currencyCode: 'USD',
  parent: 'accounts/123456789'
});

// Get property details
const details = await analytics.getProperty('123456789');

// Update a property
await analytics.updateProperty('123456789', {
  displayName: 'Updated Name'
});

// Delete a property
await analytics.deleteProperty('123456789');
```

### Data Streams (GA4 only)

```typescript
// Get data streams
const streams = await analytics.getDataStreams('123456789');

// Create a web data stream
const stream = await analytics.createDataStream('123456789', {
  type: 'WEB_DATA_STREAM',
  displayName: 'Web Stream',
  defaultUri: 'https://example.com'
});

// Delete a data stream
await analytics.deleteDataStream('123456789', 'stream-id');
```

### Custom Dimensions & Metrics (GA4 only)

```typescript
// Get custom dimensions
const dimensions = await analytics.getCustomDimensions('123456789');

// Create a custom dimension
const dimension = await analytics.createCustomDimension('123456789', {
  parameterName: 'user_type',
  displayName: 'User Type',
  scope: 'USER',
  description: 'Type of user account'
});

// Archive a custom dimension
await analytics.archiveCustomDimension('123456789', 'dimension-id');

// Similar methods for custom metrics
const metrics = await analytics.getCustomMetrics('123456789');
```

### Key Events (Conversions)

```typescript
// Get key events
const keyEvents = await analytics.getKeyEvents('123456789');

// Create a key event
const keyEvent = await analytics.createKeyEvent('123456789', {
  eventName: 'purchase',
  countingMethod: 'ONCE_PER_EVENT',
  defaultValue: {
    numericValue: 0,
    currencyCode: 'USD'
  }
});

// Delete a key event
await analytics.deleteKeyEvent('123456789', 'event-id');
```

### Reporting

```typescript
// Run a historical report
const report = await analytics.runReport('123456789', {
  dateRanges: [
    { startDate: '7daysAgo', endDate: 'today' }
  ],
  metrics: [
    { name: 'activeUsers' },
    { name: 'sessions' },
    { name: 'bounceRate' }
  ],
  dimensions: [
    { name: 'country' },
    { name: 'deviceCategory' }
  ],
  limit: 100
});

// Access report data
for (const row of report.rows) {
  const country = row.dimensionValues[0].value;
  const device = row.dimensionValues[1].value;
  const users = row.metricValues[0].value;
  console.log(`${country} (${device}): ${users} users`);
}

// Run a realtime report
const realtime = await analytics.runRealtimeReport('123456789', {
  metrics: [{ name: 'activeUsers' }],
  dimensions: [{ name: 'country' }]
});

// Get available metrics and dimensions
const availableMetrics = await analytics.getMetrics('123456789');
const availableDimensions = await analytics.getDimensions('123456789');
```

### Event Tracking (Server-Side)

```typescript
// Track a custom event
await analytics.track({
  name: 'purchase',
  params: {
    value: 99.99,
    currency: 'USD',
    item_id: 'SKU-123'
  },
  clientId: 'client-id-123',
  userId: 'user-id-456'
});

// Track a pageview
await analytics.trackPageview({
  pagePath: '/products/widget',
  pageTitle: 'Widget Product Page',
  pageLocation: 'https://example.com/products/widget',
  clientId: 'client-id-123'
});

// Track multiple events in batch (GA4 only)
await analytics.trackBatch([
  { name: 'view_item', params: { item_id: '123' } },
  { name: 'add_to_cart', params: { item_id: '123', quantity: 2 } },
  { name: 'purchase', params: { value: 99.99, currency: 'USD' } }
]);

// Identify a user (GA4 only)
await analytics.identify('user-id-456', {
  subscription_tier: 'premium',
  signup_date: '2024-01-15'
});
```

### Client-Side Snippet Generation

```typescript
// Generate HTML tracking snippet
const snippet = analytics.generateTrackingSnippet('123456789', {
  anonymizeIp: true,
  sendPageView: true,
  cookieFlags: 'SameSite=Strict;Secure'
});

console.log(snippet.html);
// <script async src="https://www.googletagmanager.com/gtag/js?id=G-123456789"></script>
// <script>...</script>

console.log(snippet.scripts);
// ['https://www.googletagmanager.com/gtag/js?id=G-123456789']

// Generate config object for programmatic use
const config = analytics.generateConfig('123456789', {
  userId: 'user-123',
  customDimensions: {
    user_type: 'premium'
  }
});
```

### Provider Capabilities

```typescript
const capabilities = await analytics.getCapabilities();
// {
//   propertyManagement: true,
//   dataStreams: true,        // GA4 only
//   customDimensions: true,   // GA4 only
//   customMetrics: true,      // GA4 only
//   keyEvents: true,
//   reporting: true,
//   realtimeReporting: true,
//   serverSideTracking: true,
//   clientSideSnippet: true,
//   userIdentification: true, // GA4 only
//   batchTracking: true       // GA4 only
// }
```

## Error Handling

```typescript
import {
  getAnalytics,
  AnalyticsError,
  AuthenticationError,
  RateLimitError,
  PropertyNotFoundError,
  NotSupportedError
} from '@happyvertical/analytics';

try {
  await analytics.runReport('123456789', { ... });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Check your credentials');
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited, retry after ${error.retryAfter}s`);
  } else if (error instanceof PropertyNotFoundError) {
    console.error(`Property ${error.propertyId} not found`);
  } else if (error instanceof NotSupportedError) {
    console.error(`Feature ${error.feature} not supported by this provider`);
  } else if (error instanceof AnalyticsError) {
    console.error(`Analytics error [${error.code}]: ${error.message}`);
  }
}
```

## Provider-Specific Notes

### Google Analytics 4

The GA4 provider uses three internal APIs:

1. **Admin API** (`googleapis`): Property management, data streams, custom definitions, key events
2. **Data API** (`googleapis`): Reports and analytics queries
3. **Measurement Protocol**: Server-side event tracking (HTTP POST)

**Authentication**: Requires a Google Cloud service account with appropriate permissions:
- `Analytics Admin` role for property management
- `Analytics Viewer` role for reporting

**Measurement Protocol**: Requires a Measurement ID (G-XXXXXXX) and API Secret for server-side tracking.

### Plausible Analytics

The Plausible provider is more limited due to the privacy-focused nature of the service:

**Supported Features**:
- Site creation and deletion
- Historical and realtime reports via Stats API v2
- Server-side event tracking via Events API
- Client-side snippet generation

**Not Supported via API**:
- Custom dimensions (UI only)
- Custom metrics
- User identification (privacy-focused)
- Batch tracking

**Self-Hosted**: Set `baseUrl` option for self-hosted Plausible instances.

## Dependencies

### Internal
- `@happyvertical/utils` - Validation, error handling, environment config loading

### External
- `googleapis` - Google Analytics Admin API and Data API (GA4 only)

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test

# Integration tests require credentials
HAVE_ANALYTICS_TYPE=ga4 \
HAVE_ANALYTICS_SERVICE_ACCOUNT_KEY=/path/to/key.json \
npm test
```

### Directory Structure

```
packages/analytics/
├── src/
│   ├── index.ts                       # Entry point
│   ├── shared/
│   │   ├── factory.ts                 # getAnalytics() factory
│   │   ├── types.ts                   # Interfaces and error classes
│   │   └── providers/
│   │       ├── ga4.ts                 # Google Analytics 4 provider
│   │       └── plausible.ts           # Plausible Analytics provider
├── CLAUDE.md                          # This file
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Quick Reference

### Environment Variables

| Variable | Description |
|----------|-------------|
| `HAVE_ANALYTICS_TYPE` | Provider type: `ga4` or `plausible` |
| `HAVE_ANALYTICS_SERVICE_ACCOUNT_KEY` | GA4: Path to service account JSON |
| `HAVE_ANALYTICS_MEASUREMENT_ID` | GA4: Measurement ID (G-XXXXXXX) |
| `HAVE_ANALYTICS_API_SECRET` | GA4: API secret for Measurement Protocol |
| `HAVE_ANALYTICS_DEFAULT_PROPERTY_ID` | GA4: Default property ID |
| `HAVE_ANALYTICS_API_KEY` | Plausible: API key |
| `HAVE_ANALYTICS_BASE_URL` | Plausible: Base URL (for self-hosted) |
| `HAVE_ANALYTICS_DEFAULT_SITE_ID` | Plausible: Default site ID (domain) |

### Error Classes

| Error | Description |
|-------|-------------|
| `AnalyticsError` | Base error class |
| `AuthenticationError` | Authentication failed |
| `RateLimitError` | Rate limit exceeded (includes `retryAfter`) |
| `PropertyNotFoundError` | Property/site not found |
| `InvalidDimensionError` | Invalid dimension name |
| `InvalidMetricError` | Invalid metric name |
| `QuotaExceededError` | API quota exceeded |
| `NotSupportedError` | Feature not supported by provider |

### Common Commands

```bash
npm run build       # Build package
npm run build:watch # Build in watch mode
npm test            # Run tests
npm run clean       # Clean build artifacts
```
