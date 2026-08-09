import { computeNostrEventId } from './events.js';
import { BUZZ_FORGE_KINDS, type NostrForgeEvent } from './types.js';

const FIXTURE_PUBKEY =
  '2ad53df8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa4f05';
const FIXTURE_ATTESTOR =
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const FIXTURE_REACTOR =
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const PLACEHOLDER_SIG = 'a'.repeat(128);

export interface BuzzFixtureOptions {
  /** Override event id after computing the NIP-01 digest (duplicate/replay cases). */
  id?: string;
  pubkey?: string;
  created_at?: number;
  tags?: readonly (readonly string[])[];
  content?: string;
  sig?: string;
}

/**
 * Build a deterministic unsigned-then-id-bound Nostr event for tests.
 * Signature bytes are placeholders; pair with `allowUnverifiedFixtures: true`.
 */
export function createBuzzFixtureEvent(
  kind: number,
  options: BuzzFixtureOptions = {},
): NostrForgeEvent {
  const skeleton = {
    pubkey: options.pubkey ?? FIXTURE_PUBKEY,
    created_at: options.created_at ?? 1_725_000_000,
    kind,
    tags: options.tags ?? [],
    content: options.content ?? '',
  };
  const id = options.id ?? computeNostrEventId(skeleton);
  return {
    ...skeleton,
    id,
    sig: options.sig ?? PLACEHOLDER_SIG,
  };
}

export function createRepositoryAnnouncementFixture(
  options: BuzzFixtureOptions & {
    owner?: string;
    repoId?: string;
    channelId?: string;
  } = {},
): NostrForgeEvent {
  const owner = options.owner ?? FIXTURE_PUBKEY;
  const repoId = options.repoId ?? 'happyvertical.com';
  return createBuzzFixtureEvent(BUZZ_FORGE_KINDS.repositoryAnnouncement, {
    ...options,
    pubkey: owner,
    tags: options.tags ?? [
      ['d', repoId],
      ['p', owner],
      ['channel', options.channelId ?? 'channel-hv'],
      ['clone', `https://buzz.happyvertical.com/git/${owner}/${repoId}.git`],
    ],
  });
}

export function createRefUpdateFixture(
  options: BuzzFixtureOptions & {
    ref?: string;
    head?: string;
    previous?: string;
    repoId?: string;
    owner?: string;
  } = {},
): NostrForgeEvent {
  const head = options.head ?? '1111111111111111111111111111111111111111';
  const previous =
    options.previous ?? '0000000000000000000000000000000000000000';
  const owner = options.owner ?? FIXTURE_PUBKEY;
  const repoId = options.repoId ?? 'happyvertical.com';
  return createBuzzFixtureEvent(BUZZ_FORGE_KINDS.refUpdate, {
    ...options,
    tags: options.tags ?? [
      ['d', repoId],
      ['p', owner],
      ['ref', options.ref ?? 'refs/heads/main'],
      ['commit', head],
      ['previous', previous],
    ],
    content:
      options.content ??
      JSON.stringify({
        ref: options.ref ?? 'refs/heads/main',
        head,
        before: previous,
      }),
  });
}

export function createPatchFixture(
  options: BuzzFixtureOptions & {
    headSha?: string;
    number?: number;
    repoId?: string;
  } = {},
): NostrForgeEvent {
  const headSha = options.headSha ?? '2222222222222222222222222222222222222222';
  return createBuzzFixtureEvent(BUZZ_FORGE_KINDS.patch, {
    ...options,
    tags: options.tags ?? [
      ['d', options.repoId ?? 'happyvertical.com'],
      ['p', FIXTURE_PUBKEY],
      ['commit', headSha],
      ['t', String(options.number ?? 1)],
      ['head-ref', 'refs/heads/feature'],
      ['base-ref', 'refs/heads/main'],
    ],
    content:
      options.content ??
      JSON.stringify({ number: options.number ?? 1, headSha }),
  });
}

export function createStatusFixture(
  options: BuzzFixtureOptions & {
    kind?:
      | typeof BUZZ_FORGE_KINDS.statusOpen
      | typeof BUZZ_FORGE_KINDS.statusApplied
      | typeof BUZZ_FORGE_KINDS.statusClosed
      | typeof BUZZ_FORGE_KINDS.statusDraft;
    context?: string;
    headSha?: string;
    conclusion?: string;
  } = {},
): NostrForgeEvent {
  const kind = options.kind ?? BUZZ_FORGE_KINDS.statusOpen;
  const headSha = options.headSha ?? '2222222222222222222222222222222222222222';
  return createBuzzFixtureEvent(kind, {
    ...options,
    pubkey: options.pubkey ?? FIXTURE_ATTESTOR,
    tags: options.tags ?? [
      ['d', 'happyvertical.com'],
      ['p', FIXTURE_PUBKEY],
      ['commit', headSha],
      ['context', options.context ?? 'ci'],
      ...(options.conclusion
        ? ([['conclusion', options.conclusion]] as const)
        : []),
    ],
    content:
      options.content ??
      JSON.stringify({
        context: options.context ?? 'ci',
        conclusion: options.conclusion ?? 'success',
        headSha,
      }),
  });
}

export function createApprovalFixture(
  options: BuzzFixtureOptions & {
    content?: string;
    headSha?: string;
    targetEventId?: string;
  } = {},
): NostrForgeEvent {
  return createBuzzFixtureEvent(BUZZ_FORGE_KINDS.reaction, {
    ...options,
    pubkey: options.pubkey ?? FIXTURE_REACTOR,
    tags: options.tags ?? [
      ['e', options.targetEventId ?? 'merge-request-event-id'],
      ['p', FIXTURE_PUBKEY],
      ['commit', options.headSha ?? '2222222222222222222222222222222222222222'],
    ],
    content: options.content ?? '✅',
  });
}

export function createMembersFixture(
  options: BuzzFixtureOptions & {
    members?: readonly { pubkey: string; role: string }[];
  } = {},
): NostrForgeEvent {
  const members = options.members ?? [
    { pubkey: FIXTURE_PUBKEY, role: 'owner' },
    { pubkey: FIXTURE_REACTOR, role: 'admin' },
    { pubkey: FIXTURE_ATTESTOR, role: 'bot' },
  ];
  return createBuzzFixtureEvent(BUZZ_FORGE_KINDS.channelMembers, {
    ...options,
    tags: options.tags ?? [
      ['d', 'channel-hv'],
      ...members.map((m) => ['p', m.pubkey, m.role] as const),
    ],
  });
}

/**
 * Deterministic sequences for convergence suites (duplicate / delayed /
 * out-of-order / replay). Each sequence is an ordered list of Nostr events;
 * consumers may reshuffle delivery while asserting identical projection state.
 */
export function createBuzzConvergenceSequences(): {
  canonical: NostrForgeEvent[];
  duplicate: NostrForgeEvent[];
  delayed: NostrForgeEvent[];
  outOfOrder: NostrForgeEvent[];
  replay: NostrForgeEvent[];
} {
  const repo = createRepositoryAnnouncementFixture({
    created_at: 1_725_000_000,
  });
  const pushH1 = createRefUpdateFixture({
    created_at: 1_725_000_010,
    head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    previous: '0000000000000000000000000000000000000000',
  });
  const patch = createPatchFixture({
    created_at: 1_725_000_020,
    headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    number: 7,
  });
  const ci = createStatusFixture({
    created_at: 1_725_000_030,
    headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    conclusion: 'success',
  });
  const approval = createApprovalFixture({
    created_at: 1_725_000_040,
    headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    targetEventId: patch.id,
  });
  const merge = createStatusFixture({
    kind: BUZZ_FORGE_KINDS.statusApplied,
    created_at: 1_725_000_050,
    headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  const pushH2 = createRefUpdateFixture({
    created_at: 1_725_000_060,
    head: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    previous: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });

  const canonical = [repo, pushH1, patch, ci, approval, merge, pushH2];
  return {
    canonical,
    // Same events delivered twice in order.
    duplicate: [...canonical, ...canonical],
    // Same events with a multi-second gap encoded via created_at only (delivery delay).
    delayed: canonical.map((event, index) =>
      createBuzzFixtureEvent(event.kind, {
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        tags: event.tags,
        content: event.content,
        sig: event.sig,
      }),
    ),
    // Later push arrives before CI/approval/merge for the prior head.
    outOfOrder: [repo, pushH1, pushH2, patch, ci, approval, merge],
    // Full replay of the canonical sequence after completion.
    replay: [...canonical, ...canonical.map((e) => ({ ...e }))],
  };
}

export const BUZZ_FIXTURE_PUBKEYS = {
  owner: FIXTURE_PUBKEY,
  attestor: FIXTURE_ATTESTOR,
  reactor: FIXTURE_REACTOR,
} as const;
