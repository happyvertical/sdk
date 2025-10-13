var fixedQueue;
var hasRequiredFixedQueue;
function requireFixedQueue() {
  if (hasRequiredFixedQueue) return fixedQueue;
  hasRequiredFixedQueue = 1;
  const kSize = 2048;
  const kMask = kSize - 1;
  class FixedCircularBuffer {
    /** @type {number} */
    bottom = 0;
    /** @type {number} */
    top = 0;
    /** @type {Array<T|undefined>} */
    list = new Array(kSize).fill(void 0);
    /** @type {T|null} */
    next = null;
    /** @returns {boolean} */
    isEmpty() {
      return this.top === this.bottom;
    }
    /** @returns {boolean} */
    isFull() {
      return (this.top + 1 & kMask) === this.bottom;
    }
    /**
     * @param {T} data
     * @returns {void}
     */
    push(data) {
      this.list[this.top] = data;
      this.top = this.top + 1 & kMask;
    }
    /** @returns {T|null} */
    shift() {
      const nextItem = this.list[this.bottom];
      if (nextItem === void 0) {
        return null;
      }
      this.list[this.bottom] = void 0;
      this.bottom = this.bottom + 1 & kMask;
      return nextItem;
    }
  }
  fixedQueue = class FixedQueue {
    constructor() {
      this.head = this.tail = new FixedCircularBuffer();
    }
    /** @returns {boolean} */
    isEmpty() {
      return this.head.isEmpty();
    }
    /** @param {T} data */
    push(data) {
      if (this.head.isFull()) {
        this.head = this.head.next = new FixedCircularBuffer();
      }
      this.head.push(data);
    }
    /** @returns {T|null} */
    shift() {
      const tail = this.tail;
      const next = tail.shift();
      if (tail.isEmpty() && tail.next !== null) {
        this.tail = tail.next;
        tail.next = null;
      }
      return next;
    }
  };
  return fixedQueue;
}
export {
  requireFixedQueue as __require
};
//# sourceMappingURL=index108.js.map
