import { __require as requireFrame } from "./index102.js";
import { __require as requireConstants } from "./index97.js";
import { __require as requireFixedQueue } from "./index108.js";
var sender;
var hasRequiredSender;
function requireSender() {
  if (hasRequiredSender) return sender;
  hasRequiredSender = 1;
  const { WebsocketFrameSend } = requireFrame();
  const { opcodes, sendHints } = requireConstants();
  const FixedQueue = requireFixedQueue();
  class SendQueue {
    /**
     * @type {FixedQueue}
     */
    #queue = new FixedQueue();
    /**
     * @type {boolean}
     */
    #running = false;
    /** @type {import('node:net').Socket} */
    #socket;
    constructor(socket) {
      this.#socket = socket;
    }
    add(item, cb, hint) {
      if (hint !== sendHints.blob) {
        if (!this.#running) {
          if (hint === sendHints.text) {
            const { 0: head, 1: body } = WebsocketFrameSend.createFastTextFrame(item);
            this.#socket.cork();
            this.#socket.write(head);
            this.#socket.write(body, cb);
            this.#socket.uncork();
          } else {
            this.#socket.write(createFrame(item, hint), cb);
          }
        } else {
          const node2 = {
            promise: null,
            callback: cb,
            frame: createFrame(item, hint)
          };
          this.#queue.push(node2);
        }
        return;
      }
      const node = {
        promise: item.arrayBuffer().then((ab) => {
          node.promise = null;
          node.frame = createFrame(ab, hint);
        }),
        callback: cb,
        frame: null
      };
      this.#queue.push(node);
      if (!this.#running) {
        this.#run();
      }
    }
    async #run() {
      this.#running = true;
      const queue = this.#queue;
      while (!queue.isEmpty()) {
        const node = queue.shift();
        if (node.promise !== null) {
          await node.promise;
        }
        this.#socket.write(node.frame, node.callback);
        node.callback = node.frame = null;
      }
      this.#running = false;
    }
  }
  function createFrame(data, hint) {
    return new WebsocketFrameSend(toBuffer(data, hint)).createFrame(hint === sendHints.text ? opcodes.TEXT : opcodes.BINARY);
  }
  function toBuffer(data, hint) {
    switch (hint) {
      case sendHints.text:
      case sendHints.typedArray:
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      case sendHints.arrayBuffer:
      case sendHints.blob:
        return new Uint8Array(data);
    }
  }
  sender = { SendQueue };
  return sender;
}
export {
  requireSender as __require
};
//# sourceMappingURL=index101.js.map
