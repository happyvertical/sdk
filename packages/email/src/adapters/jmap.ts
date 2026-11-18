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
 * Triage write-back (flags/keywords, labels, archive, spam, drafts) is
 * implemented with Email/set; sending uses EmailSubmission/set (see send()).
 * Every request, including submission, goes through the same trusted-origin
 * and https checks as the rest of the adapter; no extra URLs are contacted.
 */

import { randomUUID } from 'node:crypto';
import { BaseEmailClient } from '../shared/base';
import {
  AuthenticationError,
  AuthorizationError,
  ConnectionError,
  EmailError,
  FolderNotFoundError,
  MessageNotFoundError,
  SendError,
  TimeoutError,
} from '../shared/errors';
import type {
  AdapterType,
  Attachment,
  ChangeFeedOptions,
  ChangeFeedResult,
  ChangeHintListener,
  DraftResult,
  EmailAddress,
  EmailClientCapabilities,
  EmailIdentity,
  EmailMessage,
  FetchOptions,
  FlagChange,
  Folder,
  FolderInfo,
  FolderSpecialUse,
  JMAPOptions,
  LabelChange,
  SearchCriteria,
  SendOptions,
  SendResult,
  SubscribeChangesOptions,
  Unsubscribe,
  WriteBackFailure,
  WriteBackOptions,
  WriteBackResult,
} from '../shared/types';

const CAP_CORE = 'urn:ietf:params:jmap:core';
const CAP_MAIL = 'urn:ietf:params:jmap:mail';
const CAP_SUBMISSION = 'urn:ietf:params:jmap:submission';
const USING = [CAP_CORE, CAP_MAIL];
const USING_SUBMISSION = [CAP_CORE, CAP_MAIL, CAP_SUBMISSION];

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

/** IMAP-style flags (lower-cased) that map to a settable JMAP keyword. */
const SETTABLE_FLAG_TO_KEYWORD: Record<string, string> = {
  '\\seen': '$seen',
  '\\flagged': '$flagged',
  '\\answered': '$answered',
};
/** Not settable through updateFlags: drafts and deletion have their own operations. */
const UNSETTABLE_FLAGS = new Set([
  '\\draft',
  '\\deleted',
  '\\recent',
  '$draft',
]);
/** RFC 8621 keyword grammar: 1-255 printable ASCII, none of ( ) { ] % * " \\. */
const KEYWORD_PATTERN =
  /^[\x21\x23\x24\x26\x27\x2b-\x5b\x5e-\x7a\x7c\x7e]{1,255}$/;
/** Headers a caller cannot override through SendOptions.headers. */
const RESERVED_HEADERS = new Set([
  'from',
  'to',
  'cc',
  'bcc',
  'sender',
  'reply-to',
  'subject',
  'date',
  'message-id',
  'in-reply-to',
  'references',
  'mime-version',
  'return-path',
  'received',
  'content-type',
  'content-transfer-encoding',
  'content-disposition',
]);

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
    const session = await this.ensureSession();
    const submission = this.submissionAccountId(session) === this.accountId;
    return {
      send: submission,
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
      writeBack: {
        flags: true,
        keywords: true,
        labels: true,
        archive: true,
        spam: true,
        drafts: true,
        submission,
      },
    };
  }

  /** Account that holds submission (identities, EmailSubmission), if the server offers it. */
  private submissionAccountId(session: JMAPSession): string | undefined {
    if (!(CAP_SUBMISSION in (session.capabilities ?? {}))) return undefined;
    return session.primaryAccounts?.[CAP_SUBMISSION];
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
  private async call(
    methodCalls: MethodCall[],
    using: string[] = USING,
  ): Promise<MethodResponse[]> {
    const session = await this.ensureSession();
    const response = await this.request(session.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ using, methodCalls }),
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

    const partValue = (p: JMAPBodyPart) =>
      p.partId ? email.bodyValues?.[p.partId]?.value : undefined;
    const escapeHtml = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // textBody/htmlBody are ordered part lists to concatenate: a multipart
    // message can interleave text/plain sections with the HTML body, so keep
    // every part (plain parts become preformatted HTML inside the html body).
    const textParts = (email.textBody ?? []).filter(
      (p) => p.type === 'text/plain',
    );
    const text =
      textParts.length > 0
        ? textParts
            .map(partValue)
            .filter((v): v is string => typeof v === 'string')
            .join('\n')
        : undefined;
    const htmlList = email.htmlBody ?? [];
    const html = htmlList.some((p) => p.type === 'text/html')
      ? htmlList
          .map((p) => {
            const v = partValue(p);
            if (typeof v !== 'string') return undefined;
            return p.type === 'text/html'
              ? v
              : `<div style="white-space:pre-wrap">${escapeHtml(v)}</div>`;
          })
          .filter((v): v is string => v !== undefined)
          .join('\n')
      : undefined;
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
      text,
      html,
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
    const emails: JMAPEmail[] = [];
    const notFound: string[] = [];
    // Respect the server's maxObjectsInGet by fetching in chunks.
    const size = this.maxObjectsInGet();
    for (let i = 0; i < ids.length; i += size) {
      const responses = await this.call([
        [
          'Email/get',
          this.emailGetArgs(ids.slice(i, i + size), includeBodies),
          'g',
        ],
      ]);
      const res = this.result(responses, 'g') as {
        list: JMAPEmail[];
        notFound?: string[];
      };
      emails.push(...res.list);
      notFound.push(...(res.notFound ?? []));
    }
    return { emails, notFound };
  }

  /** Server's maxObjectsInGet (RFC 8620 section 2), defaulting to a safe 50. */
  private maxObjectsInGet(): number {
    const core = this.session?.capabilities?.[CAP_CORE] as
      | { maxObjectsInGet?: number }
      | undefined;
    const max = core?.maxObjectsInGet;
    return typeof max === 'number' && max > 0 ? max : 50;
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
    ]);
    const thread = this.result(responses, 't') as {
      list: { id: string; emailIds: string[] }[];
    };
    if (thread.list.length === 0) {
      throw new MessageNotFoundError(threadId, 'jmap');
    }
    // Thread/get lists emailIds in conversation order; getEmails chunks by
    // the server's maxObjectsInGet so long threads still fit.
    const ids = thread.list[0].emailIds;
    const { emails } = await this.getEmails(ids, true);
    const mailboxes = await this.mailboxList();
    const byId = new Map(emails.map((e) => [e.id, e]));
    return ids
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

  // ========================================================================
  // Triage write-back (Email/set)
  // ========================================================================

  /** Server's maxObjectsInSet (RFC 8620 section 2), defaulting to a safe 50. */
  private maxObjectsInSet(): number {
    const core = this.session?.capabilities?.[CAP_CORE] as
      | { maxObjectsInSet?: number }
      | undefined;
    const max = core?.maxObjectsInSet;
    return typeof max === 'number' && max > 0 ? max : 50;
  }

  /**
   * Apply one patch per message with Email/set and report per-message
   * outcomes. Chunked by maxObjectsInSet; `ifInState` guards the first chunk
   * only (later chunks necessarily see the state that chunk produced).
   * Patches are absolute (set true / remove), so re-running is harmless.
   */
  private async patchEmails(
    ids: string[],
    patch: Record<string, unknown>,
    options: WriteBackOptions = {},
  ): Promise<WriteBackResult> {
    const unique = [...new Set(ids)];
    const result: WriteBackResult = { updated: [], failed: [] };
    if (unique.length === 0) return result;
    await this.ensureSession();
    const size = this.maxObjectsInSet();
    for (let i = 0; i < unique.length; i += size) {
      const chunk = unique.slice(i, i + size);
      const update: Record<string, Record<string, unknown>> = {};
      for (const id of chunk) update[id] = { ...patch };
      const args: Record<string, unknown> = {
        accountId: this.accountId,
        update,
      };
      if (i === 0 && options.ifInState) args.ifInState = options.ifInState;
      const responses = await this.call([['Email/set', args, 'p']]);
      const res = this.result(responses, 'p') as {
        oldState?: string;
        newState?: string;
        updated?: Record<string, unknown> | null;
        notUpdated?: Record<string, { type: string; description?: string }>;
      };
      if (i === 0) result.oldState = res.oldState;
      result.state = res.newState ?? result.state;
      for (const id of chunk) {
        const failure = res.notUpdated?.[id];
        if (failure) {
          result.failed.push({
            id,
            code: failure.type,
            message: failure.description,
          });
        } else if (res.updated && id in res.updated) {
          result.updated.push(id);
        } else {
          result.failed.push({
            id,
            code: 'unknown',
            message: 'Server did not report an outcome for this message',
          });
        }
      }
    }
    return result;
  }

  /** Map a flag or keyword to a JMAP keyword; rejects flags JMAP cannot set. */
  private toKeyword(flag: string): string {
    const lower = flag.toLowerCase();
    if (lower in SETTABLE_FLAG_TO_KEYWORD)
      return SETTABLE_FLAG_TO_KEYWORD[lower];
    if (UNSETTABLE_FLAGS.has(lower)) {
      throw new EmailError(
        `Flag ${flag} cannot be set through updateFlags (use the draft/delete operations)`,
        'INVALID_ARGUMENT',
        'jmap',
      );
    }
    if (lower.startsWith('\\') || !KEYWORD_PATTERN.test(flag)) {
      throw new EmailError(
        `Invalid keyword: ${JSON.stringify(flag)}`,
        'INVALID_ARGUMENT',
        'jmap',
      );
    }
    return lower;
  }

  async updateFlags(
    messageId: string | string[],
    change: FlagChange,
    options?: WriteBackOptions,
  ): Promise<WriteBackResult> {
    const add = [...new Set((change.add ?? []).map((f) => this.toKeyword(f)))];
    const remove = [
      ...new Set((change.remove ?? []).map((f) => this.toKeyword(f))),
    ];
    const both = add.filter((k) => remove.includes(k));
    if (both.length > 0) {
      throw new EmailError(
        `Flag(s) both added and removed: ${both.join(', ')}`,
        'INVALID_ARGUMENT',
        'jmap',
      );
    }
    const patch: Record<string, unknown> = {};
    for (const k of add) patch[`keywords/${k}`] = true;
    for (const k of remove) patch[`keywords/${k}`] = null;
    if (Object.keys(patch).length === 0) {
      return { updated: [], failed: [] };
    }
    return this.patchEmails(
      this.normalizeMessageIds(messageId),
      patch,
      options,
    );
  }

  async updateLabels(
    messageId: string | string[],
    change: LabelChange,
    options?: WriteBackOptions,
  ): Promise<WriteBackResult> {
    const resolve = async (names: string[] = []) => [
      ...new Set(
        (await Promise.all(names.map((n) => this.resolveMailbox(n)))).map(
          (m) => m.id,
        ),
      ),
    ];
    const add = await resolve(change.add);
    const remove = await resolve(change.remove);
    if (add.some((id) => remove.includes(id))) {
      throw new EmailError(
        'A label cannot be both added and removed',
        'INVALID_ARGUMENT',
        'jmap',
      );
    }
    const patch: Record<string, unknown> = {};
    for (const id of add) patch[`mailboxIds/${id}`] = true;
    for (const id of remove) patch[`mailboxIds/${id}`] = null;
    if (Object.keys(patch).length === 0) return { updated: [], failed: [] };
    return this.patchEmails(
      this.normalizeMessageIds(messageId),
      patch,
      options,
    );
  }

  private async mailboxByRole(role: string): Promise<JMAPMailbox | undefined> {
    return (await this.mailboxList()).find((m) => m.role === role);
  }

  private async requireRole(role: string): Promise<JMAPMailbox> {
    const mailbox = await this.mailboxByRole(role);
    if (!mailbox) throw new FolderNotFoundError(`\\${role}`, 'jmap');
    return mailbox;
  }

  /** Remove from the inbox and add to the Archive mailbox; other labels are kept. */
  async archive(
    messageId: string | string[],
    options?: WriteBackOptions,
  ): Promise<WriteBackResult> {
    const archive = await this.requireRole('archive');
    const inbox = await this.mailboxByRole('inbox');
    const patch: Record<string, unknown> = {
      [`mailboxIds/${archive.id}`]: true,
    };
    if (inbox) patch[`mailboxIds/${inbox.id}`] = null;
    return this.patchEmails(
      this.normalizeMessageIds(messageId),
      patch,
      options,
    );
  }

  /**
   * Move to the Junk mailbox and set `$junk` (spam = true), or move back to
   * the inbox and set `$notjunk` (spam = false).
   */
  async markSpam(
    messageId: string | string[],
    spam = true,
    options?: WriteBackOptions,
  ): Promise<WriteBackResult> {
    const target = await this.requireRole(spam ? 'junk' : 'inbox');
    return this.patchEmails(
      this.normalizeMessageIds(messageId),
      {
        mailboxIds: { [target.id]: true },
        'keywords/$junk': spam ? true : null,
        'keywords/$notjunk': spam ? null : true,
      },
      options,
    );
  }

  // ========================================================================
  // Drafts
  // ========================================================================

  private stripAngles(id: string): string {
    return id.replace(/^<|>$/g, '');
  }

  private jmapAddresses(list?: EmailAddress[]) {
    return (list ?? []).map((a) => ({
      ...(a.name ? { name: a.name } : {}),
      email: a.address,
    }));
  }

  /** Build the Email/set create object for a draft or an outgoing message. */
  private composeEmail(
    message: EmailMessage,
    extra: {
      mailboxIds: Record<string, boolean>;
      keywords: Record<string, boolean>;
      messageId?: string;
      date?: Date;
      headers?: Record<string, string | string[]>;
    },
  ): Record<string, unknown> {
    for (const a of message.attachments ?? []) {
      if (!a.id) {
        throw new EmailError(
          'JMAP attachments must reference an uploaded blob (Attachment.id); inline content upload is not supported',
          'NOT_SUPPORTED',
          'jmap',
        );
      }
    }
    const bodyValues: Record<string, { value: string }> = {};
    const parts: Record<string, unknown>[] = [];
    if (message.text !== undefined) {
      bodyValues.text = { value: message.text };
      parts.push({ partId: 'text', type: 'text/plain' });
    }
    if (message.html !== undefined) {
      bodyValues.html = { value: message.html };
      parts.push({ partId: 'html', type: 'text/html' });
    }
    if (parts.length === 0) {
      bodyValues.text = { value: '' };
      parts.push({ partId: 'text', type: 'text/plain' });
    }
    let body: Record<string, unknown> =
      parts.length === 1
        ? parts[0]
        : { type: 'multipart/alternative', subParts: parts };
    const attachments = (message.attachments ?? []).map((a) => ({
      blobId: a.id,
      type: a.contentType,
      ...(a.filename ? { name: a.filename } : {}),
      disposition: a.contentDisposition ?? 'attachment',
      ...(a.contentId ? { cid: a.contentId } : {}),
    }));
    if (attachments.length > 0) {
      body = { type: 'multipart/mixed', subParts: [body, ...attachments] };
    }

    const email: Record<string, unknown> = {
      mailboxIds: extra.mailboxIds,
      keywords: extra.keywords,
      subject: message.subject ?? '',
      bodyStructure: body,
      bodyValues,
    };
    if (message.from?.address) email.from = this.jmapAddresses([message.from]);
    if (message.to?.length) email.to = this.jmapAddresses(message.to);
    if (message.cc?.length) email.cc = this.jmapAddresses(message.cc);
    if (message.bcc?.length) email.bcc = this.jmapAddresses(message.bcc);
    if (message.replyTo) email.replyTo = this.jmapAddresses([message.replyTo]);
    if (message.inReplyTo)
      email.inReplyTo = [this.stripAngles(message.inReplyTo)];
    if (message.references?.length) {
      email.references = message.references.map((r) => this.stripAngles(r));
    }
    if (extra.messageId) email.messageId = [this.stripAngles(extra.messageId)];
    if (extra.date) email.sentAt = extra.date.toISOString();
    for (const [name, value] of Object.entries(extra.headers ?? {})) {
      if (
        !/^[A-Za-z0-9-]+$/.test(name) ||
        RESERVED_HEADERS.has(name.toLowerCase())
      ) {
        throw new EmailError(
          `Header ${JSON.stringify(name)} is not allowed`,
          'INVALID_ARGUMENT',
          'jmap',
        );
      }
      const values = Array.isArray(value) ? value : [value];
      if (values.some((v) => /[\r\n]/.test(v))) {
        throw new EmailError(
          `Header ${name} contains a line break`,
          'INVALID_ARGUMENT',
          'jmap',
        );
      }
      email[
        Array.isArray(value)
          ? `header:${name}:asText:all`
          : `header:${name}:asText`
      ] = value;
    }
    return email;
  }

  private validateDraft(message: EmailMessage): void {
    for (const a of [
      ...(message.from?.address ? [message.from] : []),
      ...(message.to ?? []),
      ...(message.cc ?? []),
      ...(message.bcc ?? []),
    ]) {
      this.validateEmail(a);
    }
  }

  /** The message must exist and carry `$draft`: drafts APIs never touch other mail. */
  private async requireDraft(draftId: string): Promise<JMAPEmail> {
    const { emails } = await this.getEmails([draftId], false);
    if (emails.length === 0) throw new MessageNotFoundError(draftId, 'jmap');
    if (!emails[0].keywords?.$draft) {
      throw new EmailError(
        `Message ${draftId} is not a draft`,
        'NOT_A_DRAFT',
        'jmap',
      );
    }
    return emails[0];
  }

  async createDraft(
    message: EmailMessage,
    options: WriteBackOptions = {},
  ): Promise<DraftResult> {
    await this.ensureSession();
    this.validateDraft(message);
    const drafts = await this.requireRole('drafts');
    const messageId = this.newMessageId(message);
    const args: Record<string, unknown> = {
      accountId: this.accountId,
      create: {
        d: this.composeEmail(message, {
          mailboxIds: { [drafts.id]: true },
          keywords: { $draft: true, $seen: true },
          messageId,
        }),
      },
    };
    if (options.ifInState) args.ifInState = options.ifInState;
    const responses = await this.call([['Email/set', args, 'c']]);
    const res = this.result(responses, 'c') as {
      newState?: string;
      created?: Record<string, { id: string; threadId?: string }>;
      notCreated?: Record<string, { type: string; description?: string }>;
    };
    if (res.notCreated?.d) throw this.methodError(res.notCreated.d);
    const created = res.created?.d;
    if (!created) {
      throw new EmailError(
        'JMAP did not create the draft',
        'JMAP_PROTOCOL_ERROR',
        'jmap',
      );
    }
    return {
      id: created.id,
      threadId: created.threadId,
      messageId: this.stripAngles(messageId),
      state: res.newState,
    };
  }

  /**
   * JMAP emails are immutable, so an update creates the replacement first and
   * then destroys the old draft: a failure never loses the draft. The result
   * carries the new id.
   */
  async updateDraft(
    draftId: string,
    message: EmailMessage,
    options?: WriteBackOptions,
  ): Promise<DraftResult> {
    await this.requireDraft(draftId);
    const replacement = await this.createDraft(message, options);
    const responses = await this.call([
      ['Email/set', { accountId: this.accountId, destroy: [draftId] }, 'x'],
    ]);
    const res = this.result(responses, 'x') as {
      newState?: string;
      notDestroyed?: Record<string, { type: string; description?: string }>;
    };
    const failure = res.notDestroyed?.[draftId];
    if (failure && failure.type !== 'notFound') {
      throw new EmailError(
        `Draft replaced by ${replacement.id} but the old draft ${draftId} could not be removed: ${failure.type}`,
        'DRAFT_REPLACE_INCOMPLETE',
        'jmap',
      );
    }
    return { ...replacement, state: res.newState ?? replacement.state };
  }

  /** Idempotent: deleting a draft that is already gone succeeds. */
  async deleteDraft(
    draftId: string,
    options: WriteBackOptions = {},
  ): Promise<WriteBackResult> {
    try {
      await this.requireDraft(draftId);
    } catch (error) {
      if (error instanceof MessageNotFoundError) {
        return { updated: [draftId], failed: [] };
      }
      throw error;
    }
    const args: Record<string, unknown> = {
      accountId: this.accountId,
      destroy: [draftId],
    };
    if (options.ifInState) args.ifInState = options.ifInState;
    const responses = await this.call([['Email/set', args, 'x']]);
    const res = this.result(responses, 'x') as {
      oldState?: string;
      newState?: string;
      notDestroyed?: Record<string, { type: string; description?: string }>;
    };
    const failure = res.notDestroyed?.[draftId];
    if (failure && failure.type !== 'notFound') {
      return {
        updated: [],
        failed: [
          { id: draftId, code: failure.type, message: failure.description },
        ],
        state: res.newState,
        oldState: res.oldState,
      };
    }
    return {
      updated: [draftId],
      failed: [],
      state: res.newState,
      oldState: res.oldState,
    };
  }

  private newMessageId(message: EmailMessage, custom?: string): string {
    if (custom) return custom;
    const domain = message.from?.address?.split('@')[1] || 'localhost';
    return `<${randomUUID()}@${domain}>`;
  }

  // ========================================================================
  // Submission (EmailSubmission/set)
  // ========================================================================

  private requireSubmission(): void {
    const session = this.session as JMAPSession;
    const account = this.submissionAccountId(session);
    if (!account) {
      throw new EmailError(
        'JMAP server does not offer submission (urn:ietf:params:jmap:submission)',
        'NOT_SUPPORTED',
        'jmap',
      );
    }
    if (account !== this.accountId) {
      // Email and EmailSubmission must live in one account to be chained.
      throw new EmailError(
        'JMAP submission account differs from the mail account; sending is not supported for this account',
        'NOT_SUPPORTED',
        'jmap',
      );
    }
  }

  async listIdentities(): Promise<EmailIdentity[]> {
    await this.ensureSession();
    this.requireSubmission();
    const responses = await this.call(
      [['Identity/get', { accountId: this.accountId, ids: null }, 'id']],
      USING_SUBMISSION,
    );
    const res = this.result(responses, 'id') as {
      list: {
        id: string;
        name?: string;
        email: string;
        replyTo?: JMAPAddress[] | null;
        bcc?: JMAPAddress[] | null;
      }[];
    };
    return res.list.map((i) => ({
      id: i.id,
      name: i.name || undefined,
      email: i.email,
      replyTo: i.replyTo ? this.addresses(i.replyTo) : undefined,
      bcc: i.bcc ? this.addresses(i.bcc) : undefined,
    }));
  }

  /** Does the identity authorise this sender address? Supports `*@domain` wildcards. */
  private identityOwns(identity: EmailIdentity, address: string): boolean {
    const own = identity.email.trim().toLowerCase();
    const addr = address.trim().toLowerCase();
    if (!own || !addr) return false;
    if (own.startsWith('*@'))
      return addr.endsWith(own.slice(1)) && addr.length > own.length - 1;
    return own === addr;
  }

  /**
   * Choose the submission identity. The sender address must be owned by the
   * account: an explicit identityId is checked against the From address, and
   * without one exactly one identity must match. Nothing is created on the
   * server unless this succeeds.
   */
  private pickIdentity(
    identities: EmailIdentity[],
    from: string,
    identityId?: string,
  ): EmailIdentity {
    if (identityId) {
      const chosen = identities.find((i) => i.id === identityId);
      if (!chosen) {
        throw new EmailError(
          `Identity ${identityId} does not belong to this account`,
          'IDENTITY_NOT_FOUND',
          'jmap',
        );
      }
      if (!this.identityOwns(chosen, from)) {
        throw new EmailError(
          `Identity ${identityId} is not authorised to send as ${from}`,
          'IDENTITY_MISMATCH',
          'jmap',
        );
      }
      return chosen;
    }
    const exact = identities.filter(
      (i) => !i.email.startsWith('*@') && this.identityOwns(i, from),
    );
    if (exact.length > 1) {
      throw new EmailError(
        `More than one identity matches ${from}; pass identityId`,
        'IDENTITY_AMBIGUOUS',
        'jmap',
      );
    }
    const match =
      exact[0] ?? identities.find((i) => this.identityOwns(i, from));
    if (!match) {
      throw new EmailError(
        `This account has no identity for ${from}; refusing to send`,
        'FROM_NOT_OWNED',
        'jmap',
      );
    }
    return match;
  }

  /** Addresses in the draft's `sender` header (empty when absent). */
  private async draftSenders(draftId: string): Promise<string[]> {
    const responses = await this.call([
      [
        'Email/get',
        { accountId: this.accountId, ids: [draftId], properties: ['sender'] },
        's',
      ],
    ]);
    const res = this.result(responses, 's') as {
      list: { sender?: JMAPAddress[] | null }[];
    };
    return (res.list[0]?.sender ?? []).map((a) => a.email);
  }

  /**
   * A draft that already has a live submission must not be submitted again
   * (a retry after a partial failure would deliver twice).
   */
  private async assertNotSubmitted(emailId: string): Promise<string> {
    const responses = await this.call(
      [
        [
          'EmailSubmission/query',
          { accountId: this.accountId, filter: { emailIds: [emailId] } },
          'sq',
        ],
        [
          'EmailSubmission/get',
          {
            accountId: this.accountId,
            '#ids': {
              resultOf: 'sq',
              name: 'EmailSubmission/query',
              path: '/ids',
            },
            properties: ['id', 'undoStatus'],
          },
          'sg',
        ],
      ],
      USING_SUBMISSION,
    );
    const res = this.result(responses, 'sg') as {
      state: string;
      list: { id: string; undoStatus?: string }[];
    };
    const live = res.list.find((s) => s.undoStatus !== 'canceled');
    if (live) {
      throw new EmailError(
        `Draft ${emailId} was already submitted (submission ${live.id}); not sending again`,
        'ALREADY_SUBMITTED',
        'jmap',
      );
    }
    return res.state;
  }

  /**
   * Send through EmailSubmission/set.
   *
   * New message: one request creates the message (as `$draft` in Drafts) and
   * submits it with the identity chosen for its From address; on success the
   * server files it into Sent (`saveToSent`, default when a Sent mailbox
   * exists) or destroys it. Draft-then-submit: pass `options.draftId` (from
   * createDraft); the stored draft is submitted and `message` is ignored.
   *
   * Guards, all checked before anything is created: the From address must be
   * owned by the account's identity (`FROM_NOT_OWNED`, `IDENTITY_MISMATCH`,
   * `IDENTITY_NOT_FOUND`, `IDENTITY_AMBIGUOUS`), an envelope sender must
   * belong to the same identity (`ENVELOPE_FROM_NOT_OWNED`), only genuine
   * drafts can be submitted (`NOT_A_DRAFT`), and there must be a recipient.
   * `accepted` lists the queued recipients: JMAP reports delivery later.
   */
  async send(
    message: EmailMessage,
    options: SendOptions = {},
  ): Promise<SendResult> {
    await this.ensureSession();
    this.requireSubmission();

    let draft: JMAPEmail | undefined;
    let from: string;
    let recipients: string[];
    let draftSender: string[] = [];
    if (options.draftId) {
      draft = await this.requireDraft(options.draftId);
      // A draft written by another client may carry several From entries or
      // a Sender header; every sender-bearing header must be ours.
      if ((draft.from?.length ?? 0) !== 1) {
        throw new EmailError(
          'Draft must have exactly one From address; refusing to send',
          'FROM_NOT_OWNED',
          'jmap',
        );
      }
      draftSender = await this.draftSenders(options.draftId);
      from = draft.from?.[0]?.email ?? '';
      recipients = [
        ...(draft.to ?? []),
        ...(draft.cc ?? []),
        ...(draft.bcc ?? []),
      ].map((a) => a.email);
      if (!from) {
        throw new EmailError(
          'Draft has no From address; refusing to send',
          'FROM_NOT_OWNED',
          'jmap',
        );
      }
    } else {
      this.validateMessage(message);
      from = message.from.address;
      recipients = [
        ...message.to,
        ...(message.cc ?? []),
        ...(message.bcc ?? []),
      ].map((a) => a.address);
    }

    const identity = this.pickIdentity(
      await this.listIdentities(),
      from,
      options.identityId,
    );

    for (const sender of draftSender) {
      if (!this.identityOwns(identity, sender)) {
        throw new EmailError(
          `Draft Sender ${sender} is not owned by identity ${identity.id}; refusing to send`,
          'FROM_NOT_OWNED',
          'jmap',
        );
      }
    }
    // The submission state seen here guards the submit below: a concurrent
    // submission of the same draft changes it and ours is refused.
    const submissionState = draft
      ? await this.assertNotSubmitted(options.draftId as string)
      : undefined;

    let envelope: Record<string, unknown> | undefined;
    if (options.envelope?.from || options.envelope?.to) {
      const mailFrom = options.envelope.from ?? from;
      if (!this.identityOwns(identity, mailFrom)) {
        throw new EmailError(
          `Envelope sender ${mailFrom} is not owned by identity ${identity.id}`,
          'ENVELOPE_FROM_NOT_OWNED',
          'jmap',
        );
      }
      const to = options.envelope.to;
      const rcpt =
        to === undefined ? recipients : Array.isArray(to) ? to : [to];
      for (const address of rcpt) this.validateEmail({ address });
      envelope = {
        mailFrom: { email: mailFrom },
        rcptTo: rcpt.map((email) => ({ email })),
      };
      recipients = rcpt;
    }
    if (recipients.length === 0) {
      throw new EmailError(
        'Message has no recipients',
        'NO_RECIPIENTS',
        'jmap',
      );
    }

    const drafts = await this.mailboxByRole('drafts');
    const sent = await this.mailboxByRole('sent');
    if (options.saveToSent === true && !sent) {
      throw new FolderNotFoundError('\\Sent', 'jmap');
    }
    const saveToSent = options.saveToSent ?? sent !== undefined;

    const calls: MethodCall[] = [];
    let emailRef: string;
    const messageId = draft
      ? draft.messageId?.[0]
      : this.stripAngles(this.newMessageId(message, options.messageId));
    if (draft) {
      emailRef = options.draftId as string;
    } else {
      const createIn = drafts ?? sent;
      if (!createIn) throw new FolderNotFoundError('\\Drafts', 'jmap');
      calls.push([
        'Email/set',
        {
          accountId: this.accountId,
          create: {
            msg: this.composeEmail(message, {
              mailboxIds: { [createIn.id]: true },
              keywords: { $draft: true, $seen: true },
              messageId,
              date: options.date,
              headers: options.headers,
            }),
          },
        },
        'es',
      ]);
      emailRef = '#msg';
    }

    const submission: Record<string, unknown> = {
      accountId: this.accountId,
      ...(submissionState ? { ifInState: submissionState } : {}),
      create: {
        sub: {
          emailId: emailRef,
          identityId: identity.id,
          ...(envelope ? { envelope } : {}),
        },
      },
    };
    if (saveToSent && sent) {
      const patch: Record<string, unknown> = {
        'keywords/$draft': null,
        [`mailboxIds/${sent.id}`]: true,
      };
      if (drafts && drafts.id !== sent.id)
        patch[`mailboxIds/${drafts.id}`] = null;
      submission.onSuccessUpdateEmail = { '#sub': patch };
    } else {
      submission.onSuccessDestroyEmail = ['#sub'];
    }
    calls.push(['EmailSubmission/set', submission, 'ss']);

    const responses = await this.call(calls, USING_SUBMISSION);

    let createdMessage: { id: string; threadId?: string } | undefined;
    if (!draft) {
      const es = this.result(responses, 'es') as {
        created?: Record<string, { id: string; threadId?: string }>;
        notCreated?: Record<string, { type: string; description?: string }>;
      };
      if (es.notCreated?.msg) throw this.methodError(es.notCreated.msg);
      createdMessage = es.created?.msg;
    }

    const cleanup = async () => {
      if (!createdMessage) return;
      try {
        await this.call([
          [
            'Email/set',
            { accountId: this.accountId, destroy: [createdMessage.id] },
            'cleanup',
          ],
        ]);
      } catch {
        // best effort: a leftover draft is harmless and visible to the user
      }
    };
    let ss: {
      created?: Record<string, { id: string; undoStatus?: string }>;
      notCreated?: Record<string, { type: string; description?: string }>;
    };
    try {
      ss = this.result(responses, 'ss') as typeof ss;
    } catch (error) {
      await cleanup();
      if (error instanceof EmailError && error.code === 'JMAP_STATEMISMATCH') {
        throw new EmailError(
          'Draft was submitted concurrently by another request; not sending again',
          'ALREADY_SUBMITTED',
          'jmap',
          error,
        );
      }
      throw error;
    }
    const failure = ss.notCreated?.sub;
    if (failure || !ss.created?.sub) {
      await cleanup();
      const type = failure?.type ?? 'serverFail';
      throw new SendError(
        `JMAP submission rejected: ${type}${failure?.description ? ` (${failure.description})` : ''}`,
        [],
        recipients,
        'jmap',
        failure,
      );
    }

    // The server runs onSuccessUpdateEmail/DestroyEmail implicitly and reports
    // it as a second Email/set response. The mail is already queued, so a
    // failure there is reported, never thrown (a retry would deliver twice).
    const implicit = responses.find(
      (r) => r[2] === 'ss' && r[0] !== 'EmailSubmission/set',
    );
    let sentCopyError: string | undefined;
    if (implicit) {
      const body = implicit[1] as {
        type?: string;
        notUpdated?: Record<string, { type: string }>;
        notDestroyed?: Record<string, { type: string }>;
      };
      const failed =
        implicit[0] === 'error'
          ? body.type
          : Object.values({
              ...body.notUpdated,
              ...body.notDestroyed,
            })[0]?.type;
      if (failed) sentCopyError = String(failed);
    }

    return {
      ...(sentCopyError ? { sentCopyError } : {}),
      messageId: messageId ?? '',
      accepted: recipients,
      rejected: [],
      response: `jmap:${ss.created.sub.undoStatus ?? 'pending'}`,
      id: createdMessage?.id ?? options.draftId,
      threadId: createdMessage?.threadId ?? draft?.threadId,
      submissionId: ss.created.sub.id,
      identityId: identity.id,
    };
  }

  // ========================================================================
  // Change feed
  // ========================================================================

  async getChanges(options: ChangeFeedOptions = {}): Promise<ChangeFeedResult> {
    await this.ensureSession();
    const limit = Math.min(
      Math.max(1, options.limit ?? DEFAULT_FEED_LIMIT),
      this.maxObjectsInGet(),
    );
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
