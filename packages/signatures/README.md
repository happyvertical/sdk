# @happyvertical/signatures

Provider-neutral e-signature request, lifecycle, verified-webhook, and execution-evidence contracts. BoldSign is the first adapter.

## Status

This package is experimental while the first downstream agreement workflow validates the provider-neutral contract.

## Install

```bash
pnpm add @happyvertical/signatures
```

## BoldSign quick start

Create one adapter per tenant credential and webhook signing secret. HappyVertical deployments use BoldSign's Canadian region by default.

```typescript
import { createSignatureProvider } from '@happyvertical/signatures';

const signatures = await createSignatureProvider({
  type: 'boldsign',
  tenantId: 'tenant_123',
  apiKey: process.env.BOLDSIGN_API_KEY!,
  webhookSecrets: [process.env.BOLDSIGN_WEBHOOK_SECRET!],
  region: 'ca',
});

const request = await signatures.createRequest({
  tenantId: 'tenant_123',
  idempotencyKey: 'referral-agreement:version_456',
  title: 'Referral Agreement',
  documents: [
    {
      name: 'referral-agreement.pdf',
      mediaType: 'application/pdf',
      data: generatedPdf,
    },
  ],
  signers: [
    {
      name: 'Alex Example',
      email: 'alex@example.com',
      authentication: { method: 'email_otp' },
      fields: [
        {
          id: 'referrer_signature',
          type: 'signature',
          page: 3,
          bounds: { x: 72, y: 620, width: 180, height: 36 },
        },
      ],
    },
  ],
  expiresInDays: 30,
});
```

## Adapters

- BoldSign (`type: 'boldsign'`) uses the regional v1 document API, HMAC-verified webhooks, and PDF artifact endpoints.

The package sends JSON with base64 documents to BoldSign's asynchronous `POST /v1/document/send` API. A successful create response means BoldSign accepted processing; the verified `Sent` or `SendFailed` webhook is authoritative for the next transition.

## Webhooks and replay protection

Pass the exact raw UTF-8 request body and `X-BoldSign-Signature` header. Do not parse and re-serialize the body before verification.

```typescript
const event = signatures.parseWebhook({
  payload: rawBody,
  signature: request.headers.get('x-boldsign-signature')!,
});
```

The adapter verifies BoldSign's HMAC-SHA256 signature using constant-time comparison and rejects timestamps outside the configured tolerance (five minutes by default). It also requires the signed payload's `hvTenantId` metadata to match the adapter tenant. Persist `event.id` under a unique constraint before applying an event; the SDK intentionally does not pretend an in-memory replay cache is durable.

Configure the webhook for `Sent`, `Signed`, `Completed`, `Viewed`, `Declined`, `Revoked`, `Expired`, `DeliveryFailed`, and `SendFailed`. Other signed event types are rejected until the provider-neutral contract defines their semantics.

BoldSign sends an unsigned `Verification` callback while a webhook endpoint is configured. Acknowledge that control request before calling `parseWebhook`; do not treat it as a document event.

## Idempotency and ambiguous failures

`createRequest` requires an idempotency key and stores it in BoldSign metadata as `hvIdempotencyKey`. BoldSign's public send-document contract does not advertise an atomic idempotency header, so `capabilities.providerEnforcedIdempotency` is `false`. The durable application layer must claim the tenant/key before sending and persist the returned document ID. When `SignatureProviderError.requestMayHaveSucceeded` is true, reconcile rather than blindly sending a duplicate agreement.

## Execution evidence

Artifacts are available only after the normalized request status is `completed`:

```typescript
const signed = await signatures.downloadArtifact({
  tenantId: 'tenant_123',
  requestId: request.id,
  kind: 'signed_document',
});

const audit = await signatures.downloadArtifact({
  tenantId: 'tenant_123',
  requestId: request.id,
  kind: 'audit_trail',
});

await immutableAssets.put(signed.filename, signed.stream);
const signedSha256 = await signed.sha256;
```

Each artifact exposes a single-use byte stream and a SHA-256 promise that resolves after that stream is consumed. Persist the stream to immutable/versioned storage, then await and record the digest together with the provider request ID, event ID, tenant, signer identity, retrieval time, and agreement version. The provider is a retrieval source, not the system of record for an executed agreement.

## Operations and security

- Keep API keys, OAuth tokens, access codes, and webhook secrets in the SDK/SMRT secret store; never put them in agreement metadata or logs.
- Scope an adapter instance to exactly one tenant. Reads, mutations, downloads, and webhooks all enforce that tenant binding.
- For secret rotation, configure both valid webhook secrets temporarily. BoldSign may also include both `s0` and `s1` signatures in its header.
- `cancelRequest` requires a reason. `extendExpiry` verifies tenant ownership first and only accepts a future date.
- API credentials may use either `X-API-KEY` or an OAuth bearer token, never both.
- Use the sandbox for contract testing, but do not treat its watermarked PDFs as legal artifacts.

## Provider references

- [Regional API base URLs](https://developers.boldsign.com/api-overview/versioning/)
- [Send document](https://developers.boldsign.com/documents/send-document/)
- [Document details and status](https://developers.boldsign.com/documents/document-details-and-status)
- [Revoke document](https://developers.boldsign.com/documents/revoke-document/)
- [Extend document expiry](https://developers.boldsign.com/documents/extend-document-expiry/)
- [Verify webhook events](https://developers.boldsign.com/webhooks/verify-webhook-events/)
- [Webhook event metadata](https://developers.boldsign.com/webhooks/event-metadata/)
- [Download signed document](https://developers.boldsign.com/documents/download-document/)
- [Download audit trail](https://developers.boldsign.com/documents/download-audit-trail/)
