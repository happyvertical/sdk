import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEmailClient } from '../src/index.js';
import type { EmailClient } from '../src/shared/types.js';

const transport = vi.hoisted(() => ({
  search: vi.fn(),
  fetch: vi.fn(),
  mailboxOpen: vi.fn(),
  uidl: vi.fn(),
  retr: vi.fn(),
}));

vi.mock('imapflow', () => ({
  ImapFlow: class {
    connect = async () => {};
    logout = async () => {};
    search = transport.search;
    fetch = transport.fetch;
    mailboxOpen = transport.mailboxOpen;
  },
}));
vi.mock('node-pop3', () => ({
  default: class {
    connect = async () => {};
    QUIT = async () => {};
    UIDL = transport.uidl;
    RETR = transport.retr;
  },
}));

// mailparser is deliberately real: exercise MIME bytes and normalized headers.
function mime(headers: string[] = []): Buffer {
  return Buffer.from(
    [
      'From: sender@example.test',
      'To: receiver@example.test',
      'Message-ID: <reply@example.test>',
      'Subject: Reply',
      ...headers,
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="fixture"',
      '',
      '--fixture',
      'Content-Type: text/plain',
      '',
      'Reply body',
      '--fixture',
      'Content-Type: application/octet-stream',
      'Content-Disposition: attachment; filename="data.bin"',
      'Content-Transfer-Encoding: base64',
      '',
      'AQID',
      '--fixture--',
      '',
    ].join('\r\n'),
  );
}
const reply = mime([
  'In-Reply-To: <parent@example.test>',
  'References: <root@example.test> <parent@example.test>',
]);
let clients: EmailClient[] = [];
async function client(type: 'imap' | 'pop3') {
  const result = await getEmailClient({
    type,
    host: 'fixture.invalid',
    port: type === 'imap' ? 993 : 995,
    auth: { user: 'fixture', pass: 'fixture' },
  });
  clients.push(result);
  await result.connect();
  return result;
}

beforeEach(() => {
  vi.resetAllMocks();
  transport.search.mockResolvedValue([42]);
  transport.mailboxOpen.mockResolvedValue({ exists: 1, uidValidity: 7 });
  // One message: sequence number 1, UID 42, as after ordinary expunges.
  transport.fetch.mockImplementation(async function* (
    range: number | number[],
    _query: unknown,
    options?: { uid?: boolean },
  ) {
    const ids = Array.isArray(range) ? range : [range];
    if (ids.includes(options?.uid ? 42 : 1)) {
      yield { uid: 42, source: reply, flags: new Set() };
    }
  });
  transport.uidl.mockResolvedValue(['1 stable-pop-uid']);
  transport.retr.mockResolvedValue([reply]);
});
afterEach(async () => {
  await Promise.all(clients.map((entry) => entry.disconnect()));
  clients = [];
});

describe('IMAP UID retrieval through the public factory', () => {
  const paths = ['getMessage', 'fetch', 'search'] as const;
  async function read(entry: EmailClient, path: (typeof paths)[number]) {
    if (path === 'getMessage') {
      return [await entry.getMessage('<reply@example.test>')];
    }
    return path === 'fetch'
      ? entry.fetch({ folder: 'INBOX' })
      : entry.search({ subject: 'Reply' });
  }
  it.each(
    paths,
  )('%s retrieves UID 42 at sequence 1 with reply and bytes', async (path) => {
    const entry = await client('imap');
    const messages = await read(entry, path);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: '42',
      messageId: '<reply@example.test>',
      inReplyTo: '<parent@example.test>',
      references: ['<root@example.test>', '<parent@example.test>'],
    });
    expect(messages[0].attachments?.[0].content).toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(transport.fetch).toHaveBeenCalledWith(
      path === 'getMessage' ? 42 : [42],
      expect.objectContaining({ source: true, uid: true }),
      { uid: true },
    );
  });
  it.each(paths)('%s preserves no-match behavior', async (path) => {
    transport.search.mockResolvedValue(false);
    const entry = await client('imap');
    if (path === 'getMessage') {
      await expect(read(entry, path)).rejects.toMatchObject({
        code: 'MESSAGE_NOT_FOUND',
      });
    } else {
      await expect(read(entry, path)).resolves.toEqual([]);
    }
    expect(transport.fetch).not.toHaveBeenCalled();
  });
  it.each(paths)('%s propagates upstream retrieval failure', async (path) => {
    transport.fetch.mockImplementation(() => {
      throw new Error('fixture transport failure');
    });
    await expect(read(await client('imap'), path)).rejects.toThrow(
      'fixture transport failure',
    );
  });
});

describe('POP3 parsed reply provenance', () => {
  it.each([
    {
      headers: [
        'In-Reply-To: <parent@example.test>',
        'References: <parent@example.test>',
      ],
      parent: '<parent@example.test>',
      references: ['<parent@example.test>'],
    },
    {
      headers: [
        'In-Reply-To: <parent@example.test>',
        'References: <root@example.test> <parent@example.test>',
      ],
      parent: '<parent@example.test>',
      references: ['<root@example.test>', '<parent@example.test>'],
    },
    { headers: [], parent: undefined, references: undefined },
  ])('preserves optional headers $headers and attachment bytes', async ({
    headers,
    parent,
    references,
  }) => {
    transport.retr.mockResolvedValue([mime(headers)]);
    const entry = await client('pop3');
    const message = await entry.getMessage('stable-pop-uid');
    expect(message.id).toBe('stable-pop-uid');
    expect(message.inReplyTo).toBe(parent);
    expect(message.references).toEqual(references);
    expect(message.attachments?.[0].content).toEqual(Buffer.from([1, 2, 3]));
    expect(transport.retr).toHaveBeenCalledWith(1);
  });
  it('rejects an unknown UIDL without retrieving another message', async () => {
    await expect(
      (await client('pop3')).getMessage('missing'),
    ).rejects.toMatchObject({ code: 'MESSAGE_NOT_FOUND' });
    expect(transport.retr).not.toHaveBeenCalled();
  });
  it('propagates upstream retrieval failure', async () => {
    transport.retr.mockRejectedValue(new Error('fixture transport failure'));
    await expect(
      (await client('pop3')).getMessage('stable-pop-uid'),
    ).rejects.toThrow('fixture transport failure');
  });
});
