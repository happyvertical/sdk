import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAPAdapter } from '../src/adapters/imap';
import { AuthenticationError } from '../src/shared/errors';

const transport = vi.hoisted(() => ({ connect: vi.fn() }));
let client: EventEmitter;

vi.mock('imapflow', () => ({
  ImapFlow: class extends EventEmitter {
    constructor() {
      super();
      client = this;
    }
    connect = transport.connect;
  },
}));

describe('IMAP connection errors', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    'before',
    'after',
  ] as const)('handles a socket error %s rejected authentication without hiding the rejection', async (timing) => {
    const failure = new Error('Authentication failed');
    const socketError = Object.assign(new Error('Connection not available'), {
      code: 'NoConnection',
      authenticationFailed: true,
    });
    transport.connect.mockImplementation(async () => {
      if (timing === 'before') client.emit('error', socketError);
      throw failure;
    });
    const adapter = new IMAPAdapter({
      host: 'imap.example.test',
      port: 993,
      auth: { user: 'fixture', pass: 'fixture' },
    });

    await expect(adapter.connect()).rejects.toMatchObject({
      name: AuthenticationError.name,
      cause: failure,
    });
    expect(adapter.isConnected()).toBe(false);

    // ImapFlow may emit separately when the socket closes after AUTH fails.
    if (timing === 'after') {
      expect(() => client.emit('error', socketError)).not.toThrow();
    }
  });
});
