import require$$0 from "node:stream";
import { __require as requireFetch } from "./index46.js";
import { __require as requireRequest } from "./index49.js";
import { __require as requireWebidl } from "./index91.js";
import { __require as requireEventsourceStream } from "./index103.js";
import { __require as requireDataUrl } from "./index55.js";
import { __require as requireEvents } from "./index56.js";
import { __require as requireResponse } from "./index48.js";
import { __require as requireUtil } from "./index24.js";
import { __require as requireUtil$1 } from "./index88.js";
var eventsource;
var hasRequiredEventsource;
function requireEventsource() {
  if (hasRequiredEventsource) return eventsource;
  hasRequiredEventsource = 1;
  const { pipeline } = require$$0;
  const { fetching } = requireFetch();
  const { makeRequest } = requireRequest();
  const { webidl } = requireWebidl();
  const { EventSourceStream } = requireEventsourceStream();
  const { parseMIMEType } = requireDataUrl();
  const { createFastMessageEvent } = requireEvents();
  const { isNetworkError } = requireResponse();
  const { kEnumerableProperty } = requireUtil();
  const { environmentSettingsObject } = requireUtil$1();
  let experimentalWarned = false;
  const defaultReconnectionTime = 3e3;
  const CONNECTING = 0;
  const OPEN = 1;
  const CLOSED = 2;
  const ANONYMOUS = "anonymous";
  const USE_CREDENTIALS = "use-credentials";
  class EventSource extends EventTarget {
    #events = {
      open: null,
      error: null,
      message: null
    };
    #url;
    #withCredentials = false;
    /**
     * @type {ReadyState}
     */
    #readyState = CONNECTING;
    #request = null;
    #controller = null;
    #dispatcher;
    /**
     * @type {import('./eventsource-stream').eventSourceSettings}
     */
    #state;
    /**
     * Creates a new EventSource object.
     * @param {string} url
     * @param {EventSourceInit} [eventSourceInitDict={}]
     * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface
     */
    constructor(url, eventSourceInitDict = {}) {
      super();
      webidl.util.markAsUncloneable(this);
      const prefix = "EventSource constructor";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      if (!experimentalWarned) {
        experimentalWarned = true;
        process.emitWarning("EventSource is experimental, expect them to change at any time.", {
          code: "UNDICI-ES"
        });
      }
      url = webidl.converters.USVString(url);
      eventSourceInitDict = webidl.converters.EventSourceInitDict(eventSourceInitDict, prefix, "eventSourceInitDict");
      this.#dispatcher = eventSourceInitDict.node.dispatcher || eventSourceInitDict.dispatcher;
      this.#state = {
        lastEventId: "",
        reconnectionTime: eventSourceInitDict.node.reconnectionTime
      };
      const settings = environmentSettingsObject;
      let urlRecord;
      try {
        urlRecord = new URL(url, settings.settingsObject.baseUrl);
        this.#state.origin = urlRecord.origin;
      } catch (e) {
        throw new DOMException(e, "SyntaxError");
      }
      this.#url = urlRecord.href;
      let corsAttributeState = ANONYMOUS;
      if (eventSourceInitDict.withCredentials === true) {
        corsAttributeState = USE_CREDENTIALS;
        this.#withCredentials = true;
      }
      const initRequest = {
        redirect: "follow",
        keepalive: true,
        // @see https://html.spec.whatwg.org/multipage/urls-and-fetching.html#cors-settings-attributes
        mode: "cors",
        credentials: corsAttributeState === "anonymous" ? "same-origin" : "omit",
        referrer: "no-referrer"
      };
      initRequest.client = environmentSettingsObject.settingsObject;
      initRequest.headersList = [["accept", { name: "accept", value: "text/event-stream" }]];
      initRequest.cache = "no-store";
      initRequest.initiator = "other";
      initRequest.urlList = [new URL(this.#url)];
      this.#request = makeRequest(initRequest);
      this.#connect();
    }
    /**
     * Returns the state of this EventSource object's connection. It can have the
     * values described below.
     * @returns {ReadyState}
     * @readonly
     */
    get readyState() {
      return this.#readyState;
    }
    /**
     * Returns the URL providing the event stream.
     * @readonly
     * @returns {string}
     */
    get url() {
      return this.#url;
    }
    /**
     * Returns a boolean indicating whether the EventSource object was
     * instantiated with CORS credentials set (true), or not (false, the default).
     */
    get withCredentials() {
      return this.#withCredentials;
    }
    #connect() {
      if (this.#readyState === CLOSED) return;
      this.#readyState = CONNECTING;
      const fetchParams = {
        request: this.#request,
        dispatcher: this.#dispatcher
      };
      const processEventSourceEndOfBody = (response) => {
        if (!isNetworkError(response)) {
          return this.#reconnect();
        }
      };
      fetchParams.processResponseEndOfBody = processEventSourceEndOfBody;
      fetchParams.processResponse = (response) => {
        if (isNetworkError(response)) {
          if (response.aborted) {
            this.close();
            this.dispatchEvent(new Event("error"));
            return;
          } else {
            this.#reconnect();
            return;
          }
        }
        const contentType = response.headersList.get("content-type", true);
        const mimeType = contentType !== null ? parseMIMEType(contentType) : "failure";
        const contentTypeValid = mimeType !== "failure" && mimeType.essence === "text/event-stream";
        if (response.status !== 200 || contentTypeValid === false) {
          this.close();
          this.dispatchEvent(new Event("error"));
          return;
        }
        this.#readyState = OPEN;
        this.dispatchEvent(new Event("open"));
        this.#state.origin = response.urlList[response.urlList.length - 1].origin;
        const eventSourceStream = new EventSourceStream({
          eventSourceSettings: this.#state,
          push: (event) => {
            this.dispatchEvent(createFastMessageEvent(
              event.type,
              event.options
            ));
          }
        });
        pipeline(
          response.body.stream,
          eventSourceStream,
          (error) => {
            if (error?.aborted === false) {
              this.close();
              this.dispatchEvent(new Event("error"));
            }
          }
        );
      };
      this.#controller = fetching(fetchParams);
    }
    /**
     * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#sse-processing-model
     * @returns {void}
     */
    #reconnect() {
      if (this.#readyState === CLOSED) return;
      this.#readyState = CONNECTING;
      this.dispatchEvent(new Event("error"));
      setTimeout(() => {
        if (this.#readyState !== CONNECTING) return;
        if (this.#state.lastEventId.length) {
          this.#request.headersList.set("last-event-id", this.#state.lastEventId, true);
        }
        this.#connect();
      }, this.#state.reconnectionTime)?.unref();
    }
    /**
     * Closes the connection, if any, and sets the readyState attribute to
     * CLOSED.
     */
    close() {
      webidl.brandCheck(this, EventSource);
      if (this.#readyState === CLOSED) return;
      this.#readyState = CLOSED;
      this.#controller.abort();
      this.#request = null;
    }
    get onopen() {
      return this.#events.open;
    }
    set onopen(fn) {
      if (this.#events.open) {
        this.removeEventListener("open", this.#events.open);
      }
      const listener = webidl.converters.EventHandlerNonNull(fn);
      if (listener !== null) {
        this.addEventListener("open", listener);
        this.#events.open = fn;
      } else {
        this.#events.open = null;
      }
    }
    get onmessage() {
      return this.#events.message;
    }
    set onmessage(fn) {
      if (this.#events.message) {
        this.removeEventListener("message", this.#events.message);
      }
      const listener = webidl.converters.EventHandlerNonNull(fn);
      if (listener !== null) {
        this.addEventListener("message", listener);
        this.#events.message = fn;
      } else {
        this.#events.message = null;
      }
    }
    get onerror() {
      return this.#events.error;
    }
    set onerror(fn) {
      if (this.#events.error) {
        this.removeEventListener("error", this.#events.error);
      }
      const listener = webidl.converters.EventHandlerNonNull(fn);
      if (listener !== null) {
        this.addEventListener("error", listener);
        this.#events.error = fn;
      } else {
        this.#events.error = null;
      }
    }
  }
  const constantsPropertyDescriptors = {
    CONNECTING: {
      __proto__: null,
      configurable: false,
      enumerable: true,
      value: CONNECTING,
      writable: false
    },
    OPEN: {
      __proto__: null,
      configurable: false,
      enumerable: true,
      value: OPEN,
      writable: false
    },
    CLOSED: {
      __proto__: null,
      configurable: false,
      enumerable: true,
      value: CLOSED,
      writable: false
    }
  };
  Object.defineProperties(EventSource, constantsPropertyDescriptors);
  Object.defineProperties(EventSource.prototype, constantsPropertyDescriptors);
  Object.defineProperties(EventSource.prototype, {
    close: kEnumerableProperty,
    onerror: kEnumerableProperty,
    onmessage: kEnumerableProperty,
    onopen: kEnumerableProperty,
    readyState: kEnumerableProperty,
    url: kEnumerableProperty,
    withCredentials: kEnumerableProperty
  });
  webidl.converters.EventSourceInitDict = webidl.dictionaryConverter([
    {
      key: "withCredentials",
      converter: webidl.converters.boolean,
      defaultValue: () => false
    },
    {
      key: "dispatcher",
      // undici only
      converter: webidl.converters.any
    },
    {
      key: "node",
      // undici only
      converter: webidl.dictionaryConverter([
        {
          key: "reconnectionTime",
          converter: webidl.converters["unsigned long"],
          defaultValue: () => defaultReconnectionTime
        },
        {
          key: "dispatcher",
          converter: webidl.converters.any
        }
      ]),
      defaultValue: () => ({})
    }
  ]);
  eventsource = {
    EventSource,
    defaultReconnectionTime
  };
  return eventsource;
}
export {
  requireEventsource as __require
};
//# sourceMappingURL=index60.js.map
