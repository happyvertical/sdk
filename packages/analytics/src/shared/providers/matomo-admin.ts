/**
 * Matomo admin client.
 *
 * Implements `AnalyticsAdminInterface` against Matomo's Reporting API. Matomo
 * exposes everything we need on a single endpoint (`POST {baseUrl}/index.php`)
 * with the action selected via `module=API` + `method=...`.
 *
 * Auth is `token_auth` — passed in the POST body, never the URL, so it does
 * not appear in proxy/access logs.
 */

import {
  type AnalyticsAccessRole,
  type AnalyticsAccessVerificationResult,
  type AnalyticsAdminInterface,
  AnalyticsError,
  type AnalyticsHealthResult,
  type AnalyticsSite,
  type AnalyticsUser,
  type AnalyticsUserToken,
  AuthenticationError,
  type CreateAnalyticsSiteOptions,
  type CreateAnalyticsUserOptions,
  type MintUserTokenOptions,
  type SetUserAccessOptions,
  type VerifyTokenSiteAccessOptions,
  type VerifyUserSiteAccessOptions,
} from '../types.js';

const PROVIDER = 'matomo';

export interface MatomoAdminTransportOptions {
  baseUrl: string;
  tokenAuth: string;
  timeout?: number;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonRecord = { [key: string]: JsonValue };

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function stripIndexPhpSuffix(value: string): string {
  return value.endsWith('/index.php')
    ? value.slice(0, -'/index.php'.length)
    : value;
}

/**
 * Normalize a Matomo base URL: trim whitespace, strip trailing slashes, and
 * remove a trailing `/index.php` if the caller provided one. Returns the host
 * root so callers can append `/index.php` themselves.
 */
export function normalizeMatomoBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AnalyticsError(
      'Matomo baseUrl is required',
      'MATOMO_BASE_URL_REQUIRED',
      PROVIDER,
    );
  }
  return stripIndexPhpSuffix(stripTrailingSlash(trimmed));
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return undefined;
}

function readBoolean(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return undefined;
}

/**
 * Matomo signals errors with a JSON body of the shape
 * `{ "result": "error", "message": "..." }` and HTTP 200. Detect that.
 */
function readMatomoError(body: unknown): string | undefined {
  if (!isJsonRecord(body)) return undefined;
  if (body.result !== 'error') return undefined;
  return readString(body, 'message') ?? 'Matomo returned an error';
}

/**
 * POST a `module=API&method=...` form to Matomo and return the parsed JSON.
 *
 * Matomo accepts `application/x-www-form-urlencoded` — we use `URLSearchParams`
 * so array values like `idSites[]=1&idSites[]=2` are handled by the runtime.
 */
export class MatomoAdminTransport {
  private readonly baseUrl: string;
  private readonly tokenAuth: string;
  private readonly timeout?: number;

  constructor(options: MatomoAdminTransportOptions) {
    this.baseUrl = normalizeMatomoBaseUrl(options.baseUrl);
    if (!options.tokenAuth) {
      throw new AnalyticsError(
        'Matomo tokenAuth is required',
        'MATOMO_TOKEN_REQUIRED',
        PROVIDER,
      );
    }
    this.tokenAuth = options.tokenAuth;
    this.timeout = options.timeout;
  }

  /**
   * Call a Matomo API method by name (e.g. `SitesManager.addSite`).
   *
   * `params` becomes the request body. Array values are encoded as
   * `key[]=...&key[]=...`. Undefined and null values are dropped. The
   * reserved keys `module`, `method`, `format`, and `token_auth` are
   * controlled by the transport — any caller-supplied value for those
   * keys is silently ignored so they cannot override the dispatch or
   * the response format.
   */
  async call<T = unknown>(
    method: string,
    params: Record<
      string,
      string | number | boolean | undefined | string[] | number[]
    >,
  ): Promise<T> {
    const body = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (RESERVED_PARAM_KEYS.has(key)) continue;
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          body.append(`${key}[]`, String(item));
        }
        continue;
      }
      body.set(key, String(value));
    }

    body.set('module', 'API');
    body.set('method', method);
    body.set('format', 'json');
    body.set('token_auth', this.tokenAuth);

    const controller =
      typeof AbortController === 'undefined'
        ? undefined
        : new AbortController();
    const timeoutHandle =
      controller && this.timeout
        ? setTimeout(() => controller.abort(), this.timeout)
        : undefined;

    try {
      const response = await fetch(`${this.baseUrl}/index.php`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: controller?.signal,
      });

      const text = await response.text();

      if (!response.ok) {
        // Read the body purely to enrich the error message; parse failures
        // here are not fatal because the HTTP error already explains the
        // shape of what came back.
        throw mapHttpError(response.status, tryParseJson(text), text);
      }

      const parsed = text.length > 0 ? parseJsonOrThrow(text) : undefined;

      const errorMessage = readMatomoError(parsed);
      if (errorMessage) {
        throw mapApplicationError(errorMessage);
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof AnalyticsError) throw error;
      throw new AnalyticsError(
        `Matomo admin request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'MATOMO_REQUEST_FAILED',
        PROVIDER,
      );
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}

const RESERVED_PARAM_KEYS = new Set([
  'module',
  'method',
  'format',
  'token_auth',
]);

/**
 * Parse a 2xx response body as JSON. Matomo always answers `format=json`
 * with JSON; if it doesn't, something has gone wrong upstream (usually a
 * misconfigured reverse proxy or PHP fatal error returning HTML), and we
 * surface that as a typed error rather than silently coercing.
 */
function parseJsonOrThrow(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const preview = text.slice(0, 200);
    throw new AnalyticsError(
      `Matomo returned an invalid JSON response${
        error instanceof Error ? `: ${error.message}` : ''
      }${preview ? ` (response preview: ${preview})` : ''}`,
      'MATOMO_INVALID_RESPONSE',
      PROVIDER,
    );
  }
}

/**
 * Best-effort parse for non-2xx response bodies — returns `undefined` on
 * parse failure so the HTTP-error code path can still surface a useful
 * status-based message.
 */
function tryParseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function mapHttpError(
  status: number,
  body: unknown,
  text: string,
): AnalyticsError {
  if (status === 401 || status === 403) {
    return new AuthenticationError(PROVIDER);
  }
  const message =
    (isJsonRecord(body) && readString(body, 'message')) ||
    text ||
    `Matomo HTTP ${status}`;
  return new AnalyticsError(message, `MATOMO_HTTP_${status}`, PROVIDER);
}

function mapApplicationError(message: string): AnalyticsError {
  // Matomo sentinel: anonymous (or insufficient-scope) tokens hit this branch
  // with HTTP 200 and a `result=error` payload.
  if (
    message.includes('requires view access') ||
    message.includes('requires admin access') ||
    message.includes('requires Super User access') ||
    message.includes("doesn't have access")
  ) {
    return new AuthenticationError(PROVIDER, message, 'MATOMO_ACCESS_DENIED');
  }
  return new AnalyticsError(message, 'MATOMO_API_ERROR', PROVIDER);
}

function siteFromRow(row: JsonRecord): AnalyticsSite {
  const id = readString(row, 'idsite') ?? readString(row, 'idSite');
  if (!id) {
    throw new AnalyticsError(
      'Matomo did not return a site id',
      'MATOMO_INVALID_RESPONSE',
      PROVIDER,
    );
  }
  return {
    id,
    name: readString(row, 'name') ?? '',
    url: readString(row, 'main_url'),
    timezone: readString(row, 'timezone'),
    currency: readString(row, 'currency'),
    provider: PROVIDER,
    raw: row,
  };
}

function userFromRow(row: JsonRecord): AnalyticsUser {
  const login = readString(row, 'login');
  if (!login) {
    throw new AnalyticsError(
      'Matomo did not return a user login',
      'MATOMO_INVALID_RESPONSE',
      PROVIDER,
    );
  }
  return {
    login,
    email: readString(row, 'email'),
    isSuperUser: readBoolean(row, 'superuser_access'),
    provider: PROVIDER,
    raw: row,
  };
}

export class MatomoAdmin implements AnalyticsAdminInterface {
  private readonly baseUrl: string;
  private readonly timeout?: number;
  private readonly transport: MatomoAdminTransport;

  constructor(options: MatomoAdminTransportOptions) {
    this.baseUrl = normalizeMatomoBaseUrl(options.baseUrl);
    this.timeout = options.timeout;
    this.transport = new MatomoAdminTransport({
      ...options,
      baseUrl: this.baseUrl,
    });

    // `AnalyticsAdminInterface` marks capability methods optional and tells
    // callers to feature-check them (`typeof admin.mintUserToken ===
    // 'function'`). The idiomatic TypeScript narrowing for that is to pull
    // the method into a local before calling it, which detaches `this`.
    // Bind every interface method so detached calls still hit this instance
    // instead of crashing with `this === undefined` (surfaced in production
    // as "Cannot read properties of undefined (reading
    // 'cloneTransportWithToken')" during minted-token verification —
    // https://github.com/happyvertical/sdk/issues/1043).
    this.createSite = this.createSite.bind(this);
    this.listSites = this.listSites.bind(this);
    this.getSite = this.getSite.bind(this);
    this.deleteSite = this.deleteSite.bind(this);
    this.createUser = this.createUser.bind(this);
    this.getUser = this.getUser.bind(this);
    this.deleteUser = this.deleteUser.bind(this);
    this.setUserAccess = this.setUserAccess.bind(this);
    this.verifyUserSiteAccess = this.verifyUserSiteAccess.bind(this);
    this.verifyTokenSiteAccess = this.verifyTokenSiteAccess.bind(this);
    this.mintUserToken = this.mintUserToken.bind(this);
    this.health = this.health.bind(this);
  }

  private cloneTransportWithToken(tokenAuth: string): MatomoAdminTransport {
    return new MatomoAdminTransport({
      baseUrl: this.baseUrl,
      tokenAuth,
      timeout: this.timeout,
    });
  }

  // ---------------------------------------------------------------------------
  // Sites
  // ---------------------------------------------------------------------------

  async createSite(
    options: CreateAnalyticsSiteOptions,
  ): Promise<AnalyticsSite> {
    if (!options.urls || options.urls.length === 0) {
      throw new AnalyticsError(
        'Matomo createSite requires at least one URL',
        'MATOMO_URLS_REQUIRED',
        PROVIDER,
      );
    }

    const response = await this.transport.call<unknown>(
      'SitesManager.addSite',
      {
        siteName: options.name,
        urls: options.urls,
        timezone: options.timezone,
        currency: options.currency,
        ...(options.raw ?? {}),
      },
    );

    // Matomo returns the new idSite as a bare integer or `{ value: N }`.
    const id = coerceSiteIdResponse(response);
    if (!id) {
      throw new AnalyticsError(
        'Matomo did not return a site id',
        'MATOMO_INVALID_RESPONSE',
        PROVIDER,
      );
    }

    const site = await this.getSite(id);
    if (site) return { ...site, tenantId: options.tenantId };

    return {
      id,
      name: options.name,
      url: options.urls[0],
      timezone: options.timezone,
      currency: options.currency,
      tenantId: options.tenantId,
      provider: PROVIDER,
      raw: response,
    };
  }

  async listSites(): Promise<AnalyticsSite[]> {
    const response = await this.transport.call<unknown>(
      'SitesManager.getAllSites',
      {},
    );
    if (!Array.isArray(response)) return [];
    return response.filter(isJsonRecord).map((row) => siteFromRow(row));
  }

  async getSite(siteId: string): Promise<AnalyticsSite | undefined> {
    try {
      const response = await this.transport.call<unknown>(
        'SitesManager.getSiteFromId',
        { idSite: siteId },
      );
      if (isJsonRecord(response)) {
        return siteFromRow(response);
      }
      // Some Matomo versions return `[]` for a non-existent site.
      return undefined;
    } catch (error) {
      if (error instanceof AnalyticsError && isNotFoundSiteError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async deleteSite(siteId: string): Promise<void> {
    await this.transport.call<unknown>('SitesManager.deleteSite', {
      idSite: siteId,
    });
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  async createUser(
    options: CreateAnalyticsUserOptions,
  ): Promise<AnalyticsUser> {
    if (!options.password) {
      throw new AnalyticsError(
        'Matomo createUser requires a password',
        'MATOMO_PASSWORD_REQUIRED',
        PROVIDER,
      );
    }

    await this.transport.call<unknown>('UsersManager.addUser', {
      userLogin: options.login,
      password: options.password,
      email: options.email,
      ...(options.raw ?? {}),
    });

    const user = await this.getUser(options.login);
    return (
      user ?? {
        login: options.login,
        email: options.email,
        tenantId: options.tenantId,
        provider: PROVIDER,
      }
    );
  }

  async getUser(login: string): Promise<AnalyticsUser | undefined> {
    try {
      const response = await this.transport.call<unknown>(
        'UsersManager.getUser',
        { userLogin: login },
      );

      if (isJsonRecord(response)) return userFromRow(response);

      // Some Matomo versions return `[]` for a non-existent user.
      if (Array.isArray(response) && response.length === 0) return undefined;

      return undefined;
    } catch (error) {
      // Matomo 5.x raises an application error rather than returning an
      // empty array when the login is unknown.
      if (
        error instanceof AnalyticsError &&
        error.code === 'MATOMO_API_ERROR' &&
        /doesn'?t exist|does not exist|unknown/i.test(error.message)
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async deleteUser(login: string): Promise<void> {
    await this.transport.call<unknown>('UsersManager.deleteUser', {
      userLogin: login,
    });
  }

  async setUserAccess(options: SetUserAccessOptions): Promise<void> {
    if (!isAccessRole(options.access)) {
      throw new AnalyticsError(
        `Invalid Matomo access role: ${options.access}`,
        'MATOMO_INVALID_ROLE',
        PROVIDER,
      );
    }
    if (!options.siteIds || options.siteIds.length === 0) {
      throw new AnalyticsError(
        'Matomo setUserAccess requires at least one site id',
        'MATOMO_SITE_IDS_REQUIRED',
        PROVIDER,
      );
    }
    await this.transport.call<unknown>('UsersManager.setUserAccess', {
      userLogin: options.login,
      access: options.access,
      idSites: options.siteIds,
    });
  }

  async verifyUserSiteAccess(
    options: VerifyUserSiteAccessOptions,
  ): Promise<AnalyticsAccessVerificationResult> {
    const requiredAccess = options.minimumAccess ?? 'view';
    if (!isAccessRole(requiredAccess)) {
      throw new AnalyticsError(
        `Invalid Matomo access role: ${requiredAccess}`,
        'MATOMO_INVALID_ROLE',
        PROVIDER,
      );
    }

    try {
      const response = await this.transport.call<unknown>(
        'UsersManager.getSitesAccessFromUser',
        { userLogin: options.login },
      );
      const entries = normalizeSiteAccessEntries(response);
      const match = entries.find((entry) => entry.siteId === options.siteId);
      let access = match?.access ?? 'noaccess';
      if (access === 'noaccess') {
        const user = await this.getUser(options.login);
        if (user?.isSuperUser) {
          access = 'admin';
        }
      }
      const ok = hasMinimumAccess(access, requiredAccess);

      return {
        ok,
        provider: PROVIDER,
        login: options.login,
        siteId: options.siteId,
        access,
        requiredAccess,
        errorCode: ok ? undefined : 'MATOMO_ACCESS_DENIED',
        error: ok
          ? undefined
          : `User "${options.login}" has ${access} access to site ${options.siteId}; ${requiredAccess} is required.`,
        raw: response,
      };
    } catch (error) {
      return {
        ok: false,
        provider: PROVIDER,
        login: options.login,
        siteId: options.siteId,
        access: 'noaccess',
        requiredAccess,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof AnalyticsError ? error.code : undefined,
      };
    }
  }

  async verifyTokenSiteAccess(
    options: VerifyTokenSiteAccessOptions,
  ): Promise<AnalyticsAccessVerificationResult> {
    try {
      const transport = this.cloneTransportWithToken(options.tokenAuth);
      const response = await transport.call<unknown>(
        'SitesManager.getSiteFromId',
        { idSite: options.siteId },
      );
      if (Array.isArray(response) && response.length === 0) {
        return {
          ok: false,
          provider: PROVIDER,
          siteId: options.siteId,
          access: 'noaccess',
          requiredAccess: 'view',
          errorCode: 'MATOMO_SITE_NOT_FOUND',
          error: `Site ${options.siteId} was not found.`,
          raw: response,
        };
      }
      const siteVisible = isJsonRecord(response);
      if (siteVisible) {
        // Validate the response shape; siteFromRow throws on malformed rows.
        siteFromRow(response);
      }
      return {
        ok: siteVisible,
        provider: PROVIDER,
        siteId: options.siteId,
        access: siteVisible ? 'view' : 'noaccess',
        requiredAccess: 'view',
        errorCode: siteVisible ? undefined : 'MATOMO_ACCESS_DENIED',
        error: siteVisible
          ? undefined
          : `Token cannot read site ${options.siteId}.`,
        raw: response,
      };
    } catch (error) {
      const errorCode =
        error instanceof AnalyticsError ? error.code : undefined;
      return {
        ok: false,
        provider: PROVIDER,
        siteId: options.siteId,
        access: 'noaccess',
        requiredAccess: 'view',
        error:
          errorCode === 'MATOMO_ACCESS_DENIED'
            ? `Token cannot read site ${options.siteId} (no view grant).`
            : error instanceof Error
              ? error.message
              : String(error),
        errorCode,
      };
    }
  }

  async mintUserToken(
    options: MintUserTokenOptions,
  ): Promise<AnalyticsUserToken> {
    if (!options.passwordConfirmation) {
      throw new AnalyticsError(
        "Matomo's createAppSpecificTokenAuth requires the target user's " +
          'password as `passwordConfirmation`. (It confirms the user being ' +
          'minted for — not the caller — so a stolen super-user token alone ' +
          "can't mint tokens for arbitrary users.)",
        'MATOMO_PASSWORD_CONFIRMATION_REQUIRED',
        PROVIDER,
      );
    }
    const effectiveDescription =
      options.description ?? `analytics-token ${options.login}`;
    const response = await this.transport.call<unknown>(
      'UsersManager.createAppSpecificTokenAuth',
      {
        userLogin: options.login,
        passwordConfirmation: options.passwordConfirmation,
        description: effectiveDescription,
        expireHours: 0,
      },
    );

    const token =
      (isJsonRecord(response) && readString(response, 'value')) ||
      (typeof response === 'string' ? response : undefined);

    if (!token) {
      throw new AnalyticsError(
        'Matomo did not return a token value',
        'MATOMO_INVALID_RESPONSE',
        PROVIDER,
      );
    }

    return {
      token,
      login: options.login,
      description: effectiveDescription,
      provider: PROVIDER,
      raw: response,
    };
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  async health(): Promise<AnalyticsHealthResult> {
    try {
      const response = await this.transport.call<unknown>(
        'API.getMatomoVersion',
        {},
      );
      const version =
        (isJsonRecord(response) && readString(response, 'value')) ||
        (typeof response === 'string' ? response : undefined);
      return { ok: true, version };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function coerceSiteIdResponse(response: unknown): string | undefined {
  if (typeof response === 'number' && Number.isFinite(response)) {
    return String(response);
  }
  if (typeof response === 'string' && response.length > 0) {
    return response;
  }
  if (isJsonRecord(response)) {
    return (
      readString(response, 'value') ??
      readString(response, 'idsite') ??
      readString(response, 'idSite')
    );
  }
  return undefined;
}

function isAccessRole(value: string): value is AnalyticsAccessRole {
  return (
    value === 'noaccess' ||
    value === 'view' ||
    value === 'write' ||
    value === 'admin'
  );
}

interface SiteAccessEntry {
  siteId: string;
  access: AnalyticsAccessRole;
}

function normalizeSiteAccessEntries(response: unknown): SiteAccessEntry[] {
  if (Array.isArray(response)) {
    return response
      .filter(isJsonRecord)
      .map((row) => {
        const siteId =
          readString(row, 'site') ??
          readString(row, 'idsite') ??
          readString(row, 'idSite');
        const access = readString(row, 'access');
        return siteId && access && isAccessRole(access)
          ? { siteId, access }
          : undefined;
      })
      .filter((entry): entry is SiteAccessEntry => !!entry);
  }

  if (isJsonRecord(response)) {
    const entries: SiteAccessEntry[] = [];
    for (const [siteId, access] of Object.entries(response)) {
      if (typeof access === 'string' && isAccessRole(access)) {
        entries.push({ siteId, access });
      }
    }
    return entries;
  }

  return [];
}

const ACCESS_RANK: Record<AnalyticsAccessRole, number> = {
  noaccess: 0,
  view: 1,
  write: 2,
  admin: 3,
};

function hasMinimumAccess(
  access: AnalyticsAccessRole,
  minimumAccess: AnalyticsAccessRole,
): boolean {
  return ACCESS_RANK[access] >= ACCESS_RANK[minimumAccess];
}

/**
 * Recognise the various ways Matomo signals "this site id doesn't exist (or
 * isn't visible to the caller)". Matomo has at least three error sentinels for
 * this case across versions and contexts:
 *   - "Site not found"
 *   - "doesn't exist" / "does not exist"
 *   - "An unexpected website was found in the request: website id was set to '...'"
 */
function isNotFoundSiteError(error: AnalyticsError): boolean {
  if (error.code !== 'MATOMO_API_ERROR') return false;
  return (
    /not.*found|doesn'?t exist|does not exist|unknown/i.test(error.message) ||
    /website was found in the request|website id was set/i.test(error.message)
  );
}
