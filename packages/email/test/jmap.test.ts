import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEmailClient, JMAPAdapter } from '../src/index';
import {
  AuthenticationError,
  FolderNotFoundError,
  MessageNotFoundError,
} from '../src/shared/errors';
import type { ChangeFeedBatch } from '../src/shared/types';
import { JMAPFixture } from './helpers/jmap-fixture';

let fx: JMAPFixture;

beforeEach(async () => {
  fx = new JMAPFixture();
  await fx.start();
});
afterEach(async () => {
  await fx.stop();
});

const basic = { user: 'alice', pass: 'secret' };

function adapter(overrides: Record<string, unknown> = {}) {
  return new JMAPAdapter({
    type: 'jmap',
    url: fx.baseUrl,
    auth: basic,
    ...overrides,
  });
}

function batch(result: unknown): ChangeFeedBatch {
  const r = result as ChangeFeedBatch;
  expect(r.status).toBe('ok');
  return r;
}

describe('JMAP session and auth', () => {
  it('discovers the session at /.well-known/jmap and follows the redirect', async () => {
    const client = adapter();
    await client.connect();
    expect(client.isConnected()).toBe(true);
    expect(fx.requests.map((r) => r.url)).toEqual([
      '/.well-known/jmap',
      '/jmap/session',
    ]);
    // Authorization survives the same-origin redirect.
    expect(fx.requests[1].auth).toMatch(/^Basic /);
  });

  it('supports bearer tokens and the factory', async () => {
    const client = await getEmailClient({
      type: 'jmap',
      url: fx.baseUrl,
      auth: { type: 'bearer', token: 'tok' },
    });
    await client.connect();
    expect(client.getAdapter()).toBe('jmap');
    expect(fx.requests.at(-1)?.auth).toBe('Bearer tok');
  });

  it('maps rejected credentials to AuthenticationError', async () => {
    await expect(
      adapter({ auth: { user: 'alice', pass: 'wrong' } }).connect(),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('advertises change feed, push and threads', async () => {
    const caps = await adapter().getCapabilities();
    expect(caps).toMatchObject({
      changeFeed: true,
      push: true,
      threads: true,
      send: true,
    });
  });
});

describe('JMAP folders and messages', () => {
  it('lists mailboxes with roles and hierarchical paths', async () => {
    const folders = await adapter().listFolders();
    const byPath = Object.fromEntries(folders.map((f) => [f.path, f]));
    expect(byPath.Inbox.specialUse).toBe('\\Inbox');
    expect(byPath['Projects/X'].name).toBe('X');
    expect(byPath['Projects/X'].delimiter).toBe('/');
  });

  it('fetches newest first with bodies, flags and folders', async () => {
    fx.addEmail({ subject: 'one', keywords: { $seen: true } });
    fx.addEmail({ subject: 'two', html: '<p>two</p>' });
    const messages = await adapter().fetch({ folder: 'INBOX' });
    expect(messages.map((m) => m.subject)).toEqual(['two', 'one']);
    expect(messages[0]).toMatchObject({
      html: '<p>two</p>',
      text: 'body 2',
      folder: 'Inbox',
      from: { name: 'Bob', address: 'bob@example.test' },
    });
    expect(messages[1].flags).toEqual(['\\Seen']);
    expect(messages[1].html).toBeUndefined();
  });

  it('filters unread messages and rejects unknown folders', async () => {
    fx.addEmail({ subject: 'read', keywords: { $seen: true } });
    fx.addEmail({ subject: 'unread' });
    const client = adapter();
    expect(
      (await client.fetch({ unreadOnly: true })).map((m) => m.subject),
    ).toEqual(['unread']);
    await expect(client.fetch({ folder: 'Nope' })).rejects.toBeInstanceOf(
      FolderNotFoundError,
    );
  });

  it('getMessage throws MessageNotFoundError for an unknown id', async () => {
    await expect(adapter().getMessage('nope')).rejects.toBeInstanceOf(
      MessageNotFoundError,
    );
  });

  it('marks read/unread, moves, copies and deletes', async () => {
    const { id } = fx.addEmail({ subject: 'x' });
    const client = adapter();
    await client.markRead(id);
    expect(fx.emails.get(id)?.keywords.$seen).toBe(true);
    await client.markUnread([id]);
    expect(fx.emails.get(id)?.keywords.$seen).toBeUndefined();
    await client.copy(id, 'Archive');
    expect(fx.emails.get(id)?.mailboxIds).toEqual({
      'mb-inbox': true,
      'mb-archive': true,
    });
    await client.move(id, 'Projects/X');
    expect(fx.emails.get(id)?.mailboxIds).toEqual({ 'mb-proj-x': true });
    await client.delete(id);
    expect(fx.emails.has(id)).toBe(false);
    await expect(client.markRead('gone')).rejects.toBeInstanceOf(
      MessageNotFoundError,
    );
  });

  it('searches server-side', async () => {
    fx.addEmail({ subject: 'invoice march' });
    fx.addEmail({ subject: 'lunch', keywords: { $flagged: true } });
    const client = adapter();
    expect((await client.search({ subject: 'invoice' })).length).toBe(1);
    const flagged = await client.search({ flagged: true, subject: 'lunch' });
    expect(flagged.map((m) => m.subject)).toEqual(['lunch']);
  });

  it('creates and deletes nested folders', async () => {
    const client = adapter();
    await client.createFolder('Projects/Y/Z');
    const paths = (await client.listFolders()).map((f) => f.path);
    expect(paths).toContain('Projects/Y/Z');
    await client.deleteFolder('Projects/Y/Z');
    expect((await client.listFolders()).map((f) => f.path)).not.toContain(
      'Projects/Y/Z',
    );
  });
});

describe('JMAP change feed', () => {
  it('pages the initial pass, then reports incremental changes', async () => {
    for (let i = 0; i < 5; i++) fx.addEmail({ subject: `m${i}` });
    const client = adapter();

    const p1 = batch(await client.getChanges({ limit: 2 }));
    expect(p1).toMatchObject({ hasMore: true, initial: true });
    expect(p1.added.map((m) => m.subject)).toEqual(['m0', 'm1']);
    expect(p1.folders?.map((f) => f.path)).toContain('Inbox');

    const p2 = batch(await client.getChanges({ cursor: p1.cursor, limit: 2 }));
    expect(p2.added.map((m) => m.subject)).toEqual(['m2', 'm3']);
    expect(p2.folders).toBeUndefined();

    const p3 = batch(await client.getChanges({ cursor: p2.cursor, limit: 2 }));
    expect(p3.added.map((m) => m.subject)).toEqual(['m4']);
    expect(p3.hasMore).toBe(false);

    // Nothing new.
    const idle = batch(await client.getChanges({ cursor: p3.cursor }));
    expect(idle).toMatchObject({
      added: [],
      changed: [],
      removed: [],
      initial: false,
    });

    // New mail, a flag change, a move and a deletion.
    const added = fx.addEmail({ subject: 'late' });
    fx.touchEmail(p1.added[0].id as string, (e) => {
      e.keywords.$seen = true;
    });
    fx.touchEmail(p1.added[1].id as string, (e) => {
      e.mailboxIds = { 'mb-archive': true };
    });
    fx.destroyEmail(p2.added[0].id as string);

    const inc = batch(await client.getChanges({ cursor: idle.cursor }));
    expect(inc.added.map((m) => m.id)).toEqual([added.id]);
    expect(inc.changed.map((m) => [m.subject, m.flags, m.folder])).toEqual([
      ['m0', ['\\Seen'], 'Inbox'],
      ['m1', [], 'Archive'],
    ]);
    expect(inc.removed).toEqual([p2.added[0].id]);
    expect(inc.hasMore).toBe(false);
  });

  it('survives a restart: a persisted cursor works on a new adapter instance', async () => {
    fx.addEmail({ subject: 'a' });
    const first = batch(await adapter().getChanges());
    fx.addEmail({ subject: 'b' });
    const resumed = batch(await adapter().getChanges({ cursor: first.cursor }));
    expect(resumed.added.map((m) => m.subject)).toEqual(['b']);
  });

  it('pages incremental changes with hasMore', async () => {
    const start = batch(await adapter().getChanges());
    for (let i = 0; i < 3; i++) fx.addEmail({ subject: `n${i}` });
    const client = adapter();
    const a = batch(
      await client.getChanges({ cursor: start.cursor, limit: 2 }),
    );
    expect(a.hasMore).toBe(true);
    const b = batch(await client.getChanges({ cursor: a.cursor, limit: 2 }));
    expect(b.hasMore).toBe(false);
    expect([...a.added, ...b.added].map((m) => m.subject).sort()).toEqual([
      'n0',
      'n1',
      'n2',
    ]);
  });

  it('reports folder structure changes and omits count-only changes', async () => {
    const client = adapter();
    const start = batch(await client.getChanges());
    fx.addEmail({ subject: 'count only' });
    const counts = batch(await client.getChanges({ cursor: start.cursor }));
    expect(counts.folders).toBeUndefined();

    fx.addMailbox('mb-new', 'Receipts', null, null);
    const structural = batch(
      await client.getChanges({ cursor: counts.cursor }),
    );
    expect(structural.folders?.map((f) => f.path)).toContain('Receipts');
  });

  it('returns resync-required, not an error, on cannotCalculateChanges', async () => {
    const client = adapter();
    const start = batch(await client.getChanges());
    fx.addEmail({ subject: 'x' });
    fx.expireEmailHistory();
    expect(await client.getChanges({ cursor: start.cursor })).toMatchObject({
      status: 'resync-required',
      reason: 'cursor-expired',
    });

    const mbStart = batch(await client.getChanges());
    fx.addMailbox('mb-z', 'Z', null, null);
    fx.expireMailboxHistory();
    expect(await client.getChanges({ cursor: mbStart.cursor })).toMatchObject({
      status: 'resync-required',
      reason: 'cursor-expired',
    });
  });

  it('returns resync-required for garbage or foreign cursors', async () => {
    const client = adapter();
    expect(await client.getChanges({ cursor: 'not-a-cursor' })).toMatchObject({
      status: 'resync-required',
      reason: 'cursor-invalid',
    });
    const other = Buffer.from(
      JSON.stringify({ v: 1, a: 'other', e: 'e1', m: 'b1' }),
    ).toString('base64url');
    expect(await client.getChanges({ cursor: other })).toMatchObject({
      status: 'resync-required',
      reason: 'account-mismatch',
    });
  });

  it('asks for a restart when the initial-pass anchor disappears', async () => {
    for (let i = 0; i < 3; i++) fx.addEmail({ subject: `m${i}` });
    const client = adapter();
    const p1 = batch(await client.getChanges({ limit: 2 }));
    fx.destroyEmail(p1.added[1].id as string);
    expect(
      await client.getChanges({ cursor: p1.cursor, limit: 2 }),
    ).toMatchObject({ status: 'resync-required' });
  });

  it('does not miss mail that arrives during the initial pass', async () => {
    for (let i = 0; i < 3; i++) fx.addEmail({ subject: `m${i}` });
    const client = adapter();
    const p1 = batch(await client.getChanges({ limit: 2 }));
    fx.addEmail({ subject: 'during' });
    const p2 = batch(await client.getChanges({ cursor: p1.cursor, limit: 2 }));
    const seen = new Set([...p1.added, ...p2.added].map((m) => m.subject));
    const tail = batch(await client.getChanges({ cursor: p2.cursor }));
    for (const m of tail.added) seen.add(m.subject);
    expect([...seen].sort()).toEqual(['during', 'm0', 'm1', 'm2']);
  });

  it('includes bodies only when asked', async () => {
    fx.addEmail({ subject: 'a' });
    const lean = batch(await adapter().getChanges());
    expect(lean.added[0].text).toBeUndefined();
    const full = batch(await adapter().getChanges({ includeBodies: true }));
    expect(full.added[0].text).toBe('body 1');
  });
});

describe('JMAP push', () => {
  it('emits hints from the EventSource StateChange stream and stops on unsubscribe', async () => {
    const client = adapter();
    const hints: unknown[] = [];
    const stop = await client.subscribeChanges?.((h) => hints.push(h));
    await viWaitFor(() => fx.sseClients === 1);
    fx.pushStateChange({ Email: 'e9', Mailbox: 'b9' });
    await viWaitFor(() => hints.length === 1);
    expect(hints[0]).toEqual({ types: ['Email', 'Mailbox'] });
    stop?.();
    await viWaitFor(() => fx.sseClients === 0);
    await client.disconnect();
  });

  it('reports auth failures through onError and does not retry', async () => {
    const client = adapter();
    await client.connect();
    fx.validAuth = [];
    const errors: Error[] = [];
    await client.subscribeChanges?.(() => {}, {
      onError: (e) => errors.push(e),
    });
    await viWaitFor(() => errors.length === 1);
    expect(errors[0]).toBeInstanceOf(AuthenticationError);
    await client.disconnect();
  });
});

async function viWaitFor(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('JMAP threads', () => {
  it('getThread returns the whole conversation oldest first', async () => {
    const root = fx.addEmail({ subject: 'topic', threadId: 'tx' });
    fx.addEmail({ subject: 'unrelated' });
    const reply = fx.addEmail({
      subject: 'Re: topic',
      threadId: 'tx',
      inReplyTo: root.messageId,
    });
    const client = adapter();
    const thread = await client.getThread('tx');
    expect(thread.map((m) => m.id)).toEqual([root.id, reply.id]);
    expect(thread.every((m) => m.threadId === 'tx')).toBe(true);
    expect(thread[1].inReplyTo).toBe(root.messageId[0]);
    expect(thread[0].text).toBe('body 1');
  });

  it('getThread throws MessageNotFoundError for an unknown thread', async () => {
    await expect(adapter().getThread('missing')).rejects.toBeInstanceOf(
      MessageNotFoundError,
    );
  });
});

describe('JMAP origin and transport safety', () => {
  let other: JMAPFixture;
  beforeEach(async () => {
    other = new JMAPFixture();
    await other.start();
  });
  afterEach(async () => {
    await other.stop();
  });

  it('refuses an apiUrl on another origin and sends it nothing', async () => {
    fx.apiUrlOverride = `${other.baseUrl}/jmap/api`;
    await expect(adapter().connect()).rejects.toMatchObject({
      code: 'UNTRUSTED_ORIGIN',
    });
    expect(other.requests).toEqual([]);
  });

  it('refuses an eventSourceUrl on another origin', async () => {
    fx.eventSourceUrlOverride = `${other.baseUrl}/jmap/eventsource`;
    await expect(adapter().connect()).rejects.toMatchObject({
      code: 'UNTRUSTED_ORIGIN',
    });
    expect(other.requests).toEqual([]);
  });

  it('accepts another origin only through allowedOrigins', async () => {
    fx.apiUrlOverride = `${other.baseUrl}/jmap/api`;
    await adapter({ allowedOrigins: [other.baseUrl] }).connect();
  });

  it('strips Authorization on a cross-origin discovery redirect', async () => {
    fx.redirectTo = `${other.baseUrl}/jmap/session`;
    await expect(adapter().connect()).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    expect(other.requests).toHaveLength(1);
    expect(other.requests[0].auth).toBeUndefined();
  });

  it('refuses plain http to a non-loopback host before sending anything', async () => {
    const calls: string[] = [];
    const client = new JMAPAdapter({
      type: 'jmap',
      url: 'http://mail.example.test',
      auth: basic,
      fetch: (async (u: string) => {
        calls.push(u);
        return new Response('{}');
      }) as unknown as typeof fetch,
    });
    await expect(client.connect()).rejects.toMatchObject({
      code: 'INSECURE_URL',
    });
    expect(calls).toEqual([]);
  });
});

describe('JMAP feed robustness', () => {
  it('finishes the initial pass when the server caps the page size', async () => {
    for (let i = 0; i < 120; i++) fx.addEmail({ subject: `m${i}` });
    fx.maxQueryPage = 50;
    const client = adapter();
    const subjects: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = batch(await client.getChanges({ cursor, limit: 200 }));
      subjects.push(...page.added.map((m) => m.subject));
      cursor = page.cursor;
      pages++;
      if (!page.hasMore) break;
      expect(pages).toBeLessThan(10);
    }
    expect(pages).toBe(3);
    expect(new Set(subjects).size).toBe(120);
  });

  it('returns resync-required when Mailbox/changes never converges', async () => {
    const client = adapter();
    const start = batch(await client.getChanges());
    fx.addEmail({ subject: 'x' });
    fx.mailboxChangesNeverEnd = true;
    expect(await client.getChanges({ cursor: start.cursor })).toMatchObject({
      status: 'resync-required',
    });
  });
});

describe('JMAP bodies and object limits', () => {
  it('keeps plain-text sections around an HTML body', async () => {
    const m = fx.addEmail({ subject: 'mixed', html: '<p>main</p>' });
    fx.wrap.set(m.id, ['header <b>', 'footer & more']);
    const got = await adapter().getMessage(m.id);
    expect(got.html).toBe(
      '<div style="white-space:pre-wrap">header &lt;b&gt;</div>\n<p>main</p>\n<div style="white-space:pre-wrap">footer &amp; more</div>',
    );
    expect(got.text).toBe('body 1');
  });

  it('fetches long threads in chunks of the server maxObjectsInGet', async () => {
    fx.maxObjectsInGet = 2;
    for (let i = 0; i < 5; i++)
      fx.addEmail({ subject: `r${i}`, threadId: 'long' });
    const thread = await adapter().getThread('long');
    expect(thread.map((m) => m.subject)).toEqual([
      'r0',
      'r1',
      'r2',
      'r3',
      'r4',
    ]);
  });

  it('clamps the feed page size to maxObjectsInGet', async () => {
    fx.maxObjectsInGet = 2;
    for (let i = 0; i < 5; i++) fx.addEmail({ subject: `f${i}` });
    const client = adapter();
    const first = batch(await client.getChanges({ limit: 100 }));
    expect(first.added).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    fx.addEmail({ subject: 'new1' });
    fx.addEmail({ subject: 'new2' });
    fx.addEmail({ subject: 'new3' });
    const start = batch(await adapter().getChanges({ limit: 100 }));
    expect(start.hasMore).toBe(true);
  });
});

describe('JMAP triage write-back', () => {
  async function connected() {
    const client = adapter();
    await client.connect();
    return client;
  }

  it('advertises write-back capabilities', async () => {
    const caps = await adapter().getCapabilities();
    expect(caps.writeBack).toMatchObject({
      flags: true,
      keywords: true,
      labels: true,
      archive: true,
      spam: true,
      drafts: true,
    });
  });

  it('sets and clears flags and keywords idempotently, returning server state', async () => {
    const m = fx.addEmail({ subject: 'triage' });
    const client = await connected();
    const first = await client.updateFlags(m.id, {
      add: ['\\Seen', '\\Flagged', '$Phishing'],
    });
    expect(first.updated).toEqual([m.id]);
    expect(first.failed).toEqual([]);
    expect(first.state).toBe(fx.emailStateString);
    expect(first.oldState).toBeDefined();
    expect(fx.emails.get(m.id)?.keywords).toEqual({
      $seen: true,
      $flagged: true,
      $phishing: true,
    });
    // Replaying the same call succeeds and changes nothing.
    const again = await client.updateFlags([m.id], {
      add: ['\\Seen', '\\Flagged', '$Phishing'],
    });
    expect(again.updated).toEqual([m.id]);
    await client.updateFlags(m.id, { remove: ['\\Flagged', '$phishing'] });
    expect(fx.emails.get(m.id)?.keywords).toEqual({ $seen: true });
  });

  it('reports per-message failures without throwing', async () => {
    const m = fx.addEmail({ subject: 'a' });
    const client = await connected();
    const res = await client.updateFlags([m.id, 'ghost'], {
      add: ['\\Flagged'],
    });
    expect(res.updated).toEqual([m.id]);
    expect(res.failed).toEqual([
      { id: 'ghost', code: 'notFound', message: undefined },
    ]);
  });

  it('rejects flags JMAP cannot set and contradictory changes', async () => {
    const m = fx.addEmail({ subject: 'a' });
    const client = await connected();
    for (const bad of [
      '\\Draft',
      '\\Deleted',
      '$draft',
      'has space',
      '\\Weird',
    ]) {
      await expect(
        client.updateFlags(m.id, { add: [bad] }),
      ).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    }
    await expect(
      client.updateFlags(m.id, { add: ['\\Seen'], remove: ['$seen'] }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(
      fx.requests.filter((r) => r.body?.methodCalls?.[0]?.[0] === 'Email/set'),
    ).toEqual([]);
  });

  it('honours ifInState', async () => {
    const m = fx.addEmail({ subject: 'a' });
    const client = await connected();
    await expect(
      client.updateFlags(m.id, { add: ['\\Seen'] }, { ifInState: 'stale' }),
    ).rejects.toMatchObject({ code: 'JMAP_STATEMISMATCH' });
    expect(fx.emails.get(m.id)?.keywords).toEqual({});
  });

  it('adds and removes labels by name, path or role', async () => {
    const m = fx.addEmail({ subject: 'a' });
    const client = await connected();
    const res = await client.updateLabels(m.id, {
      add: ['Projects/X', '\\Archive'],
      remove: ['INBOX'],
    });
    expect(res.updated).toEqual([m.id]);
    expect(fx.emails.get(m.id)?.mailboxIds).toEqual({
      'mb-proj-x': true,
      'mb-archive': true,
    });
    await expect(
      client.updateLabels(m.id, { add: ['Nope'] }),
    ).rejects.toBeInstanceOf(FolderNotFoundError);
    // Removing the last mailbox is a per-message failure, not a throw.
    const last = await client.updateLabels(m.id, {
      remove: ['Projects/X', 'Archive'],
    });
    expect(last.failed[0]).toMatchObject({
      id: m.id,
      code: 'invalidProperties',
    });
  });

  it('archives (inbox -> Archive, keeping other labels) idempotently', async () => {
    const m = fx.addEmail({
      subject: 'a',
      mailboxIds: { 'mb-inbox': true, 'mb-proj': true },
    });
    const client = await connected();
    await client.archive(m.id);
    await client.archive(m.id);
    expect(fx.emails.get(m.id)?.mailboxIds).toEqual({
      'mb-proj': true,
      'mb-archive': true,
    });
  });

  it('marks spam and not-spam with $junk/$notjunk', async () => {
    const m = fx.addEmail({ subject: 'a' });
    const client = await connected();
    await client.markSpam(m.id);
    expect(fx.emails.get(m.id)).toMatchObject({
      mailboxIds: { 'mb-junk': true },
      keywords: { $junk: true },
    });
    await client.markSpam(m.id, false);
    expect(fx.emails.get(m.id)).toMatchObject({
      mailboxIds: { 'mb-inbox': true },
      keywords: { $notjunk: true },
    });
    expect(fx.emails.get(m.id)?.keywords.$junk).toBeUndefined();
  });

  it('write-back is visible to the change feed as a change', async () => {
    const m = fx.addEmail({ subject: 'a' });
    const client = await connected();
    const first = batch(await client.getChanges());
    await client.updateFlags(m.id, { add: ['\\Flagged'] });
    const next = batch(await client.getChanges({ cursor: first.cursor }));
    expect(next.changed.map((e) => e.id)).toEqual([m.id]);
    expect(next.changed[0].flags).toContain('\\Flagged');
  });

  it('creates, updates and deletes drafts without touching non-drafts', async () => {
    const plain = fx.addEmail({ subject: 'received' });
    const client = await connected();
    const draft = await client.createDraft({
      from: { address: 'alice@example.test' },
      to: [{ address: 'bob@example.test' }],
      subject: 'hello',
      text: 'v1',
    });
    const stored = fx.emails.get(draft.id);
    expect(stored?.mailboxIds).toEqual({ 'mb-drafts': true });
    expect(stored?.keywords).toMatchObject({ $draft: true });
    expect(draft.messageId).toMatch(/@example\.test$/);

    const v2 = await client.updateDraft(draft.id, {
      from: { address: 'alice@example.test' },
      to: [{ address: 'bob@example.test' }],
      subject: 'hello',
      text: 'v2',
    });
    expect(v2.id).not.toBe(draft.id);
    expect(fx.emails.has(draft.id)).toBe(false);
    expect(fx.emails.get(v2.id)?.text).toBe('v2');

    await expect(
      client.updateDraft(plain.id, {
        from: { address: 'a@example.test' },
        to: [],
        subject: 'x',
        text: 'x',
      }),
    ).rejects.toMatchObject({ code: 'NOT_A_DRAFT' });
    await expect(client.deleteDraft(plain.id)).rejects.toMatchObject({
      code: 'NOT_A_DRAFT',
    });
    expect(fx.emails.has(plain.id)).toBe(true);

    const del = await client.deleteDraft(v2.id);
    expect(del.updated).toEqual([v2.id]);
    // Replay of a delete is a success.
    expect((await client.deleteDraft(v2.id)).updated).toEqual([v2.id]);
  });

  it('escapes JSON Pointer tokens in custom keyword patch paths', async () => {
    const m = fx.addEmail({ subject: 'kw' });
    const client = await connected();
    const res = await client.updateFlags(m.id, {
      add: ['project/urgent', 'x~1y'],
    });
    expect(res.failed).toEqual([]);
    expect(fx.emails.get(m.id)?.keywords).toMatchObject({
      'project/urgent': true,
      'x~1y': true,
    });
    expect(fx.emails.get(m.id)?.keywords['x/y']).toBeUndefined();
    await client.updateFlags(m.id, { remove: ['project/urgent', 'x~1y'] });
    expect(fx.emails.get(m.id)?.keywords['project/urgent']).toBeUndefined();
    expect(fx.emails.get(m.id)?.keywords['x~1y']).toBeUndefined();
  });

  it('never destroys a draft that was submitted concurrently', async () => {
    const client = await connected();
    const msg = {
      from: { address: 'alice@example.test' },
      to: [{ address: 'bob@example.test' }],
      subject: 'race',
      text: 'v1',
    };
    const submitConcurrently = (id: string) => () =>
      fx.touchEmail(id, (e) => {
        delete e.keywords.$draft;
        e.mailboxIds = { 'mb-sent': true };
      });

    // deleteDraft: submission lands between the draft check and the destroy.
    const d1 = await client.createDraft(msg);
    fx.beforeEmailSet = [submitConcurrently(d1.id)];
    await expect(client.deleteDraft(d1.id)).rejects.toMatchObject({
      code: 'NOT_A_DRAFT',
    });
    expect(fx.emails.has(d1.id)).toBe(true);

    // updateDraft: submission lands before the replacement is created.
    const d2 = await client.createDraft(msg);
    const before = fx.emails.size;
    fx.beforeEmailSet = [submitConcurrently(d2.id)];
    await expect(client.updateDraft(d2.id, msg)).rejects.toMatchObject({
      code: 'JMAP_STATEMISMATCH',
    });
    expect(fx.emails.has(d2.id)).toBe(true);
    expect(fx.emails.size).toBe(before);

    // updateDraft: submission lands after the replacement exists (destroy
    // phase): the sent original survives and the replacement is dropped.
    const d3 = await client.createDraft(msg);
    const base = fx.emails.size;
    fx.beforeEmailSet = [() => undefined, submitConcurrently(d3.id)];
    await expect(client.updateDraft(d3.id, msg)).rejects.toMatchObject({
      code: 'NOT_A_DRAFT',
    });
    expect(fx.emails.has(d3.id)).toBe(true);
    expect(fx.emails.size).toBe(base);
  });

  it('retries a draft destroy once when unrelated mail changes the state', async () => {
    const client = await connected();
    const d = await client.createDraft({
      from: { address: 'alice@example.test' },
      to: [{ address: 'bob@example.test' }],
      subject: 'unrelated',
      text: 'v1',
    });
    fx.beforeEmailSet = [
      () => {
        fx.addEmail({ subject: 'delivered meanwhile' });
      },
    ];
    const res = await client.deleteDraft(d.id);
    expect(res.updated).toEqual([d.id]);
    expect(fx.emails.has(d.id)).toBe(false);
  });

  it('refuses inline attachment content and bad headers', async () => {
    const client = await connected();
    const base = {
      from: { address: 'alice@example.test' },
      to: [{ address: 'bob@example.test' }],
      subject: 's',
      text: 't',
    };
    await expect(
      client.createDraft({
        ...base,
        attachments: [
          { contentType: 'text/plain', size: 1, content: Buffer.from('x') },
        ],
      }),
    ).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    expect([...fx.emails.values()]).toHaveLength(0);
  });
});

describe('JMAP submission', () => {
  const message = {
    from: { name: 'Alice', address: 'alice@example.test' },
    to: [{ address: 'bob@example.test' }],
    cc: [{ address: 'carol@example.test' }],
    subject: 'Hi',
    text: 'plain',
    html: '<p>html</p>',
  };

  async function connected() {
    const client = adapter();
    await client.connect();
    return client;
  }
  const writes = () =>
    fx.requests.filter((r) =>
      r.body?.methodCalls?.some(([n]: [string]) =>
        ['Email/set', 'EmailSubmission/set'].includes(n),
      ),
    );

  it('reports send support from the session and lists identities', async () => {
    const client = await connected();
    expect((await client.getCapabilities()).send).toBe(true);
    expect((await client.getCapabilities()).writeBack?.submission).toBe(true);
    expect((await client.listIdentities()).map((i) => i.email)).toEqual([
      'alice@example.test',
      'team@example.test',
      '*@alias.test',
    ]);
    fx.submission = false;
    const bare = adapter();
    expect((await bare.getCapabilities()).send).toBe(false);
    await expect(bare.send(message)).rejects.toMatchObject({
      code: 'NOT_SUPPORTED',
    });
  });

  it('submits as the matching identity and files the copy in Sent', async () => {
    const client = await connected();
    const result = await client.send(message, {
      messageId: '<fixed@example.test>',
    });
    expect(result).toMatchObject({
      messageId: 'fixed@example.test',
      accepted: ['bob@example.test', 'carol@example.test'],
      rejected: [],
      identityId: 'id-alice',
      response: 'jmap:pending',
    });
    expect(result.submissionId).toBeDefined();
    expect(fx.submissions).toHaveLength(1);
    const stored = fx.emails.get(result.id as string);
    expect(stored?.mailboxIds).toEqual({ 'mb-sent': true });
    expect(stored?.keywords.$draft).toBeUndefined();
    expect(stored?.text).toBe('plain');
    expect(stored?.html).toBe('<p>html</p>');
    // Submission went to the same trusted API endpoint with the same credentials.
    const last = fx.requests.at(-1);
    expect(last?.url).toBe('/jmap/api');
    expect(last?.auth).toMatch(/^Basic /);
    expect(last?.body.using).toContain('urn:ietf:params:jmap:submission');
  });

  it('can skip the sent copy', async () => {
    const client = await connected();
    const result = await client.send(message, { saveToSent: false });
    expect(fx.emails.has(result.id as string)).toBe(false);
    expect(fx.submissions).toHaveLength(1);
  });

  it('matches wildcard identities by domain, not by suffix trick', async () => {
    const client = await connected();
    const ok = await client.send({
      ...message,
      from: { address: 'anyone@alias.test' },
    });
    expect(ok.identityId).toBe('id-wild');
    await expect(
      client.send({ ...message, from: { address: 'x@evilalias.test' } }),
    ).rejects.toMatchObject({ code: 'FROM_NOT_OWNED' });
  });

  it('refuses a From address the account does not own, before creating anything', async () => {
    const client = await connected();
    const before = writes().length;
    await expect(
      client.send({ ...message, from: { address: 'ceo@victim.test' } }),
    ).rejects.toMatchObject({ code: 'FROM_NOT_OWNED' });
    expect(writes()).toHaveLength(before);
    expect(fx.emails.size).toBe(0);
    expect(fx.submissions).toHaveLength(0);
  });

  it('refuses an identity that does not match the From address', async () => {
    const client = await connected();
    await expect(
      client.send(message, { identityId: 'id-team' }),
    ).rejects.toMatchObject({ code: 'IDENTITY_MISMATCH' });
    await expect(
      client.send(message, { identityId: 'id-someone-else' }),
    ).rejects.toMatchObject({ code: 'IDENTITY_NOT_FOUND' });
    expect(writes()).toHaveLength(0);
    expect(fx.emails.size).toBe(0);
  });

  it('refuses an envelope sender outside the chosen identity', async () => {
    const client = await connected();
    await expect(
      client.send(message, { envelope: { from: 'ceo@victim.test' } }),
    ).rejects.toMatchObject({ code: 'ENVELOPE_FROM_NOT_OWNED' });
    expect(writes()).toHaveLength(0);
    const ok = await client.send(message, {
      envelope: { from: 'alice@example.test', to: ['only@example.test'] },
    });
    expect(ok.accepted).toEqual(['only@example.test']);
    expect(fx.submissions[0].envelope).toEqual({
      mailFrom: { email: 'alice@example.test' },
      rcptTo: [{ email: 'only@example.test' }],
    });
  });

  it('refuses ambiguous identities and header injection', async () => {
    fx.identities.push({
      id: 'id-dup',
      name: 'Dup',
      email: 'alice@example.test',
    });
    const client = await connected();
    await expect(client.send(message)).rejects.toMatchObject({
      code: 'IDENTITY_AMBIGUOUS',
    });
    expect(
      (await client.send(message, { identityId: 'id-dup' })).identityId,
    ).toBe('id-dup');
    await expect(
      client.send(message, {
        identityId: 'id-dup',
        headers: { 'X-A': 'v\r\nBcc: evil@x.test' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(
      client.send(message, {
        identityId: 'id-dup',
        headers: { From: 'spoof@x.test' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('requires a recipient and a valid message', async () => {
    const client = await connected();
    await expect(
      client.send({ ...message, to: [], cc: undefined }),
    ).rejects.toMatchObject({ code: 'INVALID_MESSAGE' });
    expect(writes()).toHaveLength(0);
  });

  it('cleans up the staged message when the server rejects the submission', async () => {
    fx.submissionError = 'forbiddenFrom';
    const client = await connected();
    await expect(client.send(message)).rejects.toMatchObject({
      code: 'SEND_ERROR',
      rejected: ['bob@example.test', 'carol@example.test'],
    });
    expect(fx.emails.size).toBe(0);
    expect(fx.submissions).toHaveLength(0);
  });

  it('submits a stored draft (draft-then-submit) and files it into Sent', async () => {
    const client = await connected();
    const draft = await client.createDraft(message);
    const result = await client.send(message, { draftId: draft.id });
    expect(result.id).toBe(draft.id);
    expect(result.messageId).toBe(draft.messageId);
    expect(fx.emails.get(draft.id)?.mailboxIds).toEqual({ 'mb-sent': true });
    expect(fx.emails.get(draft.id)?.keywords.$draft).toBeUndefined();
  });

  it('never submits a non-draft, and checks a draft against identities too', async () => {
    const received = fx.addEmail({
      subject: 'inbound',
      from: [{ email: 'ceo@victim.test' }],
    });
    const client = await connected();
    await expect(
      client.send(message, { draftId: received.id }),
    ).rejects.toMatchObject({ code: 'NOT_A_DRAFT' });
    const forged = await client.createDraft({
      ...message,
      from: { address: 'ceo@victim.test' },
    });
    await expect(
      client.send(message, { draftId: forged.id }),
    ).rejects.toMatchObject({ code: 'FROM_NOT_OWNED' });
    await expect(
      client.send(message, { draftId: forged.id, identityId: 'id-alice' }),
    ).rejects.toMatchObject({ code: 'IDENTITY_MISMATCH' });
    expect(fx.submissions).toHaveLength(0);
  });

  it('refuses drafts with several From entries or a foreign Sender', async () => {
    const client = await connected();
    const multi = fx.addEmail({
      subject: 'multi',
      mailboxIds: { 'mb-drafts': true },
      keywords: { $draft: true },
      from: [{ email: 'alice@example.test' }, { email: 'ceo@victim.test' }],
    });
    await expect(
      client.send(message, { draftId: multi.id }),
    ).rejects.toMatchObject({
      code: 'FROM_NOT_OWNED',
    });
    const foreign = fx.addEmail({
      subject: 'sender',
      mailboxIds: { 'mb-drafts': true },
      keywords: { $draft: true },
      from: [{ email: 'alice@example.test' }],
      sender: [{ email: 'ceo@victim.test' }],
    });
    await expect(
      client.send(message, { draftId: foreign.id }),
    ).rejects.toMatchObject({
      code: 'FROM_NOT_OWNED',
    });
    const own = fx.addEmail({
      subject: 'own sender',
      mailboxIds: { 'mb-drafts': true },
      keywords: { $draft: true },
      from: [{ email: 'alice@example.test' }],
      sender: [{ email: 'alice@example.test' }],
    });
    expect((await client.send(message, { draftId: own.id })).identityId).toBe(
      'id-alice',
    );
    expect(fx.submissions).toHaveLength(1);
  });

  it('reports a failed sent-copy update and never re-delivers a retried draft', async () => {
    fx.implicitUpdateError = 'invalidProperties';
    const client = await connected();
    const draft = await client.createDraft(message);
    const first = await client.send(message, { draftId: draft.id });
    expect(first.sentCopyError).toBe('invalidProperties');
    expect(fx.submissions).toHaveLength(1);
    // The draft is still $draft, but a retry must not deliver again.
    expect(fx.emails.get(draft.id)?.keywords.$draft).toBe(true);
    await expect(
      client.send(message, { draftId: draft.id }),
    ).rejects.toMatchObject({
      code: 'ALREADY_SUBMITTED',
    });
    expect(fx.submissions).toHaveLength(1);
  });

  it('delivers a draft once when two sends race', async () => {
    const draft = await (await connected()).createDraft(message);
    fx.queryBarrier = 2; // both pre-checks see "not submitted" before either submits
    const [a, b] = await Promise.allSettled([
      (await connected()).send(message, { draftId: draft.id }),
      (await connected()).send(message, { draftId: draft.id }),
    ]);
    const outcomes = [a, b];
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(
      (o) => o.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'ALREADY_SUBMITTED' });
    expect(fx.submissions).toHaveLength(1);
  });

  it('refuses a submission apiUrl outside the trusted origins', async () => {
    fx.apiUrlOverride = 'https://evil.test/jmap/api';
    await expect(adapter().send(message)).rejects.toMatchObject({
      code: 'UNTRUSTED_ORIGIN',
    });
    expect(fx.submissions).toHaveLength(0);
  });
});
