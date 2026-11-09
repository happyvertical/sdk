import type {
  AIAdminBudget,
  AIAdminInterface,
  AIAdminProject,
  AIAdminProviderConfig,
  AIAdminRateLimit,
  AIVirtualKey,
  CreateAIProjectOptions,
  CreateAIVirtualKeyOptions,
  ListAIProjectsFilter,
  UpdateAIVirtualKeyOptions,
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

const REDACTED = '[REDACTED]';

/**
 * Full gateway key values (`sk-...`, `sk-bf-...`). Masked forms such as
 * `sk-...abcd` do not match because `.` is outside the character class.
 */
const KEY_VALUE_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}/g;

/** Response fields that carry key values or other secrets. */
const SECRET_FIELDS = new Set([
  'key',
  'value',
  'token',
  'api_key',
  'apikey',
  'secret',
  'password',
  'master_key',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove key values from a string: anything shaped like a gateway key, plus
 * each caller-supplied secret (for example the identifier a caller passed,
 * which may itself be a key value).
 */
export function redactSecretText(text: string, secrets: string[] = []): string {
  let result = text;
  for (const secret of secrets) {
    if (secret) {
      result = result.replace(new RegExp(escapeRegExp(secret), 'g'), REDACTED);
    }
  }
  return result.replace(KEY_VALUE_PATTERN, REDACTED);
}

/**
 * Deep-copy a provider response with secret fields and key-shaped strings
 * replaced by `[REDACTED]`.
 */
export function redactSecrets(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === 'string') {
    return redactSecretText(value, secrets);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, secrets));
  }

  if (value && typeof value === 'object') {
    const result: JsonRecord = {};
    for (const [field, item] of Object.entries(value as JsonRecord)) {
      result[field] =
        SECRET_FIELDS.has(field.toLowerCase()) && typeof item === 'string'
          ? REDACTED
          : redactSecrets(item, secrets);
    }
    return result;
  }

  return value;
}

/**
 * First candidate that is a non-empty string and not shaped like a key value,
 * so an `AIVirtualKey.id` never carries a secret even when a caller managed a
 * key by its value.
 */
function safeKeyHandle(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    const value = stringValue(candidate);
    if (value && redactSecretText(value) === value) return value;
  }

  return undefined;
}

function requireAdminId(id: string, provider: string, what: string): string {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new AIError(
      `${provider} ${what} id is required`,
      'ADMIN_INVALID_ARGUMENT',
      provider,
    );
  }

  return id;
}

function unsupportedField(provider: string, field: string): AIError {
  return new AIError(
    `${provider} does not support updating virtual key ${field}`,
    'ADMIN_UNSUPPORTED_FIELD',
    provider,
  );
}

function isNotFoundError(
  error: unknown,
  options: { messageStatuses?: number[]; messagePattern?: RegExp } = {},
): boolean {
  if (!(error instanceof AIError)) return false;
  if (error.code === 'ADMIN_HTTP_404') return true;

  const pattern = options.messagePattern;
  return Boolean(
    pattern &&
      options.messageStatuses?.some(
        (status) => error.code === `ADMIN_HTTP_${status}`,
      ) &&
      pattern.test(error.message),
  );
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

  /**
   * Send an admin request. Error messages are redacted of key-shaped values
   * and of every string in `secrets`.
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
    secrets: string[] = [],
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
        throw this.mapResponseError(response, parsed, secrets);
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }

      throw new AIError(
        redactSecretText(
          `${this.provider} admin request failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          secrets,
        ),
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

  private mapResponseError(
    response: Response,
    body: unknown,
    secrets: string[],
  ): AIError {
    const message = redactSecretText(
      responseMessage(
        body,
        `${this.provider} admin request failed with ${response.status}`,
      ),
      secrets,
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

function arrayOfRecords(value: unknown, ...fields: string[]): JsonRecord[] {
  if (Array.isArray(value)) return value.map(toJsonRecord);

  const record = toJsonRecord(value);
  for (const field of fields) {
    if (Array.isArray(record[field])) {
      return (record[field] as unknown[]).map(toJsonRecord);
    }
  }

  return [];
}

function toBifrostProject(
  team: JsonRecord,
  raw: unknown,
): AIAdminProject | undefined {
  const id = stringValue(team.id) || stringValue(team.team_id);
  if (!id) return undefined;

  return {
    id,
    name: stringValue(team.name) || stringValue(team.team_alias) || id,
    tenantId: stringValue(team.customer_id),
    budgetId: stringValue(team.budget_id),
    provider: 'bifrost',
    raw: redactSecrets(raw),
  };
}

function toLiteLLMProject(
  team: JsonRecord,
  raw: unknown,
): AIAdminProject | undefined {
  const id = stringValue(team.team_id) || stringValue(team.id);
  if (!id) return undefined;

  return {
    id,
    name: stringValue(team.team_alias) || stringValue(team.name) || id,
    tenantId: stringValue(toJsonRecord(team.metadata).tenant_id),
    budgetId: stringValue(team.budget_id),
    provider: 'litellm',
    raw: redactSecrets(raw),
  };
}

/**
 * LiteLLM reports some missing resources as 400/500 with a message rather
 * than a 404, depending on version.
 */
const LITELLM_NOT_FOUND = {
  messageStatuses: [400, 500],
  messagePattern:
    /not\s+found|does\s+not\s+exist|doesn't\s+exist|failed to delete all keys/i,
};

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

  async updateVirtualKey(
    id: string,
    options: UpdateAIVirtualKeyOptions,
  ): Promise<AIVirtualKey> {
    requireAdminId(id, 'bifrost', 'virtual key');
    if (options.models !== undefined) {
      throw unsupportedField('bifrost', 'models (use providerConfigs)');
    }
    if (options.metadata !== undefined) {
      throw unsupportedField('bifrost', 'metadata');
    }

    const body = removeUndefinedValues({
      description: options.description,
      provider_configs: mapBifrostProviderConfigs(options.providerConfigs),
      budget: mapBifrostBudget(options.budget),
      rate_limit: mapBifrostRateLimit(options.rateLimit),
      is_active: options.isActive,
    });

    const response = await this.transport.request<JsonRecord>(
      'PUT',
      `/api/governance/virtual-keys/${encodeURIComponent(id)}`,
      body,
      undefined,
      [id],
    );
    const virtualKey = toJsonRecord(
      response?.virtual_key ?? response?.virtualKey ?? response,
    );

    return {
      id: safeKeyHandle(virtualKey.id, id),
      name: stringValue(virtualKey.name),
      projectId: stringValue(virtualKey.team_id),
      tenantId: stringValue(virtualKey.customer_id),
      expiresAt:
        stringValue(virtualKey.expires) || stringValue(virtualKey.expires_at),
      provider: 'bifrost',
      raw: redactSecrets(response, [id]),
    };
  }

  async deleteVirtualKey(id: string): Promise<boolean> {
    requireAdminId(id, 'bifrost', 'virtual key');

    try {
      await this.transport.request<unknown>(
        'DELETE',
        `/api/governance/virtual-keys/${encodeURIComponent(id)}`,
        undefined,
        undefined,
        [id],
      );
      return true;
    } catch (error) {
      if (isNotFoundError(error)) return false;
      throw error;
    }
  }

  async getProject(id: string): Promise<AIAdminProject | undefined> {
    requireAdminId(id, 'bifrost', 'project');

    try {
      const response = await this.transport.request<JsonRecord>(
        'GET',
        `/api/governance/teams/${encodeURIComponent(id)}`,
      );
      return toBifrostProject(
        toJsonRecord(response?.team ?? response),
        response,
      );
    } catch (error) {
      if (isNotFoundError(error)) return undefined;
      throw error;
    }
  }

  async listProjects(
    filter: ListAIProjectsFilter = {},
  ): Promise<AIAdminProject[]> {
    const response = await this.transport.request<unknown>(
      'GET',
      '/api/governance/teams',
      undefined,
      { customer_id: filter.tenantId },
    );

    return arrayOfRecords(response, 'teams', 'data')
      .map((team) => toBifrostProject(team, team))
      .filter(
        (project): project is AIAdminProject =>
          project !== undefined &&
          (filter.tenantId === undefined ||
            project.tenantId === filter.tenantId),
      );
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

    const keyValue = stringValue(response.key);
    const handle =
      stringValue(response.token_id) || stringValue(response.key_id);

    return {
      // Never let the key value double as the stable handle.
      id: handle && handle !== keyValue ? safeKeyHandle(handle) : undefined,
      name:
        stringValue(response.key_alias) ||
        stringValue(response.key_name) ||
        options.name,
      key: keyValue,
      maskedKey: stringValue(response.key_name),
      projectId: stringValue(response.team_id) || options.projectId,
      tenantId: options.tenantId,
      expiresAt: stringValue(response.expires),
      provider: 'litellm',
      raw: response,
    };
  }

  async updateVirtualKey(
    id: string,
    options: UpdateAIVirtualKeyOptions,
  ): Promise<AIVirtualKey> {
    requireAdminId(id, 'litellm', 'virtual key');
    if (options.providerConfigs !== undefined) {
      throw unsupportedField('litellm', 'providerConfigs');
    }

    let metadata: Record<string, unknown> | undefined;
    if (options.metadata !== undefined || options.description !== undefined) {
      // LiteLLM replaces metadata wholesale; merge so tenant_id survives.
      const info = await this.transport.request<JsonRecord>(
        'GET',
        '/key/info',
        undefined,
        { key: id },
        [id],
      );
      metadata = {
        ...toJsonRecord(toJsonRecord(info?.info).metadata),
        ...options.metadata,
        ...(options.description !== undefined
          ? { description: options.description }
          : {}),
      };
    }

    const body = removeUndefinedValues({
      key: id,
      models: options.models,
      ...mapLiteLLMBudget(options.budget),
      ...mapLiteLLMRateLimit(options.rateLimit),
      metadata,
      blocked: options.isActive === undefined ? undefined : !options.isActive,
    });

    const response = await this.transport.request<JsonRecord>(
      'POST',
      '/key/update',
      body,
      undefined,
      [id],
    );
    const updated = toJsonRecord(response);

    return {
      id: safeKeyHandle(id, updated.token_id, updated.token),
      name: stringValue(updated.key_alias),
      maskedKey: stringValue(updated.key_name),
      projectId: stringValue(updated.team_id),
      tenantId: stringValue(
        toJsonRecord(updated.metadata ?? metadata).tenant_id,
      ),
      expiresAt: stringValue(updated.expires),
      provider: 'litellm',
      raw: redactSecrets(response, [id]),
    };
  }

  async deleteVirtualKey(id: string): Promise<boolean> {
    requireAdminId(id, 'litellm', 'virtual key');

    try {
      const response = await this.transport.request<JsonRecord>(
        'POST',
        '/key/delete',
        { keys: [id] },
        undefined,
        [id],
      );
      const deleted = toJsonRecord(response).deleted_keys;
      return !(Array.isArray(deleted) && deleted.length === 0);
    } catch (error) {
      if (isNotFoundError(error, LITELLM_NOT_FOUND)) return false;
      throw error;
    }
  }

  async getProject(id: string): Promise<AIAdminProject | undefined> {
    requireAdminId(id, 'litellm', 'project');

    try {
      const response = await this.transport.request<JsonRecord>(
        'GET',
        '/team/info',
        undefined,
        { team_id: id },
      );
      const record = toJsonRecord(response);
      const team = toJsonRecord(record.team_info ?? record);
      return toLiteLLMProject(
        {
          ...team,
          team_id: stringValue(team.team_id) || stringValue(record.team_id),
        },
        response,
      );
    } catch (error) {
      if (isNotFoundError(error, LITELLM_NOT_FOUND)) return undefined;
      throw error;
    }
  }

  async listProjects(
    filter: ListAIProjectsFilter = {},
  ): Promise<AIAdminProject[]> {
    const response = await this.transport.request<unknown>('GET', '/team/list');

    return arrayOfRecords(response, 'teams', 'data')
      .map((team) => toLiteLLMProject(team, team))
      .filter(
        (project): project is AIAdminProject =>
          project !== undefined &&
          (filter.tenantId === undefined ||
            project.tenantId === filter.tenantId),
      );
  }
}
