/**
 * Buzz/Nostr forge event kinds verified live against desktop-v0.5.3 (ADR-002).
 * Kind numbers are load-bearing and must match the deployed relay.
 */
export const BUZZ_FORGE_KINDS = {
  repositoryAnnouncement: 30617,
  refUpdate: 30618,
  patch: 1617,
  statusOpen: 1630,
  statusApplied: 1631,
  statusClosed: 1632,
  statusDraft: 1633,
  reaction: 7,
  channelMembers: 39002,
} as const;

export type BuzzForgeKind =
  (typeof BUZZ_FORGE_KINDS)[keyof typeof BUZZ_FORGE_KINDS];

/** Minimal Nostr event shape consumed by the buzz forge adapter. */
export interface NostrForgeEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: readonly (readonly string[])[];
  content: string;
  sig: string;
}

/** Channel role floor used when validating kind:7 approvals (ADR-002). */
export type BuzzChannelRole = 'owner' | 'admin' | 'member' | 'guest' | 'bot';

export interface BuzzRoleResolution {
  pubkey: string;
  role: BuzzChannelRole;
}

export interface BuzzRelayClientOptions {
  /** WebSocket or HTTP relay endpoints. */
  relays: readonly string[];
  /** Optional filter limiting which kinds are accepted. */
  kinds?: readonly number[];
  /** Bound channel ids watched for forge activity. */
  channelIds?: readonly string[];
  /** Fetch implementation override for tests. */
  fetch?: typeof fetch;
  /** Poll interval in ms when using HTTP REQ polling. Default 5000. */
  pollIntervalMs?: number;
}

export interface BuzzRelaySubscription {
  close(): void;
}
