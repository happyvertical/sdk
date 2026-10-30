import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('nodemailer', () => ({
  default: { createTransport: transport.create },
}));

import { getEmailClient } from '../src/shared/factory.js';
import type { SMTPOptions } from '../src/shared/types.js';

beforeEach(() => vi.clearAllMocks());

describe('SMTP required TLS configuration', () => {
  it.each([
    undefined,
    false,
    true,
  ])('forwards requireTLS=%s without changing STARTTLS transport settings', async (requireTLS) => {
    const options: SMTPOptions = {
      type: 'smtp',
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      ...(requireTLS === undefined ? {} : { requireTLS }),
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    };
    await getEmailClient(options);
    expect(transport.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        host: options.host,
        port: 587,
        secure: false,
        requireTLS,
        tls: options.tls,
      }),
    );
  });
  it('preserves implicit TLS and certificate validation when requireTLS is true', async () => {
    await getEmailClient({
      type: 'smtp',
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      requireTLS: true,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    });
    expect(transport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: true,
        requireTLS: true,
        port: 465,
        tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      }),
    );
  });
});
