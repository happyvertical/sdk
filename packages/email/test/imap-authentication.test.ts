import { createServer, type Socket } from 'node:net';
import { expect, it } from 'vitest';
import { IMAPAdapter } from '../src/adapters/imap';

it('returns an authentication rejection when a fixture IMAP server refuses login', async () => {
  const sockets = new Set<Socket>();
  const commands: string[] = [];
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] Fixture ready\r\n');
    let pending = '';
    socket.on('data', (data) => {
      pending += data.toString();
      let end = pending.indexOf('\r\n');
      while (end !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const [tag, command] = line.split(' ');
        commands.push(command);
        if (command === 'AUTHENTICATE' || command === 'LOGIN') {
          socket.end(`${tag} NO Authentication failed\r\n`);
        } else if (command === 'CAPABILITY') {
          socket.write(`* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n${tag} OK\r\n`);
        } else {
          socket.write(`${tag} BAD Unsupported\r\n`);
        }
        end = pending.indexOf('\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No fixture port');
  try {
    const adapter = new IMAPAdapter({
      host: '127.0.0.1',
      port: address.port,
      secure: false,
      auth: { user: 'fixture', pass: 'invalid' },
    });
    await expect(adapter.connect()).rejects.toMatchObject({
      cause: { authenticationFailed: true },
    });
    expect(adapter.isConnected()).toBe(false);
    expect(
      commands.some((command) => /^(AUTHENTICATE|LOGIN)$/.test(command)),
    ).toBe(true);
    // Let the remote close propagate separately from the connect rejection.
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
