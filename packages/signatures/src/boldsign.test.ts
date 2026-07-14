// biome-ignore-all lint/style/useNamingConvention: Fixtures assert BoldSign's documented PascalCase wire fields.
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  BOLDSIGN_IDEMPOTENCY_METADATA_KEY,
  BOLDSIGN_TENANT_METADATA_KEY,
  BoldSignAdapter,
  verifyBoldSignWebhookSignature,
} from './adapters/boldsign.js';
import {
  SignatureConfigurationError,
  SignatureInputError,
  SignatureProviderError,
  SignatureTenantMismatchError,
  SignatureVerificationError,
} from './errors.js';
import { createSignatureProvider } from './factory.js';
import type { CreateSignatureRequestInput, SignatureFetch } from './index.js';

const tenantId = 'tenant_123';
const apiKey = 'api-key-secret';
const webhookSecret = 'webhook-secret';
const now = new Date('2026-07-14T20:00:00.000Z');

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function propertiesResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    documentId: 'doc_123',
    messageTitle: 'Referral Agreement',
    status: 'Completed',
    createdDate: 1_752_523_200,
    expiryDays: 30,
    metaData: {
      [BOLDSIGN_TENANT_METADATA_KEY]: tenantId,
      [BOLDSIGN_IDEMPOTENCY_METADATA_KEY]: 'agreement:v1',
    },
    signerDetails: [
      {
        id: 'signer_1',
        signerName: 'Alex Example',
        signerEmail: 'alex@example.com',
        signerRole: 'Referrer',
        status: 'Completed',
        authenticationType: 'EmailOTP',
        isViewed: true,
        isDeliveryFailed: false,
        order: 1,
      },
    ],
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<CreateSignatureRequestInput> = {},
): CreateSignatureRequestInput {
  return {
    tenantId,
    idempotencyKey: 'agreement:v1',
    title: 'Referral Agreement',
    message: 'Please sign.',
    documents: [
      {
        name: 'agreement.pdf',
        mediaType: 'application/pdf',
        data: new Uint8Array([37, 80, 68, 70]),
      },
    ],
    signers: [
      {
        name: 'Alex Example',
        email: 'alex@example.com',
        role: 'Referrer',
        order: 1,
        authentication: { method: 'email_otp' },
        fields: [
          {
            id: 'referrer_signature',
            type: 'signature',
            page: 2,
            bounds: { x: 72, y: 600, width: 180, height: 36 },
          },
        ],
      },
    ],
    signingOrder: true,
    expiresInDays: 30,
    metadata: { agreementVersionId: 'version_1' },
    ...overrides,
  };
}

function baseSigner() {
  const signer = baseInput().signers[0];

  if (!signer) {
    throw new Error('Test fixture signer is missing.');
  }

  return signer;
}

function adapter(
  fetch: SignatureFetch,
  overrides: Partial<ConstructorParameters<typeof BoldSignAdapter>[0]> = {},
) {
  return new BoldSignAdapter({
    tenantId,
    apiKey,
    webhookSecrets: webhookSecret,
    fetch,
    now: () => now,
    ...overrides,
  });
}

function webhookPayload(
  eventType = 'Signed',
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    event: {
      id: 'event_123',
      eventType,
      created: Math.floor(now.getTime() / 1_000),
      environment: 'Test',
    },
    data: {
      object: 'document',
      documentId: 'doc_123',
      status: 'InProgress',
      metaData: { [BOLDSIGN_TENANT_METADATA_KEY]: tenantId },
      signerDetails: [
        {
          id: 'signer_1',
          signerName: 'Alex Example',
          signerEmail: 'alex@example.com',
          status: 'Completed',
          authenticationType: 'EmailOTP',
          isViewed: true,
        },
      ],
      ...overrides,
    },
  });
}

function webhookSignature(
  payload: string,
  secret = webhookSecret,
  timestamp = Math.floor(now.getTime() / 1_000),
  key = 's0',
): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  return `t=${timestamp},${key}=${signature}`;
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('BoldSignAdapter configuration', () => {
  it('defaults to the Canadian region and discloses provider idempotency limits', () => {
    const provider = adapter(vi.fn());

    expect(provider.capabilities).toMatchObject({
      id: 'boldsign',
      region: 'ca',
      providerEnforcedIdempotency: false,
      supportsAuditTrail: true,
    });
  });

  it('requires exactly one authentication credential', () => {
    expect(
      () =>
        new BoldSignAdapter({
          tenantId,
          apiKey,
          accessToken: 'token',
          fetch: vi.fn(),
        }),
    ).toThrow('exactly one of apiKey or accessToken');
    expect(() => new BoldSignAdapter({ tenantId, fetch: vi.fn() })).toThrow(
      'exactly one of apiKey or accessToken',
    );
  });

  it('rejects blank webhook secrets and non-HTTPS endpoints', () => {
    expect(() => adapter(vi.fn(), { webhookSecrets: [' '] })).toThrow(
      SignatureConfigurationError,
    );
    expect(() =>
      adapter(vi.fn(), { apiBaseUrl: 'http://api.example/v1' }),
    ).toThrow('must use HTTPS');
    expect(() =>
      adapter(vi.fn(), { apiBaseUrl: 'https://user@example.com/v1?debug=1' }),
    ).toThrow('must not contain credentials');
  });
});

describe('BoldSignAdapter createRequest', () => {
  it('sends the provider-neutral request to the Canadian JSON API', async () => {
    const signal = new AbortController().signal;
    const fetch = vi.fn(async () =>
      jsonResponse({ documentId: 'doc_123' }, 201),
    );
    const provider = adapter(fetch);

    const result = await provider.createRequest(baseInput({ signal }));

    expect(result).toMatchObject({
      provider: 'boldsign',
      tenantId,
      id: 'doc_123',
      status: 'prepared',
      title: 'Referral Agreement',
      metadata: {
        agreementVersionId: 'version_1',
        [BOLDSIGN_TENANT_METADATA_KEY]: tenantId,
        [BOLDSIGN_IDEMPOTENCY_METADATA_KEY]: 'agreement:v1',
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api-ca.boldsign.com/v1/document/send');
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBe(signal);
    const headers = new Headers(init?.headers);
    expect(headers.get('X-API-KEY')).toBe(apiKey);
    expect(headers.get('Authorization')).toBeNull();
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      Title: 'Referral Agreement',
      EnableSigningOrder: true,
      ExpiryDateType: 'Days',
      ExpiryValue: 30,
      MetaData: {
        agreementVersionId: 'version_1',
        [BOLDSIGN_TENANT_METADATA_KEY]: tenantId,
        [BOLDSIGN_IDEMPOTENCY_METADATA_KEY]: 'agreement:v1',
      },
    });
    expect(body.Files).toEqual([
      {
        base64: 'data:application/pdf;base64,JVBERg==',
        fileName: 'agreement.pdf',
      },
    ]);
    expect(body.Signers[0]).toMatchObject({
      Name: 'Alex Example',
      EmailAddress: 'alex@example.com',
      SignerRole: 'Referrer',
      AuthenticationType: 'EmailOTP',
      EnableEmailOTP: true,
      FormFields: [
        {
          Id: 'referrer_signature',
          FieldType: 'Signature',
          PageNumber: 2,
          Bounds: { X: 72, Y: 600, Width: 180, Height: 36 },
        },
      ],
    });
  });

  it('supports OAuth bearer credentials without leaking them into the body', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ documentId: 'doc_123' }, 201),
    );
    const provider = adapter(fetch, {
      apiKey: undefined,
      accessToken: 'oauth-secret',
    });

    await provider.createRequest(baseInput());

    const [, init] = fetch.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer oauth-secret');
    expect(headers.get('X-API-KEY')).toBeNull();
    expect(String(init?.body)).not.toContain('oauth-secret');
  });

  it('accepts ReadableStream and AsyncIterable document sources', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ documentId: 'doc_123' }, 201),
    );
    const provider = adapter(fetch);
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([37, 80]));
        controller.enqueue(new Uint8Array([68, 70]));
        controller.close();
      },
    });
    async function* iterable() {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3]);
    }

    await provider.createRequest(
      baseInput({
        documents: [
          { name: 'one.pdf', mediaType: 'application/pdf', data: readable },
          { name: 'two.pdf', mediaType: 'application/pdf', data: iterable() },
        ],
      }),
    );

    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.Files).toEqual([
      {
        base64: 'data:application/pdf;base64,JVBERg==',
        fileName: 'one.pdf',
      },
      {
        base64: 'data:application/pdf;base64,AQID',
        fileName: 'two.pdf',
      },
    ]);
  });

  it("enforces BoldSign's aggregate document-size limit", async () => {
    const provider = adapter(vi.fn());
    const thirteenMegabytes = new Uint8Array(13 * 1024 * 1024);

    await expect(
      provider.createRequest(
        baseInput({
          documents: [
            {
              name: 'one.pdf',
              mediaType: 'application/pdf',
              data: thirteenMegabytes,
            },
            {
              name: 'two.pdf',
              mediaType: 'application/pdf',
              data: thirteenMegabytes,
            },
          ],
        }),
      ),
    ).rejects.toThrow('25 MB aggregate limit');
  });

  it('normalizes access-code, SMS OTP, and identity verification inputs', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ documentId: 'doc_123' }, 201),
    );
    const provider = adapter(fetch);
    const signers = [
      {
        ...baseSigner(),
        email: 'one@example.com',
        authentication: { method: 'access_code' as const, accessCode: '4821' },
      },
      {
        ...baseSigner(),
        email: 'two@example.com',
        authentication: {
          method: 'sms_otp' as const,
          phone: { countryCode: '+1', number: '4035550101' },
        },
      },
      {
        ...baseSigner(),
        email: 'three@example.com',
        authentication: {
          method: 'identity_verification' as const,
          identityVerification: {
            frequency: 'once_per_document' as const,
            maximumRetryCount: 3,
            allowedDocumentTypes: ['passport' as const],
            allowedCountries: ['ca'],
          },
        },
      },
    ];

    await provider.createRequest(baseInput({ signers }));

    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.Signers[0]).toMatchObject({
      AuthenticationType: 'AccessCode',
      AuthenticationCode: '4821',
    });
    expect(body.Signers[1]).toMatchObject({
      AuthenticationType: 'SMSOTP',
      PhoneNumber: { CountryCode: '+1', Number: '4035550101' },
    });
    expect(body.Signers[2]).toMatchObject({
      AuthenticationType: 'IdVerification',
      IdentityVerificationSettings: {
        Type: 'OncePerDocument',
        MaximumRetryCount: 3,
        AllowedDocumentTypes: ['Passport'],
        AllowedCountries: ['CA'],
      },
    });
  });

  it('enforces tenant, idempotency, signer identity, and metadata boundaries', async () => {
    const provider = adapter(vi.fn());

    await expect(
      provider.createRequest(baseInput({ tenantId: 'other_tenant' })),
    ).rejects.toThrow(SignatureTenantMismatchError);
    await expect(
      provider.createRequest(baseInput({ idempotencyKey: ' ' })),
    ).rejects.toThrow(SignatureInputError);
    await expect(
      provider.createRequest(
        baseInput({
          metadata: { [BOLDSIGN_TENANT_METADATA_KEY]: 'spoofed' },
        }),
      ),
    ).rejects.toThrow('is reserved');
    await expect(
      provider.createRequest(
        baseInput({
          signers: [
            {
              ...baseSigner(),
              authentication: { method: 'access_code' },
            },
          ],
        }),
      ),
    ).rejects.toThrow('accessCode');
    await expect(
      provider.createRequest(
        baseInput({
          signers: [
            {
              ...baseSigner(),
              authentication: {
                method: 'sms_otp',
                phone: { countryCode: '+123', number: '123456789012345' },
              },
            },
          ],
        }),
      ),
    ).rejects.toThrow('E.164');
    await expect(
      provider.createRequest(
        baseInput({
          signers: [
            {
              ...baseSigner(),
              authentication: {
                method: 'identity_verification',
                identityVerification: {
                  allowedDocumentTypes: ['future_type' as never],
                },
              },
            },
          ],
        }),
      ),
    ).rejects.toThrow('allowedDocumentTypes');
  });

  it('marks ambiguous transport and server failures for reconciliation', async () => {
    const failedFetch = vi.fn(async () => {
      throw new Error(`network failed near ${apiKey}`);
    });
    const provider = adapter(failedFetch);

    const transportError = await provider
      .createRequest(baseInput())
      .catch((error: unknown) => error);
    expect(transportError).toBeInstanceOf(SignatureProviderError);
    expect(transportError).toMatchObject({
      retryable: true,
      requestMayHaveSucceeded: true,
    });
    expect(String(transportError)).not.toContain(apiKey);

    const serverProvider = adapter(
      vi.fn(async () =>
        jsonResponse({ message: 'temporarily unavailable' }, 503),
      ),
    );
    const serverError = await serverProvider
      .createRequest(baseInput())
      .catch((error: unknown) => error);
    expect(serverError).toMatchObject({
      status: 503,
      retryable: true,
      requestMayHaveSucceeded: true,
    });
  });

  it('surfaces rate-limit retry guidance without treating it as accepted', async () => {
    const provider = adapter(
      vi.fn(async () =>
        jsonResponse({ message: 'too many requests' }, 429, {
          'Retry-After': '15',
        }),
      ),
    );

    const error = await provider
      .createRequest(baseInput())
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 429,
      retryable: true,
      retryAfterMs: 15_000,
      requestMayHaveSucceeded: false,
    });
  });
});

describe('BoldSignAdapter lifecycle and evidence', () => {
  it('maps provider properties into the normalized lifecycle', async () => {
    const provider = adapter(
      vi.fn(async () => jsonResponse(propertiesResponse())),
    );

    const result = await provider.getRequest({
      tenantId,
      requestId: 'doc_123',
    });

    expect(result).toMatchObject({
      id: 'doc_123',
      tenantId,
      status: 'completed',
      title: 'Referral Agreement',
      signers: [
        {
          id: 'signer_1',
          name: 'Alex Example',
          email: 'alex@example.com',
          role: 'Referrer',
          status: 'signed',
          authenticationMethod: 'email_otp',
          viewed: true,
        },
      ],
    });
    expect(result.createdAt?.toISOString()).toBe('2025-07-14T20:00:00.000Z');
    expect(result.expiresAt?.toISOString()).toBe('2025-08-13T20:00:00.000Z');
  });

  it('fails closed on unknown provider lifecycle and signer statuses', async () => {
    const unknownDocument = adapter(
      vi.fn(async () =>
        jsonResponse(propertiesResponse({ status: 'FutureStatus' })),
      ),
    );
    const unknownSigner = adapter(
      vi.fn(async () =>
        jsonResponse(
          propertiesResponse({
            signerDetails: [
              {
                signerName: 'Alex Example',
                signerEmail: 'alex@example.com',
                status: 'FutureSignerStatus',
              },
            ],
          }),
        ),
      ),
    );

    await expect(
      unknownDocument.getRequest({ tenantId, requestId: 'doc_123' }),
    ).rejects.toThrow('Unsupported BoldSign document status');
    await expect(
      unknownSigner.getRequest({ tenantId, requestId: 'doc_123' }),
    ).rejects.toThrow('Unsupported BoldSign signer status');
  });

  it('rejects reads when provider metadata lacks the tenant binding', async () => {
    const provider = adapter(
      vi.fn(async () =>
        jsonResponse(propertiesResponse({ metaData: { hvTenantId: 'other' } })),
      ),
    );

    await expect(
      provider.getRequest({ tenantId, requestId: 'doc_123' }),
    ).rejects.toThrow(SignatureTenantMismatchError);
  });

  it('verifies ownership before cancelling and requires a reason', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(propertiesResponse({ status: 'InProgress' })),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const provider = adapter(fetch);

    const result = await provider.cancelRequest({
      tenantId,
      requestId: 'doc_123',
      reason: 'Agreement superseded',
    });

    expect(result.status).toBe('cancelled');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toBe(
      'https://api-ca.boldsign.com/v1/document/revoke?documentId=doc_123',
    );
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      Message: 'Agreement superseded',
    });

    await expect(
      provider.cancelRequest({ tenantId, requestId: 'doc_123', reason: ' ' }),
    ).rejects.toThrow('cancellation reason');
  });

  it('extends expiry only to a future timestamp after ownership verification', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          propertiesResponse({
            status: 'InProgress',
            createdDate: Math.floor(now.getTime() / 1_000),
            expiryDays: 10,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const provider = adapter(fetch);
    const expiresAt = new Date('2026-08-01T18:30:00.000Z');

    const result = await provider.extendExpiry({
      tenantId,
      requestId: 'doc_123',
      expiresAt,
      warnPrior: true,
    });

    expect(result.expiresAt).toEqual(expiresAt);
    expect(fetch.mock.calls[1]?.[0]).toBe(
      'https://api-ca.boldsign.com/v1/document/extendExpiry?documentId=doc_123',
    );
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      NewExpiryValue: '2026-08-01',
      WarnPrior: true,
    });
  });

  it('rejects expiry reductions and dates beyond the provider maximum', async () => {
    const properties = propertiesResponse({
      status: 'InProgress',
      createdDate: Math.floor(now.getTime() / 1_000),
      expiryDays: 30,
    });
    const provider = adapter(vi.fn(async () => jsonResponse(properties)));

    await expect(
      provider.extendExpiry({
        tenantId,
        requestId: 'doc_123',
        expiresAt: '2026-07-20T00:00:00.000Z',
      }),
    ).rejects.toThrow('must extend the current expiry date');
    await expect(
      provider.extendExpiry({
        tenantId,
        requestId: 'doc_123',
        expiresAt: '2027-02-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('cannot exceed 180 days');
  });

  it('refuses cancellation and expiry changes after a terminal state', async () => {
    const provider = adapter(
      vi.fn(async () =>
        jsonResponse(propertiesResponse({ status: 'Completed' })),
      ),
    );

    await expect(
      provider.cancelRequest({
        tenantId,
        requestId: 'doc_123',
        reason: 'Too late',
      }),
    ).rejects.toThrow('cannot be cancelled from completed');
    await expect(
      provider.extendExpiry({
        tenantId,
        requestId: 'doc_123',
        expiresAt: '2026-08-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('cannot be extended from completed');
  });

  it('downloads completed evidence with an exact SHA-256 digest', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(propertiesResponse()))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 }));
    const provider = adapter(fetch);

    const artifact = await provider.downloadArtifact({
      tenantId,
      requestId: 'doc_123',
      kind: 'audit_trail',
    });

    expect(artifact).toMatchObject({
      provider: 'boldsign',
      tenantId,
      requestId: 'doc_123',
      kind: 'audit_trail',
      filename: 'doc_123-audit.pdf',
      mediaType: 'application/pdf',
      retrievedAt: now,
    });
    expect(await readStream(artifact.stream)).toEqual(bytes);
    expect(await artifact.sha256).toBe(
      '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a',
    );
    expect(fetch.mock.calls[1]?.[0]).toContain('/document/downloadAuditLog?');
  });

  it('refuses to label pre-completion downloads as execution evidence', async () => {
    const provider = adapter(
      vi.fn(async () =>
        jsonResponse(propertiesResponse({ status: 'InProgress' })),
      ),
    );

    await expect(
      provider.downloadArtifact({
        tenantId,
        requestId: 'doc_123',
        kind: 'signed_document',
      }),
    ).rejects.toThrow('only be downloaded after completion');
  });

  it('rejects unknown artifact kinds before contacting BoldSign', async () => {
    const fetch = vi.fn();
    const provider = adapter(fetch);

    await expect(
      provider.downloadArtifact({
        tenantId,
        requestId: 'doc_123',
        kind: 'future_artifact' as never,
      }),
    ).rejects.toThrow('artifact kind');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('BoldSign webhook verification', () => {
  it('accepts a matching current or rotated signature and normalizes the event', () => {
    const payload = webhookPayload();
    const provider = adapter(vi.fn(), {
      webhookSecrets: ['old-secret', webhookSecret],
    });
    const current = webhookSignature(payload);
    const old = webhookSignature(payload, 'old-secret', undefined, 's1').split(
      '=',
    )[2];
    const event = provider.parseWebhook({
      payload,
      signature: `${current},s1=${old}`,
    });

    expect(event).toMatchObject({
      id: 'event_123',
      provider: 'boldsign',
      tenantId,
      requestId: 'doc_123',
      type: 'Signed',
      status: 'partially_signed',
      environment: 'Test',
      signers: [
        {
          id: 'signer_1',
          status: 'signed',
          authenticationMethod: 'email_otp',
        },
      ],
      replay: {
        deduplicationKey: 'boldsign:tenant_123:event_123',
        orderingKey: 'boldsign:tenant_123:doc_123',
      },
    });
    expect(event.createdAt).toEqual(now);
  });

  it('uses Completed, Revoked, Expired, and SendFailed as terminal states', () => {
    const provider = adapter(vi.fn());

    for (const [type, status] of [
      ['Completed', 'completed'],
      ['Revoked', 'cancelled'],
      ['Expired', 'expired'],
      ['SendFailed', 'failed'],
    ] as const) {
      const payload = webhookPayload(type);
      expect(
        provider.parseWebhook({
          payload,
          signature: webhookSignature(payload),
        }).status,
      ).toBe(status);
    }
  });

  it('rejects modified, stale, future, and malformed webhook inputs', () => {
    const payload = webhookPayload();
    const valid = webhookSignature(payload);

    expect(() =>
      verifyBoldSignWebhookSignature({
        payload: `${payload} `,
        signature: valid,
        secrets: webhookSecret,
        now,
      }),
    ).toThrow(SignatureVerificationError);
    expect(() =>
      verifyBoldSignWebhookSignature({
        payload,
        signature: webhookSignature(
          payload,
          webhookSecret,
          Math.floor(now.getTime() / 1_000) - 301,
        ),
        secrets: webhookSecret,
        now,
      }),
    ).toThrow('outside the allowed tolerance');
    expect(() =>
      verifyBoldSignWebhookSignature({
        payload,
        signature: webhookSignature(
          payload,
          webhookSecret,
          Math.floor(now.getTime() / 1_000) + 301,
        ),
        secrets: webhookSecret,
        now,
      }),
    ).toThrow('outside the allowed tolerance');
    expect(() =>
      verifyBoldSignWebhookSignature({
        payload,
        signature: 't=nope,s0=abcd',
        secrets: webhookSecret,
        now,
      }),
    ).toThrow('timestamp');
  });

  it('rejects signed webhooks that are unbound or bound to another tenant', () => {
    const provider = adapter(vi.fn());
    const payload = webhookPayload('Signed', {
      metaData: { [BOLDSIGN_TENANT_METADATA_KEY]: 'other_tenant' },
    });

    expect(() =>
      provider.parseWebhook({
        payload,
        signature: webhookSignature(payload),
      }),
    ).toThrow(SignatureTenantMismatchError);
  });

  it('rejects unknown signed event types before normalization', () => {
    const provider = adapter(vi.fn());
    const payload = webhookPayload('FutureEvent');

    expect(() =>
      provider.parseWebhook({
        payload,
        signature: webhookSignature(payload),
      }),
    ).toThrow('Unsupported BoldSign webhook event type');
  });

  it('exposes stable replay keys and timestamps for duplicate and reordered events', () => {
    const provider = adapter(vi.fn());
    const first = webhookPayload('Sent');
    const duplicate = provider.parseWebhook({
      payload: first,
      signature: webhookSignature(first),
    });
    const duplicateAgain = provider.parseWebhook({
      payload: first,
      signature: webhookSignature(first),
    });
    const olderTimestamp = Math.floor(now.getTime() / 1_000) - 10;
    const older = JSON.stringify({
      ...JSON.parse(webhookPayload('Sent')),
      event: {
        id: 'event_older',
        eventType: 'Sent',
        created: olderTimestamp,
        environment: 'Test',
      },
    });
    const reordered = provider.parseWebhook({
      payload: older,
      signature: webhookSignature(older, webhookSecret, olderTimestamp),
    });

    expect(duplicateAgain.replay.deduplicationKey).toBe(
      duplicate.replay.deduplicationKey,
    );
    expect(reordered.replay.orderingKey).toBe(duplicate.replay.orderingKey);
    expect(reordered.createdAt.getTime()).toBeLessThan(
      duplicate.createdAt.getTime(),
    );
  });

  it('maps delivery failures onto signer state', () => {
    const provider = adapter(vi.fn());
    const payload = webhookPayload('DeliveryFailed', {
      signerDetails: [
        {
          id: 'signer_1',
          signerName: 'Alex Example',
          signerEmail: 'alex@example.com',
          status: 'NotCompleted',
          isDeliveryFailed: true,
          isAuthenticationFailed: false,
        },
      ],
    });
    const event = provider.parseWebhook({
      payload,
      signature: webhookSignature(payload),
    });

    expect(event.type).toBe('DeliveryFailed');
    expect(event.status).toBe('sent');
    expect(event.signers[0]).toMatchObject({
      status: 'failed',
      deliveryFailed: true,
    });
  });

  it('requires configured secrets and valid event identifiers', () => {
    const payload = webhookPayload();
    const noWebhookProvider = adapter(vi.fn(), { webhookSecrets: undefined });

    expect(() =>
      noWebhookProvider.parseWebhook({
        payload,
        signature: webhookSignature(payload),
      }),
    ).toThrow('requires webhookSecrets');

    const invalidPayload = webhookPayload('Signed');
    const missingId = invalidPayload.replace('"event_123"', '""');
    expect(() =>
      adapter(vi.fn()).parseWebhook({
        payload: missingId,
        signature: webhookSignature(missingId),
      }),
    ).toThrow('event id');

    const invalidCreated = invalidPayload.replace(
      String(Math.floor(now.getTime() / 1_000)),
      '1.5',
    );
    expect(() =>
      adapter(vi.fn()).parseWebhook({
        payload: invalidCreated,
        signature: webhookSignature(invalidCreated),
      }),
    ).toThrow('epoch timestamp');
  });
});

describe('signature provider factory', () => {
  it('loads the BoldSign adapter behind the provider-neutral factory', async () => {
    const provider = await createSignatureProvider({
      type: 'boldsign',
      tenantId,
      apiKey,
      fetch: vi.fn(),
    });

    expect(provider).toBeInstanceOf(BoldSignAdapter);
  });

  it('rejects unknown provider types', async () => {
    await expect(
      createSignatureProvider({ type: 'unknown' } as never),
    ).rejects.toThrow('Unknown signature provider type');
  });
});
