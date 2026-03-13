import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAccountSummariesList, mockGoogleAuth } = vi.hoisted(() => ({
  mockAccountSummariesList: vi.fn(),
  mockGoogleAuth: vi.fn(),
}));

const mockPropertiesGet = vi.hoisted(() => vi.fn());

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: class MockGoogleAuth {
        constructor(...args: unknown[]) {
          mockGoogleAuth(...args);
        }
      },
    },
    analyticsadmin: vi.fn(() => ({
      accountSummaries: {
        list: mockAccountSummariesList,
      },
      properties: {
        get: mockPropertiesGet,
      },
    })),
    analyticsdata: vi.fn(() => ({})),
  },
}));

import { AuthenticationError } from '../types';
import { GA4Provider } from './ga4';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

describe('GA4Provider.listProperties', () => {
  beforeEach(() => {
    mockAccountSummariesList.mockReset();
    mockGoogleAuth.mockReset();
    mockPropertiesGet.mockReset();
  });

  it('lists accessible properties via account summaries pagination when hydration is disabled', async () => {
    mockAccountSummariesList
      .mockResolvedValueOnce({
        data: {
          accountSummaries: [
            {
              account: 'accounts/100',
              propertySummaries: [
                {
                  property: 'properties/111',
                  displayName: 'Main Site',
                },
              ],
            },
          ],
          nextPageToken: 'page-2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          accountSummaries: [
            {
              account: 'accounts/200',
              propertySummaries: [
                {
                  property: 'properties/222',
                  displayName: 'Backup Site',
                },
                {
                  property: 'properties/111',
                  displayName: 'Main Site Duplicate',
                },
              ],
            },
          ],
        },
      });

    const provider = new GA4Provider({
      type: 'ga4',
      serviceAccountKey: {
        type: 'service_account',
        project_id: 'project-id',
        private_key_id: 'private-key-id',
        private_key:
          '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
        client_email: 'analytics@example.com',
        client_id: 'client-id',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url:
          'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url:
          'https://www.googleapis.com/robot/v1/metadata/x509/analytics%40example.com',
      },
    });

    await expect(provider.listProperties({ hydrate: false })).resolves.toEqual([
      {
        id: '111',
        name: 'properties/111',
        displayName: 'Main Site',
        createTime: '',
      },
      {
        id: '222',
        name: 'properties/222',
        displayName: 'Backup Site',
        createTime: '',
      },
    ]);

    expect(mockAccountSummariesList).toHaveBeenCalledTimes(2);
    expect(mockAccountSummariesList).toHaveBeenNthCalledWith(1, {
      pageSize: 200,
      pageToken: undefined,
    });
    expect(mockAccountSummariesList).toHaveBeenNthCalledWith(2, {
      pageSize: 200,
      pageToken: 'page-2',
    });
    expect(mockPropertiesGet).not.toHaveBeenCalled();
  });

  it('maps admin API auth failures to AuthenticationError', async () => {
    mockAccountSummariesList.mockRejectedValueOnce({
      code: 403,
      message: 'Forbidden',
    });

    const provider = new GA4Provider({
      type: 'ga4',
      serviceAccountKey: {
        type: 'service_account',
        project_id: 'project-id',
        private_key_id: 'private-key-id',
        private_key:
          '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
        client_email: 'analytics@example.com',
        client_id: 'client-id',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url:
          'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url:
          'https://www.googleapis.com/robot/v1/metadata/x509/analytics%40example.com',
      },
    });

    await expect(provider.listProperties()).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it('hydrates discovered properties by default', async () => {
    mockAccountSummariesList.mockResolvedValueOnce({
      data: {
        accountSummaries: [
          {
            account: 'accounts/100',
            propertySummaries: [
              {
                property: 'properties/111',
                displayName: 'Main Site',
              },
              {
                property: 'properties/222',
                displayName: 'Backup Site',
              },
            ],
          },
        ],
      },
    });

    mockPropertiesGet
      .mockResolvedValueOnce({
        data: {
          name: 'properties/111',
          displayName: 'Main Site',
          createTime: '2026-01-01T00:00:00Z',
          updateTime: '2026-01-02T00:00:00Z',
          timeZone: 'America/Edmonton',
          currencyCode: 'CAD',
          industryCategory: 'TRAVEL',
          serviceLevel: 'STANDARD',
        },
      })
      .mockResolvedValueOnce({
        data: {
          name: 'properties/222',
          displayName: 'Backup Site',
          createTime: '2026-02-01T00:00:00Z',
          updateTime: '2026-02-02T00:00:00Z',
          timeZone: 'America/New_York',
          currencyCode: 'USD',
          industryCategory: 'BUSINESS_AND_INDUSTRIAL_MARKETS',
          serviceLevel: 'PREMIUM',
        },
      });

    const provider = new GA4Provider({
      type: 'ga4',
      serviceAccountKey: {
        type: 'service_account',
        project_id: 'project-id',
        private_key_id: 'private-key-id',
        private_key:
          '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
        client_email: 'analytics@example.com',
        client_id: 'client-id',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url:
          'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url:
          'https://www.googleapis.com/robot/v1/metadata/x509/analytics%40example.com',
      },
    });

    await expect(provider.listProperties()).resolves.toEqual([
      {
        id: '111',
        name: 'properties/111',
        displayName: 'Main Site',
        createTime: '2026-01-01T00:00:00Z',
        updateTime: '2026-01-02T00:00:00Z',
        timeZone: 'America/Edmonton',
        currencyCode: 'CAD',
        industryCategory: 'TRAVEL',
        serviceLevel: 'STANDARD',
      },
      {
        id: '222',
        name: 'properties/222',
        displayName: 'Backup Site',
        createTime: '2026-02-01T00:00:00Z',
        updateTime: '2026-02-02T00:00:00Z',
        timeZone: 'America/New_York',
        currencyCode: 'USD',
        industryCategory: 'BUSINESS_AND_INDUSTRIAL_MARKETS',
        serviceLevel: 'PREMIUM',
      },
    ]);

    expect(mockPropertiesGet).toHaveBeenCalledTimes(2);
    expect(mockPropertiesGet).toHaveBeenNthCalledWith(1, {
      name: 'properties/111',
    });
    expect(mockPropertiesGet).toHaveBeenNthCalledWith(2, {
      name: 'properties/222',
    });
  });

  it('hydrates properties in bounded batches to avoid unbounded concurrency', async () => {
    mockAccountSummariesList.mockResolvedValueOnce({
      data: {
        accountSummaries: [
          {
            account: 'accounts/100',
            propertySummaries: Array.from({ length: 6 }, (_, index) => ({
              property: `properties/${index + 1}`,
              displayName: `Property ${index + 1}`,
            })),
          },
        ],
      },
    });

    const firstBatch = Array.from({ length: 5 }, (_, index) =>
      createDeferred<{
        data: { name: string; displayName: string; createTime: string };
      }>(),
    );
    const secondBatch = createDeferred<{
      data: { name: string; displayName: string; createTime: string };
    }>();

    mockPropertiesGet.mockImplementation(({ name }: { name: string }) => {
      const propertyIndex = Number.parseInt(
        name.replace('properties/', ''),
        10,
      );

      if (propertyIndex <= 5) {
        return firstBatch[propertyIndex - 1].promise;
      }

      return secondBatch.promise;
    });

    const provider = new GA4Provider({
      type: 'ga4',
      serviceAccountKey: {
        type: 'service_account',
        project_id: 'project-id',
        private_key_id: 'private-key-id',
        private_key:
          '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
        client_email: 'analytics@example.com',
        client_id: 'client-id',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url:
          'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url:
          'https://www.googleapis.com/robot/v1/metadata/x509/analytics%40example.com',
      },
    });

    const pendingList = provider.listProperties({ hydrate: true });
    await vi.waitFor(() => {
      expect(mockPropertiesGet).toHaveBeenCalledTimes(5);
    });

    firstBatch.forEach((deferred, index) => {
      deferred.resolve({
        data: {
          name: `properties/${index + 1}`,
          displayName: `Property ${index + 1}`,
          createTime: `2026-01-0${index + 1}T00:00:00Z`,
        },
      });
    });

    await vi.waitFor(() => {
      expect(mockPropertiesGet).toHaveBeenCalledTimes(6);
      expect(mockPropertiesGet).toHaveBeenLastCalledWith({
        name: 'properties/6',
      });
    });
    secondBatch.resolve({
      data: {
        name: 'properties/6',
        displayName: 'Property 6',
        createTime: '2026-01-06T00:00:00Z',
      },
    });

    await expect(pendingList).resolves.toHaveLength(6);
  });
});
