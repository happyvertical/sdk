/**
 * JMAP adapter (RFC 8620 core, RFC 8621 mail).
 *
 * Works against any JMAP server (Stalwart, Fastmail, ...). Authentication is
 * supplied by the caller: Basic with an app password, or a bearer token.
 *
 * Implements the protocol-neutral change feed (`getChanges`) on top of
 * `Email/changes` and `Mailbox/changes`: the cursor wraps the JMAP `state`
 * strings, and `cannotCalculateChanges` becomes a typed `resync-required`
 * result. `subscribeChanges` is an optional EventSource push hint.
 *
 * Write-back beyond the existing EmailClient surface (drafts, submission,
 * archive/junk by role) is intentionally not part of this adapter yet.
 */

import { BaseEmailClient } from '../shared/base';
import {
  AuthenticationError,
  AuthorizationError,
  ConnectionError,
  EmailError,
  FolderNotFoundError,
  MessageNotFoundError,
  TimeoutError,
} from '../shared/errors';
import type {
  AdapterType,
  Attachment,
  ChangeFeedOptions,
  ChangeFeedResult,
  ChangeHintListener,
  EmailAddress,
  EmailClientCapabilities,
  EmailMessage,
  FetchOptions,
  Folder,
  FolderInfo,
  FolderSpecialUse,
  JMAPOptions,
  SearchCriteria,
  SendOptions,
  SendResult,
  SubscribeChangesOptions,
  Unsubscribe,
} from '../shared/types';

const CAP_CORE = 'urn:ietf:params:jmap:core';
const CAP_MAIL = 'urn:ietf:params:jmap:mail';
const USING = [CAP_CORE, CAP_MAIL];

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_FEED_LIMIT = 100;
const CURSOR_VERSION = 1;
const MAX_REDIRECTS = 5;
const MAX_MAILBOX_CHANGE_PAGES = 50;

/** Mailbox properties whose change alone does not alter folder structure. */
const MAILBOX_COUNT_PROPERTIES = new Set([
  'totalEmails',
  'unreadEmails',
  'totalThreads',
  'unreadThreads',
]);

const METADATA_PROPERTIES = [
  'id',
  'threadId',
  'mailboxIds',
  'keywords',
  'messageId',
  'inReplyTo',
  'references',
  'from',
  'to',
  'cc',
  'bcc',
  'replyTo',
  'subject',
  'receivedAt',
  'sentAt',
  'size',
  'hasAttachment',
];
const BODY_PROPERTIES = [
  'textBody',
  'htmlBody',
  'attachments',
  'bodyValues',
] as const;
const BODY_PART_PROPERTIES = [
  'partId',
  'blobId',
  'size',
  'name',
  'type',
  'charset',
  'disposition',
  'cid',
];

const ROLE_TO_SPECIAL_USE: Record<string, FolderSpecialUse> = {
  inbox: '\\Inbox',
  sent: '\\Sent',
  drafts: '\\Drafts',
  trash: '\\Trash',
  junk: '\\Junk',
  archive: '\\Archive',
  all: '\\All',
};

const KEYWORD_TO_FLAG: Record<string, string> = {
  $seen: '\\Seen',
  $flagged: '\\Flagged',
  $answered: '\\Answered',
  $draft: '\\Draft',
};

// ============================================================================
// JMAP wire types (only what this adapter reads)
// ============================================================================

interface JMAPSession {
  capabilities: Record<string, unknown>;
  accounts: Record<string, { name?: string; accountCapabilities?: unknown }>;
  primaryAccounts: Record<string, string>;
  apiUrl: string;
  eventSourceUrl?: string;
  state: string;
}

interface JMAPAddress {
  name?: string | null;
  email: string;
}

interface JMAPBodyPart {
  partId?: string | null;
  blobId?: string | null;
  size?: number;
  name?: string | null;
  type?: string;
  disposition?: string | null;
  cid?: string | null;
}

interface JMAPEmail {
  id: string;
  threadId?: string;
  mailboxIds?: Record<string, boolean>;
  keywords?: Record<string, boolean>;
  messageId?: string[] | null;
  inReplyTo?: string[] | null;
  references?: string[] | null;
  from?: JMAPAddress[] | null;
  to?: JMAPAddress[] | null;
  cc?: JMAPAddress[] | null;
  bcc?: JMAPAddress[] | null;
  replyTo?: JMAPAddress[] | null;
  subject?: string | null;
  receivedAt?: string;
  sentAt?: string | null;
  size?: number;
  textBody?: JMAPBodyPart[];
  htmlBody?: JMAPBodyPart[];
  attachments?: JMAPBodyPart[];
  bodyValues?: Record<string, { value: string }>;
}

interface JMAPMailbox {
  id: string;
  name: string;
  parentId?: string | null;
  role?: string | null;
  isSubscribed?: boolean;
  totalEmails?: number;
  unreadEmails?: number;
}

type MethodCall = [name: string, args: Record<string, unknown>, callId: string];
type MethodResponse = [
  name: string,
  args: Record<string, unknown>,
  callId: string,
];

interface Cursor {
  v: number;
  /** account id */
  a: string;
  /** Email state */
  e: string;
  /** Mailbox state */
  m: string;
  /** Last email id of the previous initial-pass page; present while the initial pass is running. */
  c?: string;
}

// ============================================================================
// Adapter
// ============================================================================

export class JMAPAdapter extends BaseEmailClient {
  private options: JMAPOptions;
  private fetchImpl: typeof fetch;
  private session: JMAPSession | null = null;
  private sessionStale = false;
  private accountId = '';
  private mailboxes: JMAPMailbox[] | null = null;
  private subscriptions = new Set<AbortController>();

  constructor(options: JMAPOptions) {
    super({ type: 'jmap', debug: options.debug });
    if (!options.url && !options.sessionUrl) {
      throw new EmailError(
        'JMAP url (or sessionUrl) is required',
        'INVALID_CONFIG',
        'jmap',
      );
    }
    if (!options.auth) {
      throw new EmailError(
        'JMAP auth is required (app password or bearer token)',
        'INVALID_CONFIG',
        'jmap',
      );
    }
    this.options = options;
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
  }

  getAdapter(): AdapterType {
    return 'jmap';
  }

  async getCapabilities(): Promise<EmailClientCapabilities> {
    return {
      send: false, // submission is part of the write-back work, not this adapter yet
      receive: true,
      folders: true,
      search: true,
      markRead: true,
      move: true,
      delete: true,
      threads: true,
      oauth: false,
      changeFeed: true,
      push: true,
    };
  }

  // ========================================================================
  // Connection / session
  // ========================================================================

  async connect(): Promise<void> {
    await this.loadSession();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    for (const controller of this.subscriptions) controller.abort();
    this.subscriptions.clear();
    this.session = null;
    this.mailboxes = null;
    this.connected = false;
  }

  private authHeader(): string {
    const auth = this.options.auth;
    if ('token' in auth) return `Bearer ${auth.token}`;
    return `Basic ${Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')}`;
  }

  private sessionUrl(): string {
    if (this.options.sessionUrl) return this.options.sessionUrl;
    return new URL('/.well-known/jmap', this.options.url).toString();
  }

  /** Origin credentials may be sent to: the configured server plus any explicit allowlist. */
  private allowedOrigins(): Set<string> {
    const origins = new Set<string>();
    origins.add(new URL(this.sessionUrl()).origin);
    if (this.options.url) origins.add(new URL(this.options.url).origin);
    for (const extra of this.options.allowedOrigins ?? []) {
      origins.add(new URL(extra).origin);
    }
    return origins;
  }

  /** https only; plain http is for loopback development and tests. */
  private assertSecure(url: URL): void {
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
      throw new EmailError(
        `JMAP requires https (got ${url.protocol}//${url.host})`,
        'INSECURE_URL',
        'jmap',
      );
    }
  }

  /** Reject a server-supplied URL that points outside the allowed origins. */
  private assertTrustedUrl(url: URL, what: string): void {
    this.assertSecure(url);
    if (!this.allowedOrigins().has(url.origin)) {
      throw new EmailError(
        `JMAP ${what} origin ${url.origin} is not the configured server; refusing to send credentials (see allowedOrigins)`,
        'UNTRUSTED_ORIGIN',
        'jmap',
      );
    }
  }

  private async request(
    url: string,
    init: RequestInit & { headers?: Record<string, string> },
  ): Promise<Response> {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const trusted = this.allowedOrigins();
    let response: Response;
    try {
      let target = new URL(url);
      let method = init.method;
      let body = init.body;
      let withAuth = true;
      for (let hop = 0; ; hop++) {
        this.assertSecure(target);
        // Credentials never leave the trusted origins.
        withAuth = withAuth && trusted.has(target.origin);
        response = await this.fetchImpl(target.toString(), {
          ...init,
          method,
          body,
          redirect: 'manual',
          headers: {
            ...(withAuth ? { Authorization: this.authHeader() } : {}),
            ...init.headers,
          },
          signal: init.signal ?? AbortSignal.timeout(timeoutMs),
        });
        const location = response.headers.get('location');
        if (response.status < 300 || response.status >= 400 || !location) break;
        if (hop >= MAX_REDIRECTS) {
          throw new ConnectionError('JMAP: too many redirects', 'jmap');
        }
        target = new URL(location, target);
        if (response.status === 303) {
          method = 'GET';
          body = undefined;
        }
      }
    } catch (error) {
      if (error instanceof EmailError) throw error;
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new TimeoutError(
          `JMAP request timed out after ${timeoutMs}ms`,
          'jmap',
          error,
        );
      }
      throw new ConnectionError(
        `JMAP request failed: ${error instanceof Error ? error.message : String(error)}`,
        'jmap',
        error,
      );
    }
    if (response.status === 401) {
      throw new AuthenticationError(
        'JMAP server rejected the credentials',
        'jmap',
      );
    }
    if (response.status === 403) {
      throw new AuthorizationError('JMAP request forbidden', 'jmap');
    }
    if (!response.ok) {
      throw new ConnectionError(
        `JMAP server responded ${response.status}`,
        'jmap',
      );
    }
    return response;
  }

  private async loadSession(): Promise<JMAPSession> {
    const base = this.sessionUrl();
    const response = await this.request(base, {
      headers: { Accept: 'application/json' },
    });
    let session: JMAPSession;
    try {
      session = (await response.json()) as JMAPSession;
    } catch (error) {
      throw new ConnectionError(
        'JMAP session resource is not valid JSON',
        'jmap',
        error,
      );
    }
    const caps = session.capabilities ?? {};
    if (!(CAP_CORE in caps) || !(CAP_MAIL in caps)) {
      throw new EmailError(
        `JMAP server does not advertise ${CAP_MAIL}`,
        'UNSUPPORTED',
        'jmap',
      );
    }
    // apiUrl / eventSourceUrl may be relative to the session resource.
    const origin = response.url || base;
    const apiUrl = new URL(session.apiUrl, origin);
    this.assertTrustedUrl(apiUrl, 'apiUrl');
    session.apiUrl = apiUrl.toString();
    if (session.eventSourceUrl) {
      const eventUrl = new URL(session.eventSourceUrl, origin);
      this.assertTrustedUrl(eventUrl, 'eventSourceUrl');
      session.eventSourceUrl = decodeURI(eventUrl.toString());
    }
    const accountId =
      this.options.accountId ?? session.primaryAccounts?.[CAP_MAIL];
    if (!accountId || !session.accounts?.[accountId]) {
      throw new EmailError(
        'JMAP session has no usable mail account',
        'UNSUPPORTED',
        'jmap',
      );
    }
    this.accountId = accountId;
    this.session = session;
    this.sessionStale = false;
    return session;
  }

  private async ensureSession(): Promise<JMAPSession> {
    if (!this.session || this.sessionStale) {
      await this.loadSession();
      this.connected = true;
    }
    return this.session as JMAPSession;
  }

  /** POST a batch of method calls; returns responses in order. */
  private async call(methodCalls: MethodCall[]): Promise<MethodResponse[]> {
    const session = await this.ensureSession();
    const response = await this.request(session.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ using: USING, methodCalls }),
    });
    const body = (await response.json()) as {
      methodResponses?: MethodResponse[];
      sessionState?: string;
      type?: string;
      detail?: string;
    };
    if (!body.methodResponses) {
      throw new EmailError(
        `JMAP request error: ${body.type ?? 'unknown'}${body.detail ? ` (${body.detail})` : ''}`,
        'JMAP_REQUEST_ERROR',
        'jmap',
      );
    }
    if (body.sessionState && body.sessionState !== session.state) {
      this.sessionStale = true;
    }
    return body.methodResponses;
  }

  /** Response for callId, or a thrown error for a JMAP method-level error. */
  private result(
    responses: MethodResponse[],
    callId: string,
  ): Record<string, unknown> {
    const found = responses.find((r) => r[2] === callId);
    if (!found) {
      throw new EmailError(
        `JMAP response missing for ${callId}`,
        'JMAP_PROTOCOL_ERROR',
        'jmap',
      );
    }
    if (found[0] === 'error') {
      throw this.methodError(found[1]);
    }
    return found[1];
  }

  private methodError(args: Record<string, unknown>): EmailError {
    const type = String(args.type ?? 'serverFail');
    const description = args.description ? `: ${String(args.description)}` : '';
    if (type === 'forbidden' || type === 'accountReadOnly') {
      return new AuthorizationError(`JMAP ${type}${description}`, 'jmap');
    }
    return new EmailError(
      `JMAP ${type}${description}`,
      `JMAP_${type.toUpperCase()}`,
      'jmap',
    );
  }

  private errorType(
    responses: MethodResponse[],
    callId: string,
  ): string | undefined {
    const found = responses.find((r) => r[2] === callId);
    return found && found[0] === 'error' ? String(found[1].type) : undefined;
  }

  // ========================================================================
  // Mailboxes / folders
  // ========================================================================

  private async loadMailboxes(): Promise<{
    state: string;
    list: JMAPMailbox[];
  }> {
    const responses = await this.call([
      ['Mailbox/get', { accountId: this.accountId, ids: null }, 'mb'],
    ]);
    const res = this.result(responses, 'mb') as {
      state: string;
      list: JMAPMailbox[];
    };
    this.mailboxes = res.list;
    return res;
  }

  private async mailboxList(): Promise<JMAPMailbox[]> {
    await this.ensureSession();
    if (!this.mailboxes) await this.loadMailboxes();
    return this.mailboxes as JMAPMailbox[];
  }

  private mailboxPath(mailbox: JMAPMailbox, list: JMAPMailbox[]): string {
    const byId = new Map(list.map((m) => [m.id, m]));
    const parts: string[] = [];
    const seen = new Set<string>();
    let current: JMAPMailbox | undefined = mailbox;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      parts.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return parts.join('/');
  }

  private toFolder(mailbox: JMAPMailbox, list: JMAPMailbox[]): Folder {
    return {
      id: mailbox.id,
      name: mailbox.name,
      path: this.mailboxPath(mailbox, list),
      delimiter: '/',
      specialUse: mailbox.role ? ROLE_TO_SPECIAL_USE[mailbox.role] : undefined,
      subscribed: mailbox.isSubscribed,
      messageCount: mailbox.totalEmails,
      unreadCount: mailbox.unreadEmails,
    };
  }

  async listFolders(): Promise<Folder[]> {
    await this.ensureSession();
    const { list } = await this.loadMailboxes();
    return list.map((m) => this.toFolder(m, list));
  }

  /** Resolve an id, path, name, 'INBOX' or '\\Role' special-use to a mailbox. */
  private async resolveMailbox(name: string): Promise<JMAPMailbox> {
    const list = await this.mailboxList();
    const lower = name.toLowerCase();
    const byRole = (role: string) => list.find((m) => m.role === role);
    const found =
      list.find((m) => m.id === name) ??
      list.find((m) => this.mailboxPath(m, list).toLowerCase() === lower) ??
      (lower === 'inbox' ? byRole('inbox') : undefined) ??
      (name.startsWith('\\') ? byRole(lower.slice(1)) : undefined) ??
      (list.filter((m) => m.name.toLowerCase() === lower).length === 1
        ? list.find((m) => m.name.toLowerCase() === lower)
        : undefined);
    if (!found) throw new FolderNotFoundError(name, 'jmap');
    return found;
  }

  async selectFolder(name: string): Promise<FolderInfo> {
    await this.ensureSession();
    const { list } = await this.loadMailboxes();
    const mailbox = await this.resolveMailbox(name);
    const fresh = list.find((m) => m.id === mailbox.id) ?? mailbox;
    return {
      name: this.mailboxPath(fresh, list),
      exists: fresh.totalEmails ?? 0,
      recent: 0,
      unseen: fresh.unreadEmails ?? 0,
      uidValidity: 0, // not applicable to JMAP
      uidNext: 0,
      flags: [],
      permanentFlags: [],
    };
  }

  async createFolder(name: string): Promise<void> {
    await this.ensureSession();
    const { list } = await this.loadMailboxes();
    let parentId: string | null = null;
    let path = '';
    for (const part of name.split('/').filter(Boolean)) {
      path = path ? `${path}/${part}` : part;
      const existing = list.find(
        (m) =>
          (m.parentId ?? null) === parentId &&
          m.name.toLowerCase() === part.toLowerCase(),
      );
      if (existing) {
        parentId = existing.id;
        continue;
      }
      const responses = await this.call([
        [
          'Mailbox/set',
          {
            accountId: this.accountId,
            create: { n: { name: part, parentId } },
          },
          's',
        ],
      ]);
      const res = this.result(responses, 's') as {
        created?: Record<string, { id: string }>;
        notCreated?: Record<string, { type: string; description?: string }>;
      };
      if (res.notCreated?.n) {
        throw this.methodError(res.notCreated.n);
      }
      const id = res.created?.n?.id as string;
      list.push({ id, name: part, parentId });
      parentId = id;
    }
    this.mailboxes = null;
  }

  async deleteFolder(name: string): Promise<void> {
    const mailbox = await this.resolveMailbox(name);
    const responses = await this.call([
      [
        'Mailbox/set',
        { accountId: this.accountId, destroy: [mailbox.id] },
        's',
      ],
    ]);
    const res = this.result(responses, 's') as {
      notDestroyed?: Record<string, { type: string; description?: string }>;
    };
    if (res.notDestroyed?.[mailbox.id]) {
      throw this.methodError(res.notDestroyed[mailbox.id]);
    }
    this.mailboxes = null;
  }

  // ========================================================================
  // Messages
  // ========================================================================

  private emailGetArgs(
    ids: string[] | { resultOf: string; name: string; path: string },
    includeBodies: boolean,
  ): Record<string, unknown> {
    const args: Record<string, unknown> = {
      accountId: this.accountId,
      properties: includeBodies
        ? [...METADATA_PROPERTIES, ...BODY_PROPERTIES]
        : METADATA_PROPERTIES,
    };
    if (Array.isArray(ids)) args.ids = ids;
    else args['#ids'] = ids;
    if (includeBodies) {
      args.bodyProperties = BODY_PART_PROPERTIES;
      args.fetchTextBodyValues = true;
      args.fetchHTMLBodyValues = true;
    }
    return args;
  }

  private addresses(list?: JMAPAddress[] | null): EmailAddress[] {
    return (list ?? []).map((a) => ({
      name: a.name || undefined,
      address: a.email,
    }));
  }

  private mapEmail(email: JMAPEmail, mailboxes: JMAPMailbox[]): EmailMessage {
    const byId = new Map(mailboxes.map((m) => [m.id, m]));
    const folderIds = Object.keys(email.mailboxIds ?? {}).filter(
      (id) => email.mailboxIds?.[id],
    );
    const folders = folderIds.map((id) => {
      const mailbox = byId.get(id);
      return mailbox ? this.mailboxPath(mailbox, mailboxes) : id;
    });
    const flags = Object.entries(email.keywords ?? {})
      .filter(([, on]) => on)
      .map(([keyword]) => KEYWORD_TO_FLAG[keyword.toLowerCase()] ?? keyword);

    const bodyText = (parts: JMAPBodyPart[] | undefined, type: string) => {
      const matching = (parts ?? []).filter((p) => p.type === type);
      if (matching.length === 0) return undefined;
      return matching
        .map((p) => (p.partId ? email.bodyValues?.[p.partId]?.value : ''))
        .filter((v): v is string => typeof v === 'string')
        .join('\n');
    };
    const attachments: Attachment[] | undefined = email.attachments?.map(
      (a) => ({
        id: a.blobId ?? undefined,
        filename: a.name ?? undefined,
        contentType: a.type ?? 'application/octet-stream',
        size: a.size ?? 0,
        contentId: a.cid ?? undefined,
        contentDisposition:
          a.disposition === 'inline' || a.disposition === 'attachment'
            ? a.disposition
            : undefined,
      }),
    );

    const dateValue = email.sentAt ?? email.receivedAt;
    return {
      id: email.id,
      messageId: email.messageId?.[0],
      threadId: email.threadId,
      inReplyTo: email.inReplyTo?.[0],
      references: email.references ?? undefined,
      from: this.addresses(email.from)[0] ?? { address: '' },
      to: this.addresses(email.to),
      cc: email.cc ? this.addresses(email.cc) : undefined,
      bcc: email.bcc ? this.addresses(email.bcc) : undefined,
      replyTo: this.addresses(email.replyTo)[0],
      subject: email.subject ?? '',
      date: dateValue ? new Date(dateValue) : undefined,
      text: bodyText(email.textBody, 'text/plain'),
      html: bodyText(email.htmlBody, 'text/html'),
      attachments,
      folder: folders[0],
      folders,
      flags,
      size: email.size,
    };
  }

  private async getEmails(
    ids: string[],
    includeBodies: boolean,
  ): Promise<{ emails: JMAPEmail[]; notFound: string[] }> {
    if (ids.length === 0) return { emails: [], notFound: [] };
    await this.ensureSession();
    const responses = await this.call([
      ['Email/get', this.emailGetArgs(ids, includeBodies), 'g'],
    ]);
    const res = this.result(responses, 'g') as {
      list: JMAPEmail[];
      notFound?: string[];
    };
    return { emails: res.list, notFound: res.notFound ?? [] };
  }

  async getMessage(messageId: string): Promise<EmailMessage> {
    const { emails } = await this.getEmails([messageId], true);
    if (emails.length === 0) throw new MessageNotFoundError(messageId, 'jmap');
    return this.mapEmail(emails[0], await this.mailboxList());
  }

  /** Native JMAP thread (Thread/get): messages oldest first, with bodies. */
  async getThread(threadId: string): Promise<EmailMessage[]> {
    await this.ensureSession();
    const responses = await this.call([
      ['Thread/get', { accountId: this.accountId, ids: [threadId] }, 't'],
      [
        'Email/get',
        this.emailGetArgs(
          { resultOf: 't', name: 'Thread/get', path: '/list/*/emailIds' },
          true,
        ),
        'g',
      ],
    ]);
    const thread = this.result(responses, 't') as {
      list: { id: string; emailIds: string[] }[];
      notFound?: string[];
    };
    if (thread.list.length === 0) {
      throw new MessageNotFoundError(threadId, 'jmap');
    }
    const { list } = this.result(responses, 'g') as { list: JMAPEmail[] };
    const mailboxes = await this.mailboxList();
    const byId = new Map(list.map((e) => [e.id, e]));
    // Thread/get lists emailIds in conversation order.
    return thread.list[0].emailIds
      .map((id) => byId.get(id))
      .filter((e): e is JMAPEmail => e !== undefined)
      .map((e) => this.mapEmail(e, mailboxes));
  }

  async fetch(options: FetchOptions = {}): Promise<EmailMessage[]> {
    await this.ensureSession();
    const mailboxes = await this.mailboxList();
    let ids: string[];
    if (options.messageIds) {
      ids = options.messageIds;
    } else {
      const mailbox = await this.resolveMailbox(options.folder ?? 'INBOX');
      const filter: Record<string, unknown> = { inMailbox: mailbox.id };
      if (options.since) filter.after = options.since.toISOString();
      if (options.before) filter.before = options.before.toISOString();
      if (options.unreadOnly) filter.notKeyword = '$seen';
      ids = await this.query(filter, options.limit ?? 50, options.offset ?? 0);
    }
    const { emails } = await this.getEmails(ids, true);
    const order = new Map(ids.map((id, i) => [id, i]));
    emails.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    if (options.markSeen && emails.length > 0) {
      await this.markRead(emails.map((e) => e.id));
    }
    return emails.map((e) => this.mapEmail(e, mailboxes));
  }

  private async query(
    filter: Record<string, unknown>,
    limit: number,
    position = 0,
  ): Promise<string[]> {
    const responses = await this.call([
      [
        'Email/query',
        {
          accountId: this.accountId,
          filter,
          sort: [{ property: 'receivedAt', isAscending: false }],
          position,
          limit,
        },
        'q',
      ],
    ]);
    return (this.result(responses, 'q') as { ids: string[] }).ids;
  }

  async search(criteria: SearchCriteria): Promise<EmailMessage[]> {
    await this.ensureSession();
    const conditions: Record<string, unknown>[] = [];
    if (criteria.from) conditions.push({ from: criteria.from });
    if (criteria.to) conditions.push({ to: criteria.to });
    if (criteria.subject) conditions.push({ subject: criteria.subject });
    if (criteria.body) conditions.push({ body: criteria.body });
    if (criteria.q) conditions.push({ text: criteria.q });
    if (criteria.since)
      conditions.push({ after: criteria.since.toISOString() });
    if (criteria.before)
      conditions.push({ before: criteria.before.toISOString() });
    if (criteria.unread) conditions.push({ notKeyword: '$seen' });
    if (criteria.flagged) conditions.push({ hasKeyword: '$flagged' });
    if (criteria.answered) conditions.push({ hasKeyword: '$answered' });
    if (criteria.draft) conditions.push({ hasKeyword: '$draft' });
    if (criteria.larger !== undefined)
      conditions.push({ minSize: criteria.larger });
    if (criteria.smaller !== undefined)
      conditions.push({ maxSize: criteria.smaller });
    for (const [name, value] of Object.entries(criteria.header ?? {})) {
      conditions.push({ header: [name, value] });
    }
    // sentSince/sentBefore and deleted have no JMAP filter equivalent and are ignored.
    const filter =
      conditions.length === 1 ? conditions[0] : { operator: 'AND', conditions };
    const ids = await this.query(filter, 100);
    const { emails } = await this.getEmails(ids, true);
    const mailboxes = await this.mailboxList();
    const order = new Map(ids.map((id, i) => [id, i]));
    emails.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return emails.map((e) => this.mapEmail(e, mailboxes));
  }

  // ========================================================================
  // Message mutations (existing EmailClient surface only)
  // ========================================================================

  private async updateEmails(
    ids: string[],
    patch: (id: string) => Record<string, unknown>,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.ensureSession();
    const update: Record<string, Record<string, unknown>> = {};
    for (const id of ids) update[id] = patch(id);
    const responses = await this.call([
      ['Email/set', { accountId: this.accountId, update }, 'u'],
    ]);
    const res = this.result(responses, 'u') as {
      notUpdated?: Record<string, { type: string; description?: string }>;
    };
    const failed = Object.entries(res.notUpdated ?? {});
    if (failed.length > 0) {
      const [id, error] = failed[0];
      if (error.type === 'notFound') throw new MessageNotFoundError(id, 'jmap');
      throw this.methodError(error);
    }
  }

  async markRead(messageId: string | string[]): Promise<void> {
    await this.updateEmails(this.normalizeMessageIds(messageId), () => ({
      'keywords/$seen': true,
    }));
  }

  async markUnread(messageId: string | string[]): Promise<void> {
    await this.updateEmails(this.normalizeMessageIds(messageId), () => ({
      'keywords/$seen': null,
    }));
  }

  async move(messageId: string | string[], folder: string): Promise<void> {
    const target = await this.resolveMailbox(folder);
    await this.updateEmails(this.normalizeMessageIds(messageId), () => ({
      mailboxIds: { [target.id]: true },
    }));
  }

  async copy(messageId: string | string[], folder: string): Promise<void> {
    // JMAP messages live in any number of mailboxes: "copy" adds membership.
    const target = await this.resolveMailbox(folder);
    await this.updateEmails(this.normalizeMessageIds(messageId), () => ({
      [`mailboxIds/${target.id}`]: true,
    }));
  }

  async delete(messageId: string | string[]): Promise<void> {
    const ids = this.normalizeMessageIds(messageId);
    if (ids.length === 0) return;
    await this.ensureSession();
    const responses = await this.call([
      ['Email/set', { accountId: this.accountId, destroy: ids }, 'd'],
    ]);
    const res = this.result(responses, 'd') as {
      notDestroyed?: Record<string, { type: string; description?: string }>;
    };
    const failed = Object.entries(res.notDestroyed ?? {});
    if (failed.length > 0) {
      const [id, error] = failed[0];
      if (error.type === 'notFound') throw new MessageNotFoundError(id, 'jmap');
      throw this.methodError(error);
    }
  }

  async send(
    _message: EmailMessage,
    _options?: SendOptions,
  ): Promise<SendResult> {
    throw new EmailError(
      'Sending through JMAP is not implemented yet (EmailSubmission is part of the write-back work)',
      'NOT_SUPPORTED',
      'jmap',
    );
  }

  // ========================================================================
  // Change feed
  // ========================================================================

  async getChanges(options: ChangeFeedOptions = {}): Promise<ChangeFeedResult> {
    await this.ensureSession();
    const limit = Math.max(1, options.limit ?? DEFAULT_FEED_LIMIT);
    const includeBodies = options.includeBodies ?? false;

    if (options.cursor === undefined) {
      return this.initialPage(undefined, limit, includeBodies);
    }
    const cursor = this.decodeCursor(options.cursor);
    if (!cursor) {
      return {
        status: 'resync-required',
        reason: 'cursor-invalid',
        message: 'Cursor is malformed or from an unsupported version',
      };
    }
    if (cursor.a !== this.accountId) {
      return {
        status: 'resync-required',
        reason: 'account-mismatch',
        message: 'Cursor belongs to a different JMAP account',
      };
    }
    if (cursor.c !== undefined) {
      return this.initialPage(cursor, limit, includeBodies);
    }
    return this.incrementalPage(cursor, limit, includeBodies);
  }

  private encodeCursor(cursor: Cursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(raw: string): Cursor | null {
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString());
      if (
        parsed?.v === CURSOR_VERSION &&
        typeof parsed.a === 'string' &&
        typeof parsed.e === 'string' &&
        typeof parsed.m === 'string' &&
        (parsed.c === undefined || typeof parsed.c === 'string')
      ) {
        return parsed as Cursor;
      }
    } catch {
      // fall through
    }
    return null;
  }

  /**
   * Initial pass, paged by an anchor so deletions between pages cannot skip
   * messages. The first page captures the Email and Mailbox states *before*
   * querying, so anything that arrives mid-pass is reported by the first
   * incremental batch (possibly again; consumers are idempotent).
   */
  private async initialPage(
    cursor: Cursor | undefined,
    limit: number,
    includeBodies: boolean,
  ): Promise<ChangeFeedResult> {
    const calls: MethodCall[] = [];
    const first = cursor === undefined;
    if (first) {
      calls.push(
        [
          'Email/get',
          { accountId: this.accountId, ids: [], properties: ['id'] },
          'state',
        ],
        ['Mailbox/get', { accountId: this.accountId, ids: null }, 'mb'],
      );
    }
    const query: Record<string, unknown> = {
      accountId: this.accountId,
      sort: [{ property: 'receivedAt', isAscending: true }],
      limit,
      calculateTotal: true,
    };
    if (cursor?.c) {
      query.anchor = cursor.c;
      query.anchorOffset = 1;
    }
    calls.push(
      ['Email/query', query, 'q'],
      [
        'Email/get',
        this.emailGetArgs(
          { resultOf: 'q', name: 'Email/query', path: '/ids' },
          includeBodies,
        ),
        'g',
      ],
    );
    const responses = await this.call(calls);

    if (this.errorType(responses, 'q') === 'anchorNotFound') {
      return {
        status: 'resync-required',
        reason: 'cursor-expired',
        message: 'Initial pass anchor was removed; restart the pass',
      };
    }
    const queryRes = this.result(responses, 'q') as {
      ids: string[];
      position?: number;
      total?: number;
    };
    const getRes = this.result(responses, 'g') as { list: JMAPEmail[] };

    let emailState: string;
    let mailboxState: string;
    let mailboxes: JMAPMailbox[];
    if (first) {
      emailState = (this.result(responses, 'state') as { state: string }).state;
      const mb = this.result(responses, 'mb') as {
        state: string;
        list: JMAPMailbox[];
      };
      mailboxState = mb.state;
      mailboxes = mb.list;
      this.mailboxes = mailboxes;
    } else {
      emailState = (cursor as Cursor).e;
      mailboxState = (cursor as Cursor).m;
      mailboxes = await this.mailboxList();
    }

    const ids = queryRes.ids;
    // The server may cap the page below `limit` (RFC 8620 section 5.5), so
    // compare against the total when it reports one; otherwise any non-empty
    // page may be followed by more and an empty page ends the pass.
    const hasMore =
      ids.length > 0 &&
      (typeof queryRes.total === 'number' &&
      typeof queryRes.position === 'number'
        ? queryRes.position + ids.length < queryRes.total
        : true);
    const byId = new Map(getRes.list.map((e) => [e.id, e]));
    const added = ids
      .map((id) => byId.get(id))
      .filter((e): e is JMAPEmail => e !== undefined)
      .map((e) => this.mapEmail(e, mailboxes));

    const next: Cursor = {
      v: CURSOR_VERSION,
      a: this.accountId,
      e: emailState,
      m: mailboxState,
    };
    if (hasMore) next.c = ids[ids.length - 1];
    return {
      status: 'ok',
      cursor: this.encodeCursor(next),
      hasMore,
      initial: true,
      added,
      changed: [],
      removed: [],
      folders: first
        ? mailboxes.map((m) => this.toFolder(m, mailboxes))
        : undefined,
    };
  }

  private async incrementalPage(
    cursor: Cursor,
    limit: number,
    includeBodies: boolean,
  ): Promise<ChangeFeedResult> {
    const responses = await this.call([
      [
        'Email/changes',
        {
          accountId: this.accountId,
          sinceState: cursor.e,
          maxChanges: limit,
        },
        'ec',
      ],
      [
        'Email/get',
        this.emailGetArgs(
          { resultOf: 'ec', name: 'Email/changes', path: '/created' },
          includeBodies,
        ),
        'gc',
      ],
      [
        'Email/get',
        this.emailGetArgs(
          { resultOf: 'ec', name: 'Email/changes', path: '/updated' },
          includeBodies,
        ),
        'gu',
      ],
      [
        'Mailbox/changes',
        { accountId: this.accountId, sinceState: cursor.m },
        'mc',
      ],
    ]);

    const emailErr = this.errorType(responses, 'ec');
    const mailboxErr = this.errorType(responses, 'mc');
    if (
      emailErr === 'cannotCalculateChanges' ||
      mailboxErr === 'cannotCalculateChanges'
    ) {
      return {
        status: 'resync-required',
        reason: 'cursor-expired',
        message: 'Server can no longer calculate changes from this state',
      };
    }

    const ec = this.result(responses, 'ec') as {
      newState: string;
      hasMoreChanges: boolean;
      destroyed: string[];
    };
    const created = this.result(responses, 'gc') as { list: JMAPEmail[] };
    const updated = this.result(responses, 'gu') as { list: JMAPEmail[] };
    let mc = this.result(responses, 'mc') as unknown as MailboxChanges;

    // Mailboxes are few; drain any paging server-side before continuing.
    let pages = 0;
    while (mc.hasMoreChanges) {
      if (pages++ >= MAX_MAILBOX_CHANGE_PAGES) {
        return {
          status: 'resync-required',
          reason: 'cursor-expired',
          message: 'Mailbox changes did not converge; resync',
        };
      }
      const more = await this.call([
        [
          'Mailbox/changes',
          { accountId: this.accountId, sinceState: mc.newState },
          'mc',
        ],
      ]);
      if (this.errorType(more, 'mc') === 'cannotCalculateChanges') {
        return {
          status: 'resync-required',
          reason: 'cursor-expired',
          message: 'Server can no longer calculate mailbox changes',
        };
      }
      const next = this.result(more, 'mc') as unknown as MailboxChanges;
      mc = {
        ...next,
        created: [...mc.created, ...next.created],
        updated: [...mc.updated, ...next.updated],
        destroyed: [...mc.destroyed, ...next.destroyed],
        updatedProperties:
          mc.updatedProperties && next.updatedProperties
            ? [...mc.updatedProperties, ...next.updatedProperties]
            : null,
      };
    }

    const structureChanged =
      mc.created.length > 0 ||
      mc.destroyed.length > 0 ||
      (mc.updated.length > 0 &&
        (mc.updatedProperties === null ||
          mc.updatedProperties.some((p) => !MAILBOX_COUNT_PROPERTIES.has(p))));

    let folders: Folder[] | undefined;
    if (structureChanged || !this.mailboxes) {
      const { list } = await this.loadMailboxes();
      if (structureChanged) folders = list.map((m) => this.toFolder(m, list));
    }
    const mailboxes = this.mailboxes as JMAPMailbox[];

    // Ids created and destroyed before we could read them are in `removed`
    // of this or a later batch, so notFound entries are safe to drop.
    const next: Cursor = {
      v: CURSOR_VERSION,
      a: this.accountId,
      e: ec.newState,
      m: mc.newState,
    };
    return {
      status: 'ok',
      cursor: this.encodeCursor(next),
      hasMore: ec.hasMoreChanges,
      initial: false,
      added: created.list.map((e) => this.mapEmail(e, mailboxes)),
      changed: updated.list.map((e) => this.mapEmail(e, mailboxes)),
      removed: ec.destroyed,
      folders,
    };
  }

  // ========================================================================
  // Push (EventSource, RFC 8620 section 7.3)
  // ========================================================================

  async subscribeChanges(
    listener: ChangeHintListener,
    options: SubscribeChangesOptions = {},
  ): Promise<Unsubscribe> {
    const session = await this.ensureSession();
    if (!session.eventSourceUrl) {
      throw new EmailError(
        'JMAP server does not advertise an eventSourceUrl',
        'NOT_SUPPORTED',
        'jmap',
      );
    }
    const url = session.eventSourceUrl
      .replace('{types}', '*')
      .replace('{closeafter}', 'no')
      .replace('{ping}', '30');
    const controller = new AbortController();
    this.subscriptions.add(controller);
    options.signal?.addEventListener('abort', () => controller.abort(), {
      once: true,
    });
    if (options.signal?.aborted) controller.abort();

    void this.runEventSource(url, listener, controller, options);
    return () => {
      controller.abort();
      this.subscriptions.delete(controller);
    };
  }

  private async runEventSource(
    url: string,
    listener: ChangeHintListener,
    controller: AbortController,
    options: SubscribeChangesOptions,
  ): Promise<void> {
    let delay = 1000;
    while (!controller.signal.aborted) {
      try {
        const response = await this.request(url, {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!response.body) throw new ConnectionError('Empty stream', 'jmap');
        delay = 1000;
        await readEventStream(response.body, (event, data) => {
          if (event !== 'state') return;
          this.dispatchStateChange(data, listener);
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        options.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
        if (
          error instanceof AuthenticationError ||
          error instanceof AuthorizationError
        ) {
          return; // credentials will not fix themselves
        }
      }
      if (controller.signal.aborted) return;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30_000);
    }
  }

  private dispatchStateChange(data: string, listener: ChangeHintListener) {
    try {
      const parsed = JSON.parse(data) as {
        changed?: Record<string, Record<string, string>>;
      };
      const mine = parsed.changed?.[this.accountId];
      if (!mine) return;
      listener({ types: Object.keys(mine) });
    } catch (error) {
      this.debug('Ignoring malformed StateChange', error);
    }
  }
}

interface MailboxChanges {
  newState: string;
  hasMoreChanges: boolean;
  created: string[];
  updated: string[];
  destroyed: string[];
  updatedProperties: string[] | null;
}

/** Minimal Server-Sent Events reader. */
async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.search(/\r\n|\n|\r/);
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      const terminator = buffer.slice(newline).match(/^(\r\n|\n|\r)/)?.[0];
      buffer = buffer.slice(newline + (terminator?.length ?? 1));
      if (line === '') {
        if (data.length > 0) onEvent(event, data.join('\n'));
        event = 'message';
        data = [];
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let val = colon === -1 ? '' : line.slice(colon + 1);
        if (val.startsWith(' ')) val = val.slice(1);
        if (field === 'event') event = val;
        else if (field === 'data') data.push(val);
      }
      newline = buffer.search(/\r\n|\n|\r/);
    }
  }
}
