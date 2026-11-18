import type { EmailClient, EmailMessage } from '@happyvertical/email';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailBridgeAdapter } from '../src/adapters/email-bridge.js';
import { MessageNotFoundError } from '../src/shared/errors.js';

const factory = vi.hoisted(() => ({ getEmailClient: vi.fn() }));
vi.mock('@happyvertical/email', () => factory);

function email(id: string, threadId?: string): EmailMessage {
  return {
    id,
    threadId,
    from: { address: 'a@example.test' },
    to: [{ address: 'b@example.test' }],
    subject: id,
    text: id,
  };
}

function bridge() {
  return new EmailBridgeAdapter({
    type: 'email',
    emailOptions: { type: 'smtp', host: 'h', port: 25 },
  });
}

describe('EmailBridgeAdapter.getThread', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the whole conversation when the client has native threads', async () => {
    const getThread = vi.fn(async () => [email('m1', 't1'), email('m2', 't1')]);
    factory.getEmailClient.mockResolvedValue({
      getThread,
    } as unknown as EmailClient);
    const thread = await bridge().getThread('t1');
    expect(getThread).toHaveBeenCalledWith('t1');
    expect(thread.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(thread.every((m) => m.threadId === 't1')).toBe(true);
  });

  it('falls back to a single-message thread without native threads', async () => {
    factory.getEmailClient.mockResolvedValue({
      getMessage: vi.fn(async () => email('m1')),
    } as unknown as EmailClient);
    const thread = await bridge().getThread('m1');
    expect(thread.map((m) => m.id)).toEqual(['m1']);
  });

  it('maps a native thread lookup failure to MessageNotFoundError', async () => {
    factory.getEmailClient.mockResolvedValue({
      getThread: vi.fn(async () => {
        throw new Error('nope');
      }),
    } as unknown as EmailClient);
    await expect(bridge().getThread('x')).rejects.toBeInstanceOf(
      MessageNotFoundError,
    );
  });
});
