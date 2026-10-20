import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('compiles an unchanged baseline adapter and requires concrete capabilities for assistant context and reply suppression', () => {
  const directory = mkdtempSync(join(tmpdir(), 'speech-consumer-'));
  const entry = fileURLToPath(new URL('../conversation.js', import.meta.url));
  const source = `
import { createOpenAIWebRTCVoiceSession, type VoiceSession } from ${JSON.stringify(entry)};

// Existing adapter implementation: no provider-specific context capability.
const legacy: VoiceSession = {
  state: 'idle',
  async connect() {},
  sendText(_text: string) { return 'item'; },
  commitInput() {},
  respond() {},
  interrupt() {},
  setMicMuted() {},
  setOutputMuted() {},
  submitToolResult() {},
  close() {},
  on(_event, _listener) { return () => {}; },
};
const concrete = createOpenAIWebRTCVoiceSession({
  negotiate: async () => 'sdp',
  getMicrophone: async () => { throw new Error('compile only'); },
});
const receiptId: string = concrete.appendAssistantContext('Confirmed receipt');
const compatible: VoiceSession = concrete;
legacy.sendText('normal');
// @ts-expect-error Legacy adapters cannot promise reply suppression.
legacy.sendText('requires host approval', false);
const typedItemId: string = concrete.sendText('requires host approval', false);
void typedItemId;
void [legacy, receiptId, compatible];
`;
  try {
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
    const fixture = join(directory, 'consumer.ts');
    writeFileSync(fixture, source);
    const compiler = createRequire(import.meta.url).resolve(
      'typescript/bin/tsc',
    );
    const result = spawnSync(
      process.execPath,
      [
        compiler,
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--lib',
        'ES2022,DOM',
        fixture,
      ],
      { encoding: 'utf8', timeout: 20_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 25_000);
