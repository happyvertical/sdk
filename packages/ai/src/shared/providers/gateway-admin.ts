import type {
  AIAdminBudget,
  AIAdminInterface,
  AIAdminProject,
  AIAdminProviderConfig,
  AIAdminRateLimit,
  AIVirtualKey,
  CreateAIProjectOptions,
  CreateAIVirtualKeyOptions,
} from '../types';
import { AIError } from '../types';

interface GatewayAdminTransportOptions {
  provider: string;
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

type JsonRecord = Record<string, unknown>;

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function normalizeGatewayBaseUrl(baseUrl: string): string {
  return stripTrailingSlash(baseUrl.trim());
}

/**
 * Derive the gateway root URL for admin APIs from an OpenAI-compatible base URL.
 *
 * Strips known inference path suffixes iteratively so that a baseUrl such as
 * `http://host/openai/v1` collapses to the gateway root rather than to the
 * partial `http://host/openai`.
 */
export function deriveGatewayAdminBaseUrl(baseUrl: string): string {
  let normalized = normalizeGatewayBaseUrl(baseUrl);
  const suffixes = ['/pydanticai/v1', '/openai', '/v1'];
  let stripped = true;

  while (stripped) {
    stripped = false;
    for (const suffix of suffixes) {
      if (normalized.endsWith(suffix)) {
        normalized = normalized.slice(0, -suffix.length);
        stripped = true;
        break;
      }
    }
  }

  return normalized || normalizeGatewayBaseUrl(baseUrl);
}

export function resolveGatewayAdminBaseUrl(
  baseUrl: string | undefined,
  adminBaseUrl: string | undefined,
  provider: string,
): string {
  const configuredBaseUrl = adminBaseUrl || baseUrl;
  if (!configuredBaseUrl?.trim()) {
    throw new AIError(
      `${provider} baseUrl is required for admin operations`,
      'ADMIN_BASE_URL_REQUIRED',
      provider,
    );
  }

  return adminBaseUrl
    ? normalizeGatewayBaseUrl(adminBaseUrl)
    : deriveGatewayAdminBaseUrl(configuredBaseUrl);
}

export function slugifyProjectId(name: string, tenantId?: string): string {
  const value = [tenantId, name].filter(Boolean).join('-');
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'ai-project';
}

function toJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function encodeBasicCredentials(username: string, password: string): string {
  const value = `${username}:${password}`;

  if (typeof btoa === 'function') {
    return btoa(value);
  }

  return Buffer.from(value, 'utf8').toString('base64');
}

function removeUndefinedValues<T extends JsonRecord>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }

  return value;
}

function createMetadata(
  options: {
    tenantId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  },
  tenantField = 'tenant_id',
): Record<string, unknown> | undefined {
  const metadata = {
    ...options.metadata,
  };

  if (options.tenantId) {
    metadata[tenantField] = options.tenantId;
  }

  if (options.description) {
    metadata.description = options.description;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function responseMessage(body: unknown, fallback: string): string {
  const record = toJsonRecord(body);
  const error = toJsonRecord(record.error);

  return (
    stringValue(error.message) ||
    stringValue(record.message) ||
    stringValue(record.detail) ||
    fallback
  );
}

class GatewayAdminTransport {
  private readonly baseUrl: string;
  private readonly provider: string;
  private readonly apiKey?: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly headers?: Record<string, string>;
  private readonly timeout?: number;

  constructor(options: GatewayAdminTransportOptions) {
    this.provider = options.provider;
    this.baseUrl = normalizeGatewayBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey;
    this.username = options.username;
    this.password = options.password;
    this.headers = options.headers;
    this.timeout = options.timeout;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
  ): Promise<T> {
    const url = new URL(
      `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`,
    );

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, value);
        }
      }
    }

    const controller =
      typeof AbortController === 'undefined'
        ? undefined
        : new AbortController();
    const timeoutHandle =
      controller && this.timeout
        ? setTimeout(() => controller.abort(), this.timeout)
        : undefined;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...this.headers,
          ...this.createAuthHeaders(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller?.signal,
      });

      const text = await response.text();
      const parsed = text ? this.parseJson(text) : undefined;

      if (!response.ok) {
        throw this.mapResponseError(response, parsed);
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }

      throw new AIError(
        `${this.provider} admin request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'ADMIN_REQUEST_FAILED',
        this.provider,
      );
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private createAuthHeaders(): Record<string, string> {
    if (this.username && this.password) {
      return {
        Authorization: `Basic ${encodeBasicCredentials(
          this.username,
          this.password,
        )}`,
      };
    }

    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  private parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return { message: text };
    }
  }

  private mapResponseError(response: Response, body: unknown): AIError {
    const message = responseMessage(
      body,
      `${this.provider} admin request failed with ${response.status}`,
    );

    if (response.status === 401 || response.status === 403) {
      return new AIError(message, 'AUTH_ERROR', this.provider);
    }

    if (response.status === 429) {
      return new AIError(message, 'RATE_LIMIT', this.provider, undefined, true);
    }

    return new AIError(
      message,
      `ADMIN_HTTP_${response.status}`,
      this.provider,
      undefined,
      response.status >= 500,
    );
  }
}

function mapBifrostBudget(budget?: AIAdminBudget): JsonRecord | undefined {
  if (!budget) return undefined;

  return removeUndefinedValues({
    max_limit: budget.maxLimit,
    reset_duration: budget.resetDuration,
    calendar_aligned: budget.calendarAligned,
  });
}

function mapBifrostRateLimit(
  rateLimit?: AIAdminRateLimit,
): JsonRecord | undefined {
  if (!rateLimit) return undefined;

  return removeUndefinedValues({
    token_max_limit: rateLimit.tokenMaxLimit ?? rateLimit.tpmLimit,
    token_reset_duration: rateLimit.tokenResetDuration,
    request_max_limit: rateLimit.requestMaxLimit ?? rateLimit.rpmLimit,
    request_reset_duration: rateLimit.requestResetDuration,
  });
}

function mapBifrostProviderConfigs(
  configs?: AIAdminProviderConfig[],
): JsonRecord[] | undefined {
  if (!configs) return undefined;

  return configs.map((config) =>
    removeUndefinedValues({
      provider: config.provider,
      weight: config.weight,
      allowed_models: config.allowedModels,
      key_ids: config.keyIds,
    }),
  );
}

function mapLiteLLMBudget(
  budget?: AIAdminBudget,
): Pick<JsonRecord, 'max_budget' | 'budget_duration'> {
  return removeUndefinedValues({
    max_budget: budget?.maxLimit,
    budget_duration: budget?.resetDuration,
  });
}

function mapLiteLLMRateLimit(
  rateLimit?: AIAdminRateLimit,
): Pick<JsonRecord, 'tpm_limit' | 'rpm_limit'> {
  return removeUndefinedValues({
    tpm_limit: rateLimit?.tpmLimit ?? rateLimit?.tokenMaxLimit,
    rpm_limit: rateLimit?.rpmLimit ?? rateLimit?.requestMaxLimit,
  });
}

export class BifrostAdmin implements AIAdminInterface {
  private readonly transport: GatewayAdminTransport;

  constructor(options: GatewayAdminTransportOptions) {
    this.transport = new GatewayAdminTransport(options);
  }

  async createProject(
    options: CreateAIProjectOptions,
  ): Promise<AIAdminProject> {
    const body = removeUndefinedValues({
      name: options.name,
      customer_id: options.tenantId,
      budget: mapBifrostBudget(options.budget),
      ...options.raw,
    });

    const response = await this.transport.request<JsonRecord>(
      'POST',
      '/api/governance/teams',
      body,
    );
    const team = toJsonRecord(response.team ?? response);
    const id = stringValue(team.id) || stringValue(team.team_id);

    if (!id) {
      throw new AIError(
        'Bifrost did not return a project id',
        'ADMIN_INVALID_RESPONSE',
        'bifrost',
      );
    }

    return {
      id,
      name:
        stringValue(team.name) || stringValue(team.team_alias) || options.name,
      tenantId: stringValue(team.customer_id) || options.tenantId,
      budgetId: stringValue(team.budget_id),
      provider: 'bifrost',
      raw: response,
    };
  }

  async createVirtualKey(
    options: CreateAIVirtualKeyOptions,
  ): Promise<AIVirtualKey> {
    const body = removeUndefinedValues({
      name: options.name,
      description: options.description,
      provider_configs: mapBifrostProviderConfigs(options.providerConfigs),
      team_id: options.projectId,
      customer_id: options.projectId ? undefined : options.tenantId,
      budget: mapBifrostBudget(options.budget),
      rate_limit: mapBifrostRateLimit(options.rateLimit),
      key_ids: options.keyIds,
      is_active: options.isActive ?? true,
      ...options.raw,
    });

    const response = await this.transport.request<JsonRecord>(
      'POST',
      '/api/governance/virtual-keys',
      body,
    );
    const virtualKey = toJsonRecord(
      response.virtual_key ?? response.virtualKey ?? response,
    );

    return {
      id: stringValue(virtualKey.id) || stringValue(virtualKey.key_id),
      name: stringValue(virtualKey.name) || options.name,
      key: stringValue(virtualKey.value) || stringValue(virtualKey.key),
      maskedKey:
        stringValue(virtualKey.key_name) || stringValue(virtualKey.masked_key),
      projectId: stringValue(virtualKey.team_id) || options.projectId,
      tenantId: stringValue(virtualKey.customer_id) || options.tenantId,
      expiresAt:
        stringValue(virtualKey.expires) || stringValue(virtualKey.expires_at),
      provider: 'bifrost',
      raw: response,
    };
  }
}

export class LiteLLMAdmin implements AIAdminInterface {
  private readonly transport: GatewayAdminTransport;

  constructor(options: GatewayAdminTransportOptions) {
    this.transport = new GatewayAdminTransport(options);
  }

  async createProject(
    options: CreateAIProjectOptions,
  ): Promise<AIAdminProject> {
    const projectId =
      options.id || slugifyProjectId(options.name, options.tenantId);
    const body = removeUndefinedValues({
      team_id: projectId,
      team_alias: options.name,
      models: options.models,
      ...mapLiteLLMBudget(options.budget),
      ...mapLiteLLMRateLimit(options.rateLimit),
      metadata: createMetadata(options),
      blocked: options.isBlocked,
      ...options.raw,
    });

    const response = await this.transport.request<JsonRecord>(
      'POST',
      '/team/new',
      body,
    );
    const team = toJsonRecord(response.team ?? response);

    return {
      id: stringValue(team.team_id) || projectId,
      name:
        stringValue(team.team_alias) || stringValue(team.name) || options.name,
      tenantId: options.tenantId,
      provider: 'litellm',
      raw: response,
    };
  }

  async createVirtualKey(
    options: CreateAIVirtualKeyOptions,
  ): Promise<AIVirtualKey> {
    const body = removeUndefinedValues({
      key_alias: options.name,
      team_id: options.projectId,
      user_id: options.userId,
      models: options.models,
      duration: options.duration,
      ...mapLiteLLMBudget(options.budget),
      ...mapLiteLLMRateLimit(options.rateLimit),
      metadata: createMetadata(options),
      aliases: options.aliases,
      config: options.config,
      permissions: options.permissions,
      blocked: options.isActive === undefined ? undefined : !options.isActive,
      ...options.raw,
    });

    const response = await this.transport.request<JsonRecord>(
      'POST',
      '/key/generate',
      body,
    );

    return {
      id: stringValue(response.token_id) || stringValue(response.key_id),
      name:
        stringValue(response.key_alias) ||
        stringValue(response.key_name) ||
        options.name,
      key: stringValue(response.key),
      maskedKey: stringValue(response.key_name),
      projectId: stringValue(response.team_id) || options.projectId,
      tenantId: options.tenantId,
      expiresAt: stringValue(response.expires),
      provider: 'litellm',
      raw: response,
    };
  }
}
