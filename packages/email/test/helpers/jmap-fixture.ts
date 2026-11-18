/**
 * In-process JMAP server for tests: a real node:http server on an ephemeral
 * loopback port backed by in-memory state. No containers, no external hosts.
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FixtureEmail {
  id: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;
  messageId: string[];
  inReplyTo?: string[];
  subject: string;
  from: { name?: string; email: string }[];
  to: { name?: string; email: string }[];
  receivedAt: string;
  text: string;
  html?: string;
  size: number;
}

interface Change {
  state: number;
  kind: 'created' | 'updated' | 'destroyed';
  id: string;
}

export const ACCOUNT_ID = 'acc1';

export class JMAPFixture {
  server!: Server;
  baseUrl = '';
  emails = new Map<string, FixtureEmail>();
  mailboxes = new Map<
    string,
    { id: string; name: string; parentId: string | null; role: string | null }
  >();
  /** Requests received, for assertions. */
  requests: { method: string; url: string; auth?: string; body?: any }[] = [];
  private emailState = 1;
  private mailboxState = 1;
  private emailLog: Change[] = [];
  private mailboxLog: Change[] = [];
  private emailExpiredBefore = 0;
  private mailboxExpiredBefore = 0;
  private nextId = 1;
  private sse = new Set<ServerResponse>();
  /** Credentials accepted; default alice:secret (Basic) or token 'tok'. */
  validAuth = [
    `Basic ${Buffer.from('alice:secret').toString('base64')}`,
    'Bearer tok',
  ];
  /** When set, /.well-known/jmap redirects here (like Stalwart). */
  redirectSession = true;

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) =>
      this.server.listen(0, '127.0.0.1', resolve),
    );
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    this.addMailbox('mb-inbox', 'Inbox', null, 'inbox');
    this.addMailbox('mb-sent', 'Sent', null, 'sent');
    this.addMailbox('mb-archive', 'Archive', null, 'archive');
    this.addMailbox('mb-proj', 'Projects', null, null);
    this.addMailbox('mb-proj-x', 'X', 'mb-proj', null);
    this.requests = [];
  }

  async stop(): Promise<void> {
    for (const res of this.sse) res.end();
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  // ---- state mutation helpers (what a real server does on delivery etc.) ----

  get emailStateString(): string {
    return `e${this.emailState}`;
  }

  addMailbox(
    id: string,
    name: string,
    parentId: string | null,
    role: string | null,
  ) {
    this.mailboxes.set(id, { id, name, parentId, role });
    this.mailboxState++;
    this.mailboxLog.push({ state: this.mailboxState, kind: 'created', id });
  }

  addEmail(partial: Partial<FixtureEmail> & { subject: string }): FixtureEmail {
    const n = this.nextId++;
    const email: FixtureEmail = {
      id: `m${n}`,
      threadId: `t${n}`,
      mailboxIds: { 'mb-inbox': true },
      keywords: {},
      messageId: [`<m${n}@example.test>`],
      from: [{ name: 'Bob', email: 'bob@example.test' }],
      to: [{ email: 'alice@example.test' }],
      receivedAt: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
      text: `body ${n}`,
      size: 100 + n,
      ...partial,
    };
    this.emails.set(email.id, email);
    this.emailState++;
    this.emailLog.push({
      state: this.emailState,
      kind: 'created',
      id: email.id,
    });
    this.mailboxState++; // counts changed
    this.mailboxLog.push({
      state: this.mailboxState,
      kind: 'updated',
      id: 'mb-inbox',
    });
    return email;
  }

  touchEmail(id: string, mutate: (e: FixtureEmail) => void) {
    mutate(this.emails.get(id) as FixtureEmail);
    this.emailState++;
    this.emailLog.push({ state: this.emailState, kind: 'updated', id });
  }

  destroyEmail(id: string) {
    this.emails.delete(id);
    this.emailState++;
    this.emailLog.push({ state: this.emailState, kind: 'destroyed', id });
  }

  /** Make every earlier state unrecoverable (server pruned its change log). */
  expireEmailHistory() {
    this.emailExpiredBefore = this.emailState;
  }

  expireMailboxHistory() {
    this.mailboxExpiredBefore = this.mailboxState;
  }

  /** Push a StateChange to connected EventSource clients. */
  pushStateChange(
    types: Record<string, string> = { Email: this.emailStateString },
  ) {
    const payload = JSON.stringify({
      '@type': 'StateChange',
      changed: { [ACCOUNT_ID]: types },
    });
    for (const res of this.sse) res.write(`event: state\ndata: ${payload}\n\n`);
  }

  get sseClients(): number {
    return this.sse.size;
  }

  // ---- HTTP ----

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', this.baseUrl);
    const auth = req.headers.authorization;
    let body: any;
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      body = JSON.parse(Buffer.concat(chunks).toString());
    }
    this.requests.push({
      method: req.method ?? '',
      url: url.pathname,
      auth,
      body,
    });

    if (!auth || !this.validAuth.includes(auth)) {
      res.writeHead(401).end();
      return;
    }
    if (url.pathname === '/.well-known/jmap' && this.redirectSession) {
      res.writeHead(307, { Location: '/jmap/session' }).end();
      return;
    }
    if (
      url.pathname === '/.well-known/jmap' ||
      url.pathname === '/jmap/session'
    ) {
      return this.json(res, this.session());
    }
    if (url.pathname === '/jmap/eventsource') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(': connected\n\n');
      this.sse.add(res);
      res.on('close', () => this.sse.delete(res));
      return;
    }
    if (url.pathname === '/jmap/api' && req.method === 'POST') {
      return this.json(res, {
        methodResponses: this.dispatch(body.methodCalls),
        sessionState: 'ss1',
      });
    }
    res.writeHead(404).end();
  }

  private json(res: ServerResponse, data: unknown) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private session() {
    return {
      capabilities: {
        'urn:ietf:params:jmap:core': {},
        'urn:ietf:params:jmap:mail': {},
      },
      accounts: { [ACCOUNT_ID]: { name: 'alice@example.test' } },
      primaryAccounts: { 'urn:ietf:params:jmap:mail': ACCOUNT_ID },
      apiUrl: `${this.baseUrl}/jmap/api`,
      eventSourceUrl: `${this.baseUrl}/jmap/eventsource?types={types}&closeafter={closeafter}&ping={ping}`,
      state: 'ss1',
    };
  }

  private dispatch(calls: [string, any, string][]) {
    const out: [string, any, string][] = [];
    for (const [name, rawArgs, id] of calls) {
      try {
        const args = this.resolveRefs(rawArgs, out);
        out.push([name, this.method(name, args), id]);
      } catch (e: any) {
        out.push([
          'error',
          { type: e.jmapType ?? 'serverFail', description: e.message },
          id,
        ]);
      }
    }
    return out;
  }

  private resolveRefs(args: any, out: [string, any, string][]) {
    const resolved = { ...args };
    for (const key of Object.keys(args)) {
      if (!key.startsWith('#')) continue;
      const ref = args[key];
      const source = out.find((r) => r[2] === ref.resultOf);
      if (!source || source[0] === 'error') {
        throw Object.assign(new Error('bad reference'), {
          jmapType: 'invalidResultReference',
        });
      }
      resolved[key.slice(1)] = ref.path
        .split('/')
        .filter(Boolean)
        .reduce((v: any, k: string) => v[k], source[1]);
      delete resolved[key];
    }
    return resolved;
  }

  private method(name: string, a: any): any {
    switch (name) {
      case 'Mailbox/get': {
        const list = [...this.mailboxes.values()]
          .filter((m) => !a.ids || a.ids.includes(m.id))
          .map((m) => ({
            ...m,
            isSubscribed: true,
            totalEmails: [...this.emails.values()].filter(
              (e) => e.mailboxIds[m.id],
            ).length,
            unreadEmails: [...this.emails.values()].filter(
              (e) => e.mailboxIds[m.id] && !e.keywords.$seen,
            ).length,
            totalThreads: 0,
            unreadThreads: 0,
          }));
        return {
          accountId: a.accountId,
          state: `b${this.mailboxState}`,
          list,
          notFound: [],
        };
      }
      case 'Mailbox/changes':
        return this.changes(
          a,
          'b',
          this.mailboxState,
          this.mailboxLog,
          this.mailboxExpiredBefore,
          true,
        );
      case 'Email/changes':
        return this.changes(
          a,
          'e',
          this.emailState,
          this.emailLog,
          this.emailExpiredBefore,
          false,
        );
      case 'Mailbox/set': {
        const created: any = {};
        for (const [cid, props] of Object.entries<any>(a.create ?? {})) {
          const id = `mb-${this.nextId++}`;
          this.addMailbox(id, props.name, props.parentId ?? null, null);
          created[cid] = { id };
        }
        const notDestroyed: any = {};
        const destroyed: string[] = [];
        for (const id of a.destroy ?? []) {
          if ([...this.emails.values()].some((e) => e.mailboxIds[id])) {
            notDestroyed[id] = { type: 'mailboxHasEmail' };
          } else {
            this.mailboxes.delete(id);
            this.mailboxState++;
            this.mailboxLog.push({
              state: this.mailboxState,
              kind: 'destroyed',
              id,
            });
            destroyed.push(id);
          }
        }
        return { accountId: a.accountId, created, destroyed, notDestroyed };
      }
      case 'Email/query': {
        const ids = [...this.emails.values()]
          .filter((e) => this.matches(e, a.filter))
          .sort((x, y) => x.receivedAt.localeCompare(y.receivedAt));
        const asc = a.sort?.[0]?.isAscending ?? true;
        if (!asc) ids.reverse();
        let start = a.position ?? 0;
        if (a.anchor) {
          const at = ids.findIndex((e) => e.id === a.anchor);
          if (at === -1)
            throw Object.assign(new Error('anchor'), {
              jmapType: 'anchorNotFound',
            });
          start = at + (a.anchorOffset ?? 0);
        }
        const page = ids.slice(start, a.limit ? start + a.limit : undefined);
        return {
          accountId: a.accountId,
          queryState: 'q',
          canCalculateChanges: false,
          position: start,
          ids: page.map((e) => e.id),
        };
      }
      case 'Email/get': {
        const wanted: string[] = a.ids ?? [...this.emails.keys()];
        const list: any[] = [];
        const notFound: string[] = [];
        for (const id of wanted) {
          const e = this.emails.get(id);
          if (!e) notFound.push(id);
          else list.push(this.project(e, a));
        }
        return {
          accountId: a.accountId,
          state: this.emailStateString,
          list,
          notFound,
        };
      }
      case 'Email/set': {
        const updated: any = {};
        const notUpdated: any = {};
        for (const [id, patch] of Object.entries<any>(a.update ?? {})) {
          if (!this.emails.has(id)) {
            notUpdated[id] = { type: 'notFound' };
            continue;
          }
          this.touchEmail(id, (e) => {
            for (const [path, value] of Object.entries<any>(patch)) {
              if (path === 'mailboxIds') e.mailboxIds = value;
              else if (path.startsWith('mailboxIds/'))
                e.mailboxIds[path.slice(11)] = value;
              else if (path.startsWith('keywords/')) {
                if (value === null) delete e.keywords[path.slice(9)];
                else e.keywords[path.slice(9)] = value;
              }
            }
          });
          updated[id] = null;
        }
        const destroyed: string[] = [];
        const notDestroyed: any = {};
        for (const id of a.destroy ?? []) {
          if (!this.emails.has(id)) {
            notDestroyed[id] = { type: 'notFound' };
            continue;
          }
          this.destroyEmail(id);
          destroyed.push(id);
        }
        return {
          accountId: a.accountId,
          newState: this.emailStateString,
          updated,
          notUpdated,
          destroyed,
          notDestroyed,
        };
      }
      case 'Thread/get': {
        const list: any[] = [];
        const notFound: string[] = [];
        for (const id of a.ids) {
          const members = [...this.emails.values()]
            .filter((e) => e.threadId === id)
            .sort((x, y) => x.receivedAt.localeCompare(y.receivedAt));
          if (members.length === 0) notFound.push(id);
          else list.push({ id, emailIds: members.map((m) => m.id) });
        }
        return {
          accountId: a.accountId,
          state: `th${this.emailState}`,
          list,
          notFound,
        };
      }
      default:
        throw Object.assign(new Error(name), { jmapType: 'unknownMethod' });
    }
  }

  private changes(
    a: any,
    prefix: string,
    current: number,
    log: Change[],
    expiredBefore: number,
    mailbox: boolean,
  ) {
    const since = Number(String(a.sinceState).slice(1));
    if (
      !String(a.sinceState).startsWith(prefix) ||
      Number.isNaN(since) ||
      since < expiredBefore
    ) {
      throw Object.assign(new Error('expired'), {
        jmapType: 'cannotCalculateChanges',
      });
    }
    const pending = log.filter((c) => c.state > since);
    const max = a.maxChanges ?? Infinity;
    const ids = new Map<string, Change['kind']>();
    let newState = since;
    let more = false;
    const states = [...new Set(pending.map((c) => c.state))];
    for (const st of states) {
      const batch = pending.filter((c) => c.state === st);
      if (ids.size + batch.length > max && ids.size > 0) {
        more = true;
        break;
      }
      for (const c of batch) {
        const prev = ids.get(c.id);
        if (c.kind === 'destroyed')
          ids.set(
            c.id,
            prev === 'created' ? ('destroyed-new' as any) : 'destroyed',
          );
        else if (c.kind === 'created') ids.set(c.id, 'created');
        else ids.set(c.id, prev ?? 'updated');
      }
      newState = st;
    }
    if (!more) newState = current;
    const out: any = {
      accountId: a.accountId,
      oldState: a.sinceState,
      newState: `${prefix}${newState}`,
      hasMoreChanges: more,
      created: [],
      updated: [],
      destroyed: [],
    };
    for (const [id, kind] of ids) {
      if (kind === 'created') out.created.push(id);
      else if (kind === 'updated') out.updated.push(id);
      else if (kind === 'destroyed') out.destroyed.push(id);
    }
    if (mailbox)
      out.updatedProperties =
        ids.size && [...ids.values()].every((k) => k === 'updated')
          ? ['totalEmails', 'unreadEmails']
          : null;
    return out;
  }

  private matches(e: FixtureEmail, f: any): boolean {
    if (!f) return true;
    if (f.operator === 'AND')
      return f.conditions.every((c: any) => this.matches(e, c));
    if (f.inMailbox && !e.mailboxIds[f.inMailbox]) return false;
    if (f.after && !(e.receivedAt >= f.after)) return false;
    if (f.before && !(e.receivedAt < f.before)) return false;
    if (f.notKeyword && e.keywords[f.notKeyword]) return false;
    if (f.hasKeyword && !e.keywords[f.hasKeyword]) return false;
    if (f.subject && !e.subject.toLowerCase().includes(f.subject.toLowerCase()))
      return false;
    if (f.from && !e.from.some((x) => x.email.includes(f.from))) return false;
    if (
      f.text &&
      !`${e.subject} ${e.text}`.toLowerCase().includes(f.text.toLowerCase())
    )
      return false;
    return true;
  }

  private project(e: FixtureEmail, a: any) {
    const props: string[] = a.properties ?? [];
    const full: any = {
      id: e.id,
      threadId: e.threadId,
      mailboxIds: e.mailboxIds,
      keywords: e.keywords,
      messageId: e.messageId,
      inReplyTo: e.inReplyTo ?? null,
      references: null,
      from: e.from,
      to: e.to,
      cc: null,
      bcc: null,
      replyTo: null,
      subject: e.subject,
      receivedAt: e.receivedAt,
      sentAt: e.receivedAt,
      size: e.size,
      hasAttachment: false,
      textBody: [
        {
          partId: '1',
          blobId: 'b1',
          size: e.text.length,
          type: 'text/plain',
          name: null,
          disposition: null,
          cid: null,
        },
      ],
      htmlBody: e.html
        ? [
            {
              partId: '2',
              blobId: 'b2',
              size: e.html.length,
              type: 'text/html',
              name: null,
              disposition: null,
              cid: null,
            },
          ]
        : [
            {
              partId: '1',
              blobId: 'b1',
              size: e.text.length,
              type: 'text/plain',
              name: null,
              disposition: null,
              cid: null,
            },
          ],
      attachments: [],
      bodyValues: {
        '1': { value: e.text },
        ...(e.html ? { '2': { value: e.html } } : {}),
      },
    };
    const out: any = {};
    for (const p of props) out[p] = full[p];
    return out;
  }
}
