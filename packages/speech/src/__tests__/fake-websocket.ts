/** Test doubles shared by the realtime adapter tests. */

type Listener = (event: unknown) => void;
export type Message = Record<string, unknown>;

/** In-memory WebSocket double. Tests drive the "server" side explicitly. */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  /** Called for every client message; lets a test script server replies. */
  static onClientMessage?: (socket: FakeWebSocket, message: Message) => void;
  /** Open automatically on the next macrotask. */
  static autoOpen = true;

  readyState = 0;
  bufferedAmount = 0;
  binaryType = 'blob';
  readonly sent: Message[] = [];
  readonly closeCalls: Array<number | undefined> = [];
  private readonly listeners = new Map<string, Listener[]>();

  constructor(
    readonly url: string,
    readonly protocolsArg?: unknown,
  ) {
    FakeWebSocket.instances.push(this);
    if (FakeWebSocket.autoOpen) {
      setTimeout(() => this.serverOpen(), 0);
    }
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(data: string): void {
    if (this.readyState !== 1) {
      throw new Error('socket not open');
    }
    const message = JSON.parse(data) as Message;
    this.sent.push(message);
    FakeWebSocket.onClientMessage?.(this, message);
  }

  close(code?: number): void {
    this.closeCalls.push(code);
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    setTimeout(
      () => this.dispatch('close', { code: code ?? 1005, reason: '' }),
      0,
    );
  }

  serverOpen(): void {
    if (this.readyState !== 0) {
      return;
    }
    this.readyState = 1;
    this.dispatch('open', {});
  }

  serverSend(message: Message): void {
    this.dispatch('message', { data: JSON.stringify(message) });
  }

  serverDrop(code = 1006, reason = 'gone'): void {
    this.readyState = 3;
    this.dispatch('close', { code, reason });
  }

  types(): string[] {
    return this.sent.map((message) => String(message.type));
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

export const lastSocket = (): FakeWebSocket => {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) {
    throw new Error('no socket created');
  }
  return socket;
};

/** A minimal PCM/G.711 WAV file filled with a constant sample byte. */
export function wav(
  samples: number,
  { sampleRate = 24_000, channels = 1, format = 1, bits = 16 } = {},
): Uint8Array {
  const dataBytes = samples * channels * (bits / 8);
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bits / 8), true);
  view.setUint16(32, channels * (bits / 8), true);
  view.setUint16(34, bits, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  new Uint8Array(buffer, 44).fill(7);
  return new Uint8Array(buffer);
}
