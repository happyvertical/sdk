import { ForgeError, type ForgeErrorCode } from '../forge/errors.js';
import type {
  ForgeRateLimit,
  ForgeResponse,
  ForgeTransport,
  ForgeTransportRequest,
} from '../forge/types.js';

export type GitHubTokenSource = string | (() => string | Promise<string>);

/** Construction options for an authenticated GitHub REST transport. */
export interface GitHubTransportOptions {
  token: GitHubTokenSource;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

function optionalInteger(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function responseRateLimit(headers: Headers): ForgeRateLimit | undefined {
  const limit = optionalInteger(headers.get('x-ratelimit-limit'));
  const remaining = optionalInteger(headers.get('x-ratelimit-remaining'));
  const used = optionalInteger(headers.get('x-ratelimit-used'));
  const reset = optionalInteger(headers.get('x-ratelimit-reset'));
  const retryAfter = optionalInteger(headers.get('retry-after'));
  if (
    limit === undefined &&
    remaining === undefined &&
    used === undefined &&
    reset === undefined &&
    retryAfter === undefined
  ) {
    return undefined;
  }
  return {
    limit,
    remaining,
    used,
    resetAt: reset === undefined ? undefined : new Date(reset * 1_000),
    retryAfterMs:
      retryAfter === undefined ? undefined : Math.max(0, retryAfter * 1_000),
  };
}

function errorCode(status: number, rateLimit?: ForgeRateLimit): ForgeErrorCode {
  if (status === 401) return 'AUTHENTICATION_FAILED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 422) return 'INVALID_INPUT';
  if (
    status === 429 ||
    (status === 403 &&
      (rateLimit?.remaining === 0 || rateLimit?.retryAfterMs !== undefined))
  ) {
    return 'RATE_LIMITED';
  }
  return 'PROVIDER_ERROR';
}

export class GitHubTransport implements ForgeTransport {
  private readonly token: GitHubTokenSource;
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof globalThis.fetch;

  /**
   * Creates a GitHub REST transport with fixed or lazy credentials.
   * @param options Token source, provider URL, and fetch override.
   */
  constructor(options: GitHubTransportOptions) {
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? 'https://api.github.com').replace(
      /\/+$/,
      '',
    );
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
  }

  /**
   * Executes one GitHub REST request.
   * @param request Method, provider-relative path, body, headers, and signal.
   * @returns Parsed data and metadata for this exact request.
   * @throws {ForgeError} For transport, authentication, rate, or provider failures.
   */
  async request<T>(request: ForgeTransportRequest): Promise<ForgeResponse<T>> {
    const token =
      typeof this.token === 'function' ? await this.token() : this.token;
    let response: Response;
    try {
      response = await this.fetchImplementation(
        `${this.baseUrl}${request.path}`,
        {
          method: request.method,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...request.headers,
          },
          body:
            request.body === undefined
              ? undefined
              : JSON.stringify(request.body),
          signal: request.signal,
        },
      );
    } catch (cause) {
      throw new ForgeError(
        'GitHub transport request failed',
        'TRANSPORT_ERROR',
        {
          cause,
          provider: 'github',
          retryable: true,
        },
      );
    }

    const requestId = response.headers.get('x-github-request-id') ?? undefined;
    const rateLimit = responseRateLimit(response.headers);
    const metadata = {
      provider: 'github' as const,
      requestId,
      status: response.status,
      rateLimit,
    };
    const text = response.status === 204 ? '' : await response.text();
    let data: unknown;
    try {
      data = text === '' ? undefined : JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      const code = errorCode(response.status, rateLimit);
      const providerMessage =
        typeof data === 'object' &&
        data !== null &&
        'message' in data &&
        typeof data.message === 'string'
          ? data.message
          : response.statusText;
      throw new ForgeError(`GitHub API error: ${providerMessage}`, code, {
        provider: 'github',
        status: response.status,
        requestId,
        rateLimit,
        details: data,
        retryable: code === 'RATE_LIMITED' || response.status >= 500,
      });
    }

    return { data: data as T, metadata };
  }
}
