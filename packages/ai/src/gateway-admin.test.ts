/**
 * Gateway admin key lifecycle and project lookup (#1494): update, delete,
 * getProject and listProjects on the Bifrost and LiteLLM admin providers,
 * against mocked HTTP.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BifrostProvider } from './shared/providers/bifrost';
import { LiteLLMProvider } from './shared/providers/litellm';
import { AIError } from './shared/types';

const BIFROST_KEY_VALUE = 'sk-bf-not-a-real-key-value';
const LITELLM_KEY_VALUE = 'sk-litellm-not-a-real-key-value';

interface RecordedCall {
  method: string;
  url: string;
  body: any;
}

type Route = (call: RecordedCall) => Response | Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let calls: RecordedCall[];
let originalFetch: typeof fetch;

function mockFetch(route: Route): void {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: RecordedCall = {
      method: init?.method ?? 'GET',
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return route(call);
  }) as any;
}

function bifrostAdmin() {
  return new BifrostProvider({
    type: 'bifrost',
    apiKey: 'runtime-key',
    adminUser: 'admin',
    adminPassword: 'secret',
    baseUrl: 'http://bifrost.local/openai',
  }).admin;
}

function litellmAdmin() {
  return new LiteLLMProvider({
    type: 'litellm',
    apiKey: 'runtime-key',
    adminApiKey: 'admin-key',
    baseUrl: 'https://llm.example.com/v1',
  }).admin;
}

function expectNoKeyValue(value: unknown, keyValue: string): void {
  expect(JSON.stringify(value)).not.toContain(keyValue);
}

beforeEach(() => {
  calls = [];
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('BifrostAdmin key lifecycle', () => {
  it('updates a virtual key with PUT and never returns the key value', async () => {
    mockFetch(() =>
      jsonResponse({
        message: 'Virtual key updated successfully',
        virtual_key: {
          id: 'vk-1',
          name: 'Tenant A',
          value: BIFROST_KEY_VALUE,
          team_id: 'team-1',
          customer_id: 'tenant-a',
          provider_configs: [
            { provider: 'openai', keys: [{ value: 'sk-provider-0123456789' }] },
          ],
        },
      }),
    );

    const key = await bifrostAdmin().updateVirtualKey('vk-1', {
      budget: { maxLimit: 50, resetDuration: '1M' },
      rateLimit: { tokenMaxLimit: 2000, requestMaxLimit: 40 },
      isActive: false,
      description: 'Pro plan',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toBe(
      'http://bifrost.local/api/governance/virtual-keys/vk-1',
    );
    expect(calls[0].body).toEqual({
      description: 'Pro plan',
      budget: { max_limit: 50, reset_duration: '1M' },
      rate_limit: { token_max_limit: 2000, request_max_limit: 40 },
      is_active: false,
    });
    expect(key).toEqual(
      expect.objectContaining({
        id: 'vk-1',
        name: 'Tenant A',
        projectId: 'team-1',
        tenantId: 'tenant-a',
        provider: 'bifrost',
      }),
    );
    expect(key.key).toBeUndefined();
    expectNoKeyValue(key, BIFROST_KEY_VALUE);
    expectNoKeyValue(key, 'sk-provider-0123456789');
  });

  it('sends only the fields given and encodes the id', async () => {
    mockFetch(() => jsonResponse({ virtual_key: { id: 'vk/2' } }));

    await bifrostAdmin().updateVirtualKey('vk/2', {
      budget: { maxLimit: 10 },
    });

    expect(calls[0].url).toBe(
      'http://bifrost.local/api/governance/virtual-keys/vk%2F2',
    );
    expect(calls[0].body).toEqual({ budget: { max_limit: 10 } });
  });

  it('rejects fields Bifrost keys do not have instead of dropping them', async () => {
    mockFetch(() => jsonResponse({}));
    const admin = bifrostAdmin();

    await expect(
      admin.updateVirtualKey('vk-1', { models: ['gpt-4o'] }),
    ).rejects.toMatchObject({ code: 'ADMIN_UNSUPPORTED_FIELD' });
    await expect(
      admin.updateVirtualKey('vk-1', { metadata: { plan: 'pro' } }),
    ).rejects.toMatchObject({ code: 'ADMIN_UNSUPPORTED_FIELD' });
    expect(calls).toHaveLength(0);
  });

  it('deletes a virtual key and resolves true', async () => {
    mockFetch(() => jsonResponse({ message: 'Virtual key deleted' }));

    await expect(bifrostAdmin().deleteVirtualKey('vk-1')).resolves.toBe(true);
    expect(calls[0]).toMatchObject({
      method: 'DELETE',
      url: 'http://bifrost.local/api/governance/virtual-keys/vk-1',
    });
  });

  it('resolves false when deleting a missing key', async () => {
    mockFetch(() =>
      jsonResponse({ error: { message: 'Virtual key not found' } }, 404),
    );

    await expect(bifrostAdmin().deleteVirtualKey('vk-missing')).resolves.toBe(
      false,
    );
  });

  it('throws typed errors on auth failure without echoing key values', async () => {
    mockFetch(() =>
      jsonResponse(
        { error: { message: `invalid credentials for ${BIFROST_KEY_VALUE}` } },
        401,
      ),
    );

    const error = await bifrostAdmin()
      .deleteVirtualKey(BIFROST_KEY_VALUE)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).code).toBe('AUTH_ERROR');
    expect((error as AIError).message).not.toContain(BIFROST_KEY_VALUE);
    expect((error as AIError).message).toContain('[REDACTED]');
  });

  it('redacts a caller-supplied id from network failures', async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError(`connect ECONNREFUSED while fetching opaque-id-xyz`);
    }) as any;

    const error = await bifrostAdmin()
      .updateVirtualKey('opaque-id-xyz', { isActive: true })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'ADMIN_REQUEST_FAILED' });
    expect((error as AIError).message).not.toContain('opaque-id-xyz');
  });

  it('gets a project and resolves undefined when missing', async () => {
    mockFetch((call) =>
      call.url.endsWith('/teams/team-1')
        ? jsonResponse({
            team: {
              id: 'team-1',
              name: 'Tenant A',
              customer_id: 'tenant-a',
              budget_id: 'budget-1',
              virtual_keys: [{ id: 'vk-1', value: BIFROST_KEY_VALUE }],
            },
          })
        : jsonResponse({ error: { message: 'Team not found' } }, 404),
    );
    const admin = bifrostAdmin();

    const project = await admin.getProject('team-1');
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: 'http://bifrost.local/api/governance/teams/team-1',
    });
    expect(project).toEqual(
      expect.objectContaining({
        id: 'team-1',
        name: 'Tenant A',
        tenantId: 'tenant-a',
        budgetId: 'budget-1',
        provider: 'bifrost',
      }),
    );
    expectNoKeyValue(project, BIFROST_KEY_VALUE);

    await expect(admin.getProject('team-missing')).resolves.toBeUndefined();
  });

  it('lists projects filtered by customer_id', async () => {
    mockFetch(() =>
      jsonResponse({
        teams: [
          { id: 'team-1', name: 'A', customer_id: 'tenant-a' },
          {
            id: 'team-2',
            name: `B ${BIFROST_KEY_VALUE}`,
            customer_id: 'tenant-b',
          },
        ],
        count: 2,
      }),
    );
    const admin = bifrostAdmin();

    const filtered = await admin.listProjects({ tenantId: 'tenant-a' });
    expect(calls[0].url).toBe(
      'http://bifrost.local/api/governance/teams?customer_id=tenant-a',
    );
    expect(filtered.map((p) => p.id)).toEqual(['team-1']);

    const all = await admin.listProjects();
    expect(calls[1].url).toBe('http://bifrost.local/api/governance/teams');
    expect(all.map((p) => p.id)).toEqual(['team-1', 'team-2']);
    expectNoKeyValue(all, BIFROST_KEY_VALUE);
  });
});

describe('LiteLLMAdmin key lifecycle', () => {
  it('returns the hashed token id from createVirtualKey, never the key value', async () => {
    mockFetch(() =>
      jsonResponse({
        key: LITELLM_KEY_VALUE,
        token_id: 'hashed-token-1',
        key_alias: 'Tenant A',
      }),
    );

    const key = await litellmAdmin().createVirtualKey({ name: 'Tenant A' });
    expect(key.id).toBe('hashed-token-1');
    expect(key.key).toBe(LITELLM_KEY_VALUE);
  });

  it('does not use the key value as id when the gateway echoes it', async () => {
    mockFetch(() =>
      jsonResponse({ key: LITELLM_KEY_VALUE, key_id: LITELLM_KEY_VALUE }),
    );

    const key = await litellmAdmin().createVirtualKey({ name: 'Tenant A' });
    expect(key.id).toBeUndefined();
  });

  it('updates budget, rate limit, models and blocked via /key/update', async () => {
    mockFetch(() =>
      jsonResponse({
        key: 'hashed-token-1',
        token: 'hashed-token-1',
        key_alias: 'Tenant A',
        key_name: 'sk-...CRET',
        team_id: 'team-1',
        metadata: { tenant_id: 'tenant-a' },
        max_budget: 50,
      }),
    );

    const key = await litellmAdmin().updateVirtualKey('hashed-token-1', {
      budget: { maxLimit: 50, resetDuration: '30d' },
      rateLimit: { tpmLimit: 2000, rpmLimit: 40 },
      models: ['gpt-4o-mini'],
      isActive: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://llm.example.com/key/update',
    });
    expect(calls[0].body).toEqual({
      key: 'hashed-token-1',
      models: ['gpt-4o-mini'],
      max_budget: 50,
      budget_duration: '30d',
      tpm_limit: 2000,
      rpm_limit: 40,
      blocked: true,
    });
    expect(key).toEqual(
      expect.objectContaining({
        id: 'hashed-token-1',
        name: 'Tenant A',
        maskedKey: 'sk-...CRET',
        projectId: 'team-1',
        tenantId: 'tenant-a',
        provider: 'litellm',
      }),
    );
    expect(key.key).toBeUndefined();
  });

  it('merges metadata and description into existing metadata', async () => {
    mockFetch((call) =>
      call.url.includes('/key/info')
        ? jsonResponse({
            key: 'hashed-token-1',
            info: {
              metadata: { tenant_id: 'tenant-a', description: 'old' },
            },
          })
        : jsonResponse({ key: 'hashed-token-1' }),
    );

    const key = await litellmAdmin().updateVirtualKey('hashed-token-1', {
      description: 'Pro plan',
      metadata: { plan: 'pro' },
    });

    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: 'https://llm.example.com/key/info?key=hashed-token-1',
    });
    expect(calls[1].body).toEqual({
      key: 'hashed-token-1',
      metadata: { tenant_id: 'tenant-a', description: 'Pro plan', plan: 'pro' },
    });
    expect(key.tenantId).toBe('tenant-a');
  });

  it('redacts a key value used as the id from update responses', async () => {
    mockFetch(() =>
      jsonResponse({
        key: LITELLM_KEY_VALUE,
        // A caller-chosen alias that happens to embed the key value.
        key_alias: `alias ${LITELLM_KEY_VALUE}`,
      }),
    );

    const key = await litellmAdmin().updateVirtualKey(LITELLM_KEY_VALUE, {
      budget: { maxLimit: 5 },
    });

    expect(key.key).toBeUndefined();
    expectNoKeyValue(key, LITELLM_KEY_VALUE);
  });

  it('rejects providerConfigs, which LiteLLM keys do not have', async () => {
    mockFetch(() => jsonResponse({}));

    await expect(
      litellmAdmin().updateVirtualKey('hashed-token-1', {
        providerConfigs: [{ provider: 'openai' }],
      }),
    ).rejects.toMatchObject({ code: 'ADMIN_UNSUPPORTED_FIELD' });
    expect(calls).toHaveLength(0);
  });

  it('deletes a key via /key/delete and resolves true', async () => {
    mockFetch(() => jsonResponse({ deleted_keys: ['hashed-token-1'] }));

    await expect(
      litellmAdmin().deleteVirtualKey('hashed-token-1'),
    ).resolves.toBe(true);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://llm.example.com/key/delete',
      body: { keys: ['hashed-token-1'] },
    });
  });

  it.each([
    ['a 404', () => jsonResponse({ error: { message: 'Key not found' } }, 404)],
    [
      'a 400 not-found message',
      () =>
        jsonResponse(
          { error: { message: `Key ${LITELLM_KEY_VALUE} not found in db` } },
          400,
        ),
    ],
    [
      'a 500 failed-to-delete message',
      () =>
        jsonResponse(
          {
            error: { message: 'Failed to delete all keys. Tried to delete 1' },
          },
          500,
        ),
    ],
    ['an empty deleted_keys list', () => jsonResponse({ deleted_keys: [] })],
  ])('resolves false when deleting a missing key (%s)', async (_label, response) => {
    mockFetch(response);

    await expect(
      litellmAdmin().deleteVirtualKey('hashed-missing'),
    ).resolves.toBe(false);
  });

  it('throws typed errors on other failures without echoing key values', async () => {
    mockFetch(() =>
      jsonResponse(
        {
          error: {
            message: `Authentication Error, bad key ${LITELLM_KEY_VALUE}`,
          },
        },
        401,
      ),
    );

    const error = await litellmAdmin()
      .deleteVirtualKey(LITELLM_KEY_VALUE)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).code).toBe('AUTH_ERROR');
    expect((error as AIError).message).not.toContain(LITELLM_KEY_VALUE);
  });

  it('rethrows a 500 that is not a missing key', async () => {
    mockFetch(() => jsonResponse({ error: { message: 'database down' } }, 500));

    await expect(
      litellmAdmin().deleteVirtualKey('hashed-token-1'),
    ).rejects.toMatchObject({ code: 'ADMIN_HTTP_500', retryable: true });
  });

  it('gets a project via /team/info and resolves undefined when missing', async () => {
    mockFetch((call) =>
      call.url.includes('team_id=team-1')
        ? jsonResponse({
            team_id: 'team-1',
            team_info: {
              team_id: 'team-1',
              team_alias: 'Tenant A',
              metadata: { tenant_id: 'tenant-a' },
              keys: [{ token: 'hashed-token-1', key: LITELLM_KEY_VALUE }],
            },
          })
        : jsonResponse({ error: { message: 'Team not found' } }, 404),
    );
    const admin = litellmAdmin();

    const project = await admin.getProject('team-1');
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: 'https://llm.example.com/team/info?team_id=team-1',
    });
    expect(project).toEqual(
      expect.objectContaining({
        id: 'team-1',
        name: 'Tenant A',
        tenantId: 'tenant-a',
        provider: 'litellm',
      }),
    );
    expectNoKeyValue(project, LITELLM_KEY_VALUE);

    await expect(admin.getProject('team-missing')).resolves.toBeUndefined();
  });

  it('lists projects via /team/list filtered by metadata.tenant_id', async () => {
    mockFetch(() =>
      jsonResponse([
        {
          team_id: 'team-1',
          team_alias: 'A',
          metadata: { tenant_id: 'tenant-a' },
        },
        {
          team_id: 'team-2',
          team_alias: 'B',
          metadata: { tenant_id: 'tenant-b' },
        },
        { team_id: 'team-3', team_alias: 'C' },
      ]),
    );
    const admin = litellmAdmin();

    const filtered = await admin.listProjects({ tenantId: 'tenant-a' });
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: 'https://llm.example.com/team/list',
    });
    expect(filtered.map((p) => p.id)).toEqual(['team-1']);
    expect((await admin.listProjects()).map((p) => p.id)).toEqual([
      'team-1',
      'team-2',
      'team-3',
    ]);
  });

  it('requires an id', async () => {
    mockFetch(() => jsonResponse({}));

    await expect(litellmAdmin().deleteVirtualKey('')).rejects.toMatchObject({
      code: 'ADMIN_INVALID_ARGUMENT',
    });
    expect(calls).toHaveLength(0);
  });
});
