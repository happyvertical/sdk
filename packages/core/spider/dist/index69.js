var timers;
var hasRequiredTimers;
function requireTimers() {
  if (hasRequiredTimers) return timers;
  hasRequiredTimers = 1;
  let fastNow = 0;
  const RESOLUTION_MS = 1e3;
  const TICK_MS = (RESOLUTION_MS >> 1) - 1;
  let fastNowTimeout;
  const kFastTimer = Symbol("kFastTimer");
  const fastTimers = [];
  const NOT_IN_LIST = -2;
  const TO_BE_CLEARED = -1;
  const PENDING = 0;
  const ACTIVE = 1;
  function onTick() {
    fastNow += TICK_MS;
    let idx = 0;
    let len = fastTimers.length;
    while (idx < len) {
      const timer = fastTimers[idx];
      if (timer._state === PENDING) {
        timer._idleStart = fastNow - TICK_MS;
        timer._state = ACTIVE;
      } else if (timer._state === ACTIVE && fastNow >= timer._idleStart + timer._idleTimeout) {
        timer._state = TO_BE_CLEARED;
        timer._idleStart = -1;
        timer._onTimeout(timer._timerArg);
      }
      if (timer._state === TO_BE_CLEARED) {
        timer._state = NOT_IN_LIST;
        if (--len !== 0) {
          fastTimers[idx] = fastTimers[len];
        }
      } else {
        ++idx;
      }
    }
    fastTimers.length = len;
    if (fastTimers.length !== 0) {
      refreshTimeout();
    }
  }
  function refreshTimeout() {
    if (fastNowTimeout?.refresh) {
      fastNowTimeout.refresh();
    } else {
      clearTimeout(fastNowTimeout);
      fastNowTimeout = setTimeout(onTick, TICK_MS);
      fastNowTimeout?.unref();
    }
  }
  class FastTimer {
    [kFastTimer] = true;
    /**
     * The state of the timer, which can be one of the following:
     * - NOT_IN_LIST (-2)
     * - TO_BE_CLEARED (-1)
     * - PENDING (0)
     * - ACTIVE (1)
     *
     * @type {-2|-1|0|1}
     * @private
     */
    _state = NOT_IN_LIST;
    /**
     * The number of milliseconds to wait before calling the callback.
     *
     * @type {number}
     * @private
     */
    _idleTimeout = -1;
    /**
     * The time in milliseconds when the timer was started. This value is used to
     * calculate when the timer should expire.
     *
     * @type {number}
     * @default -1
     * @private
     */
    _idleStart = -1;
    /**
     * The function to be executed when the timer expires.
     * @type {Function}
     * @private
     */
    _onTimeout;
    /**
     * The argument to be passed to the callback when the timer expires.
     *
     * @type {*}
     * @private
     */
    _timerArg;
    /**
     * @constructor
     * @param {Function} callback A function to be executed after the timer
     * expires.
     * @param {number} delay The time, in milliseconds that the timer should wait
     * before the specified function or code is executed.
     * @param {*} arg
     */
    constructor(callback, delay, arg) {
      this._onTimeout = callback;
      this._idleTimeout = delay;
      this._timerArg = arg;
      this.refresh();
    }
    /**
     * Sets the timer's start time to the current time, and reschedules the timer
     * to call its callback at the previously specified duration adjusted to the
     * current time.
     * Using this on a timer that has already called its callback will reactivate
     * the timer.
     *
     * @returns {void}
     */
    refresh() {
      if (this._state === NOT_IN_LIST) {
        fastTimers.push(this);
      }
      if (!fastNowTimeout || fastTimers.length === 1) {
        refreshTimeout();
      }
      this._state = PENDING;
    }
    /**
     * The `clear` method cancels the timer, preventing it from executing.
     *
     * @returns {void}
     * @private
     */
    clear() {
      this._state = TO_BE_CLEARED;
      this._idleStart = -1;
    }
  }
  timers = {
    /**
     * The setTimeout() method sets a timer which executes a function once the
     * timer expires.
     * @param {Function} callback A function to be executed after the timer
     * expires.
     * @param {number} delay The time, in milliseconds that the timer should
     * wait before the specified function or code is executed.
     * @param {*} [arg] An optional argument to be passed to the callback function
     * when the timer expires.
     * @returns {NodeJS.Timeout|FastTimer}
     */
    setTimeout(callback, delay, arg) {
      return delay <= RESOLUTION_MS ? setTimeout(callback, delay, arg) : new FastTimer(callback, delay, arg);
    },
    /**
     * The clearTimeout method cancels an instantiated Timer previously created
     * by calling setTimeout.
     *
     * @param {NodeJS.Timeout|FastTimer} timeout
     */
    clearTimeout(timeout) {
      if (timeout[kFastTimer]) {
        timeout.clear();
      } else {
        clearTimeout(timeout);
      }
    },
    /**
     * The setFastTimeout() method sets a fastTimer which executes a function once
     * the timer expires.
     * @param {Function} callback A function to be executed after the timer
     * expires.
     * @param {number} delay The time, in milliseconds that the timer should
     * wait before the specified function or code is executed.
     * @param {*} [arg] An optional argument to be passed to the callback function
     * when the timer expires.
     * @returns {FastTimer}
     */
    setFastTimeout(callback, delay, arg) {
      return new FastTimer(callback, delay, arg);
    },
    /**
     * The clearTimeout method cancels an instantiated FastTimer previously
     * created by calling setFastTimeout.
     *
     * @param {FastTimer} timeout
     */
    clearFastTimeout(timeout) {
      timeout.clear();
    },
    /**
     * The now method returns the value of the internal fast timer clock.
     *
     * @returns {number}
     */
    now() {
      return fastNow;
    },
    /**
     * Trigger the onTick function to process the fastTimers array.
     * Exported for testing purposes only.
     * Marking as deprecated to discourage any use outside of testing.
     * @deprecated
     * @param {number} [delay=0] The delay in milliseconds to add to the now value.
     */
    tick(delay = 0) {
      fastNow += delay - RESOLUTION_MS + 1;
      onTick();
      onTick();
    },
    /**
     * Reset FastTimers.
     * Exported for testing purposes only.
     * Marking as deprecated to discourage any use outside of testing.
     * @deprecated
     */
    reset() {
      fastNow = 0;
      fastTimers.length = 0;
      clearTimeout(fastNowTimeout);
      fastNowTimeout = null;
    },
    /**
     * Exporting for testing purposes only.
     * Marking as deprecated to discourage any use outside of testing.
     * @deprecated
     */
    kFastTimer
  };
  return timers;
}
export {
  requireTimers as __require
};
//# sourceMappingURL=index69.js.map
