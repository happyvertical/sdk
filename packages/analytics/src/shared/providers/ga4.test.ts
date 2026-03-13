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

describe('GA4Provider.listProperties', () => {
  beforeEach(() => {
    mockAccountSummariesList.mockReset();
    mockGoogleAuth.mockReset();
    mockPropertiesGet.mockReset();
  });

  it('lists accessible properties via account summaries pagination', async () => {
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

    await expect(provider.listProperties()).resolves.toEqual([
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

  it('hydrates discovered properties when requested', async () => {
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

    await expect(provider.listProperties({ hydrate: true })).resolves.toEqual([
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
});
