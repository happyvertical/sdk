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
      send: false,
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

  it('does not implement send yet', async () => {
    await expect(adapter().send({} as never)).rejects.toMatchObject({
      code: 'NOT_SUPPORTED',
    });
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
