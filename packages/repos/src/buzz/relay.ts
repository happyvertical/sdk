import { ForgeError } from '../forge/errors.js';
import type { ForgeEventEnvelope } from '../forge/types.js';
import {
  channelIdFromEvent,
  normalizeBuzzEvent,
  verifyAndNormalizeBuzzEvent,
} from './events.js';
import {
  BUZZ_FORGE_KINDS,
  type BuzzRelayClientOptions,
  type BuzzRelaySubscription,
  type NostrForgeEvent,
} from './types.js';

const DEFAULT_KINDS: readonly number[] = [
  BUZZ_FORGE_KINDS.repositoryAnnouncement,
  BUZZ_FORGE_KINDS.refUpdate,
  BUZZ_FORGE_KINDS.patch,
  BUZZ_FORGE_KINDS.statusOpen,
  BUZZ_FORGE_KINDS.statusApplied,
  BUZZ_FORGE_KINDS.statusClosed,
  BUZZ_FORGE_KINDS.statusDraft,
  BUZZ_FORGE_KINDS.reaction,
  BUZZ_FORGE_KINDS.channelMembers,
];

function isNostrForgeEvent(value: unknown): value is NostrForgeEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === 'string' &&
    typeof event.pubkey === 'string' &&
    typeof event.created_at === 'number' &&
    typeof event.kind === 'number' &&
    Array.isArray(event.tags) &&
    typeof event.content === 'string' &&
    typeof event.sig === 'string'
  );
}

/**
 * Minimal buzz relay client: HTTP REQ polling plus an injectable event source
 * for tests and WebSocket adapters.
 *
 * The client never mutates process-global state. Each subscribe/poll call is
 * scoped to the constructed options.
 */
export class BuzzRelayClient {
  private readonly relays: readonly string[];
  private readonly kinds: readonly number[];
  private readonly channelIds: readonly string[] | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly seenIds = new Set<string>();

  constructor(options: BuzzRelayClientOptions) {
    if (!options.relays.length) {
      throw new ForgeError(
        'Buzz relay client requires at least one relay',
        'CONFIGURATION_ERROR',
        {
          provider: 'buzz',
        },
      );
    }
    this.relays = options.relays;
    this.kinds = options.kinds ?? DEFAULT_KINDS;
    this.channelIds = options.channelIds;
    this.fetchImpl = options.fetch ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
  }

  /**
   * Poll every configured relay once with a NIP-01-style HTTP REQ body and
   * return newly observed, verified envelopes (deduped by event id).
   */
  async pollOnce(
    options: {
      since?: number;
      allowUnverifiedFixtures?: boolean;
      membersEvent?: NostrForgeEvent;
      referencedPatchEvent?: NostrForgeEvent;
    } = {},
  ): Promise<ForgeEventEnvelope[]> {
    const envelopes: ForgeEventEnvelope[] = [];
    for (const relay of this.relays) {
      const events = await this.fetchEvents(relay, options.since);
      const patches = new Map(
        events
          .filter((event) => event.kind === BUZZ_FORGE_KINDS.patch)
          .map((event) => [event.id, event]),
      );
      for (const event of events) {
        if (this.seenIds.has(event.id)) continue;
        if (!this.kinds.includes(event.kind)) continue;
        if (this.channelIds?.length) {
          const channelId = channelIdFromEvent(event);
          if (!channelId || !this.channelIds.includes(channelId)) continue;
        }
        try {
          const envelope = verifyAndNormalizeBuzzEvent(event, new Date(), {
            allowUnverifiedFixtures: options.allowUnverifiedFixtures,
            membersEvent: options.membersEvent,
            referencedPatchEvent:
              options.referencedPatchEvent ??
              patches.get(event.tags.find((tag) => tag[0] === 'e')?.[1] ?? ''),
          });
          this.seenIds.add(event.id);
          envelopes.push(envelope);
        } catch {
          // Fail closed per event; continue scanning the rest of the batch.
        }
      }
    }
    return envelopes;
  }

  /**
   * Poll on an interval until `close()` is called. Useful for long-running
   * Aedile adapters. Returns a subscription handle.
   */
  subscribe(
    onEvent: (envelope: ForgeEventEnvelope) => void | Promise<void>,
    options: {
      since?: number;
      allowUnverifiedFixtures?: boolean;
      membersEvent?: NostrForgeEvent;
      referencedPatchEvent?: NostrForgeEvent;
      onError?: (error: unknown) => void;
    } = {},
  ): BuzzRelaySubscription {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (stopped) return;
      try {
        const envelopes = await this.pollOnce(options);
        for (const envelope of envelopes) {
          await onEvent(envelope);
        }
      } catch (error) {
        options.onError?.(error);
      }
      if (!stopped) {
        timer = setTimeout(() => {
          void tick();
        }, this.pollIntervalMs);
      }
    };

    void tick();

    return {
      close() {
        stopped = true;
        clearTimeout(timer);
      },
    };
  }

  /**
   * Normalize a pre-fetched event list (tests / custom transports) without
   * contacting a relay. Applies the same kind/channel filters and id dedupe.
   */
  ingestEvents(
    events: readonly NostrForgeEvent[],
    options: {
      allowUnverifiedFixtures?: boolean;
      membersEvent?: NostrForgeEvent;
      referencedPatchEvent?: NostrForgeEvent;
      verify?: boolean;
    } = {},
  ): ForgeEventEnvelope[] {
    const envelopes: ForgeEventEnvelope[] = [];
    const patches = new Map(
      events
        .filter((event) => event.kind === BUZZ_FORGE_KINDS.patch)
        .map((event) => [event.id, event]),
    );
    for (const event of events) {
      if (this.seenIds.has(event.id)) continue;
      if (!this.kinds.includes(event.kind)) continue;
      if (this.channelIds?.length) {
        const channelId = channelIdFromEvent(event);
        if (!channelId || !this.channelIds.includes(channelId)) continue;
      }
      const envelope =
        options.verify === false
          ? normalizeBuzzEvent(event, new Date(), {
              membersEvent: options.membersEvent,
              referencedPatchEvent:
                options.referencedPatchEvent ??
                patches.get(
                  event.tags.find((tag) => tag[0] === 'e')?.[1] ?? '',
                ),
            })
          : verifyAndNormalizeBuzzEvent(event, new Date(), {
              allowUnverifiedFixtures: options.allowUnverifiedFixtures,
              membersEvent: options.membersEvent,
              referencedPatchEvent:
                options.referencedPatchEvent ??
                patches.get(
                  event.tags.find((tag) => tag[0] === 'e')?.[1] ?? '',
                ),
            });
      this.seenIds.add(event.id);
      envelopes.push(envelope);
    }
    return envelopes;
  }

  /** Forget delivered ids (operator replay). */
  resetSeen(): void {
    this.seenIds.clear();
  }

  private async fetchEvents(
    relay: string,
    since?: number,
  ): Promise<NostrForgeEvent[]> {
    const filter: Record<string, unknown> = { kinds: [...this.kinds] };
    if (since !== undefined) filter.since = since;
    if (this.channelIds?.length) filter['#channel'] = [...this.channelIds];

    // HTTP REQ convention used by HappyVertical relay helpers: POST JSON array.
    const body = JSON.stringify(['REQ', 'buzz-forge', filter]);
    let response: Response;
    try {
      response = await this.fetchImpl(relay, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
    } catch (error) {
      throw new ForgeError('Buzz relay transport failed', 'TRANSPORT_ERROR', {
        provider: 'buzz',
        cause: error,
        retryable: true,
      });
    }
    if (!response.ok) {
      throw new ForgeError(
        `Buzz relay returned HTTP ${response.status}`,
        'PROVIDER_ERROR',
        {
          provider: 'buzz',
          status: response.status,
          retryable: response.status >= 500,
        },
      );
    }
    const payload: unknown = await response.json();
    return extractEvents(payload);
  }
}

function extractEvents(payload: unknown): NostrForgeEvent[] {
  if (!Array.isArray(payload)) return [];
  const events: NostrForgeEvent[] = [];
  for (const item of payload) {
    if (
      Array.isArray(item) &&
      item[0] === 'EVENT' &&
      isNostrForgeEvent(item[2])
    ) {
      events.push(item[2]);
      continue;
    }
    if (isNostrForgeEvent(item)) {
      events.push(item);
    }
  }
  return events;
}
