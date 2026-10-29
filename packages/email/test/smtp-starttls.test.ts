import { createServer, type Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { SMTPAdapter } from '../src/adapters/smtp.js';

/** Local greeting-only fixture. It has no credentials and cannot accept mail. */
async function withoutStartTLS() {
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('220 localhost SMTP verification fixture\r\n');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const boundary = buffer.indexOf('\r\n');
        const command = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        commands.push(command);
        if (/^EHLO\b/.test(command))
          socket.write('250-localhost\r\n250 SIZE 4096\r\n');
        else if (/^STARTTLS\b/.test(command))
          socket.write('454 TLS unavailable\r\n');
        else if (/^QUIT\b/.test(command)) socket.end('221 Goodbye\r\n');
        else socket.write('502 Command not supported\r\n');
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture port');
  return {
    commands,
    port: address.port,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

describe('Nodemailer required STARTTLS behavior', () => {
  it.each([
    false,
    true,
  ])('requires upgrade only when requireTLS=%s', async (requireTLS) => {
    const fixture = await withoutStartTLS();
    const client = new SMTPAdapter({
      type: 'smtp',
      host: '127.0.0.1',
      port: fixture.port,
      secure: false,
      requireTLS,
      debug: false,
      connectionTimeout: 2_000,
      greetingTimeout: 2_000,
      socketTimeout: 2_000,
    });
    try {
      if (requireTLS) {
        await expect(client.connect()).rejects.toThrow();
        expect(client.isConnected()).toBe(false);
        expect(fixture.commands.some((command) => command === 'STARTTLS')).toBe(
          true,
        );
      } else {
        await expect(client.connect()).resolves.toBeUndefined();
        expect(client.isConnected()).toBe(true);
        expect(fixture.commands.some((command) => command === 'STARTTLS')).toBe(
          false,
        );
      }
      expect(
        fixture.commands.some((command) =>
          /^(AUTH|MAIL FROM|RCPT TO|DATA)\b/.test(command),
        ),
      ).toBe(false);
    } finally {
      await client.disconnect();
      await fixture.close();
    }
  });
});
