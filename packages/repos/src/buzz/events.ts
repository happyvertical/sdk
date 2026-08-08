import { createHash } from 'node:crypto';
import { verifyEvent } from 'nostr-tools';
import { ForgeError, ForgeSignatureError } from '../forge/errors.js';
import type {
  CheckRun,
  ForgeActor,
  ForgeEventEnvelope,
  ForgeObservation,
  ForgePullRequestRef,
  ForgeRepositoryRef,
} from '../forge/types.js';
import {
  BUZZ_FORGE_KINDS,
  type BuzzChannelRole,
  type BuzzRoleResolution,
  type NostrForgeEvent,
} from './types.js';

const ROLE_RANK: Record<BuzzChannelRole, number> = {
  owner: 40,
  admin: 30,
  member: 20,
  guest: 10,
  bot: 5,
};

/**
 * Compute the NIP-01 event id for a Nostr event (sha256 of serialized fields).
 * Used by fixtures and verification when the caller supplies an unsigned skeleton.
 */
export function computeNostrEventId(
  event: Omit<NostrForgeEvent, 'id' | 'sig'>,
): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return createHash('sha256').update(serialized).digest('hex');
}

function tagValue(event: NostrForgeEvent, name: string): string | undefined {
  for (const tag of event.tags) {
    if (tag[0] === name && typeof tag[1] === 'string' && tag[1] !== '') {
      return tag[1];
    }
  }
  return undefined;
}

function optionalJson(content: string): Record<string, unknown> {
  if (!content) return {};
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function actorFromPubkey(pubkey: string): ForgeActor {
  return {
    id: pubkey,
    login: pubkey,
    type: 'User',
  };
}

function repositoryFromEvent(event: NostrForgeEvent): ForgeRepositoryRef {
  const owner =
    tagValue(event, 'p') ?? tagValue(event, 'owner') ?? event.pubkey;
  const name =
    tagValue(event, 'd') ??
    tagValue(event, 'repo') ??
    tagValue(event, 'name') ??
    'unknown';
  const fullName =
    tagValue(event, 'a')?.replace(/^30617:/, '') ?? `${owner}/${name}`;
  return {
    id: tagValue(event, 'repo-id') ?? fullName,
    owner,
    name: name.includes('/') ? (name.split('/').pop() ?? name) : name,
    fullName: fullName.includes('/') ? fullName : `${owner}/${name}`,
    url: tagValue(event, 'clone') ?? tagValue(event, 'url'),
  };
}

function pullRequestFromEvent(event: NostrForgeEvent): ForgePullRequestRef {
  const body = optionalJson(event.content);
  const numberRaw =
    tagValue(event, 't') ??
    tagValue(event, 'pr') ??
    (typeof body.number === 'number' || typeof body.number === 'string'
      ? String(body.number)
      : '0');
  const number = Number.parseInt(numberRaw, 10);
  const headSha =
    tagValue(event, 'commit') ??
    tagValue(event, 'head') ??
    (typeof body.headSha === 'string' ? body.headSha : '') ??
    (typeof body.head_sha === 'string' ? body.head_sha : '') ??
    '';
  const stateTag = tagValue(event, 'status') ?? tagValue(event, 'state');
  const state =
    stateTag === 'closed' ||
    stateTag === 'merged' ||
    event.kind === BUZZ_FORGE_KINDS.statusClosed
      ? 'closed'
      : 'open';
  return {
    id: event.id,
    number: Number.isFinite(number) && number > 0 ? number : 0,
    state,
    headSha,
    headRef: tagValue(event, 'head-ref') ?? tagValue(event, 'branch'),
    baseSha: tagValue(event, 'base') ?? tagValue(event, 'base-sha'),
    baseRef: tagValue(event, 'base-ref') ?? 'refs/heads/main',
    merged:
      event.kind === BUZZ_FORGE_KINDS.statusApplied ||
      stateTag === 'merged' ||
      body.merged === true,
    mergeCommitSha:
      typeof body.mergeCommitSha === 'string'
        ? body.mergeCommitSha
        : tagValue(event, 'merge-commit'),
    url: tagValue(event, 'url'),
  };
}

function pullRequestForReaction(
  event: NostrForgeEvent,
  referencedPatchEvent?: NostrForgeEvent,
): ForgePullRequestRef {
  const pullRequest = pullRequestFromEvent(event);
  if (pullRequest.number > 0) return pullRequest;
  const targetId = tagValue(event, 'e');
  if (
    targetId &&
    referencedPatchEvent?.id === targetId &&
    referencedPatchEvent.kind === BUZZ_FORGE_KINDS.patch
  ) {
    return pullRequestFromEvent(referencedPatchEvent);
  }
  throw new ForgeError(
    'Buzz approval reaction must include pull-request metadata or its referenced patch event',
    'INVALID_INPUT',
    { provider: 'buzz' },
  );
}

function checkFromStatusEvent(event: NostrForgeEvent): CheckRun {
  const body = optionalJson(event.content);
  const context =
    tagValue(event, 'context') ??
    tagValue(event, 'l') ??
    (typeof body.context === 'string' ? body.context : 'ci');
  const conclusionRaw =
    tagValue(event, 'conclusion') ??
    (typeof body.conclusion === 'string' ? body.conclusion : undefined) ??
    (typeof body.state === 'string' ? body.state : undefined);
  let conclusion: CheckRun['conclusion'];
  let status: CheckRun['status'] = 'completed';
  if (
    conclusionRaw === 'success' ||
    conclusionRaw === 'failure' ||
    conclusionRaw === 'neutral' ||
    conclusionRaw === 'cancelled' ||
    conclusionRaw === 'skipped' ||
    conclusionRaw === 'timed_out' ||
    conclusionRaw === 'action_required' ||
    conclusionRaw === 'stale' ||
    conclusionRaw === 'startup_failure'
  ) {
    conclusion = conclusionRaw;
  } else if (event.kind === BUZZ_FORGE_KINDS.statusApplied) {
    conclusion = 'success';
  } else if (event.kind === BUZZ_FORGE_KINDS.statusClosed) {
    conclusion = 'cancelled';
  } else if (event.kind === BUZZ_FORGE_KINDS.statusDraft) {
    status = 'in_progress';
    conclusion = undefined;
  } else {
    status = 'queued';
    conclusion = undefined;
  }
  return {
    id: event.id,
    name: context,
    headSha:
      tagValue(event, 'commit') ??
      tagValue(event, 'head') ??
      (typeof body.headSha === 'string' ? body.headSha : '') ??
      '',
    status,
    conclusion,
    detailsUrl: tagValue(event, 'url'),
    startedAt: new Date(event.created_at * 1000),
    completedAt:
      status === 'completed' ? new Date(event.created_at * 1000) : undefined,
    raw: event as unknown as Record<string, unknown>,
  };
}

/**
 * Resolve a reactor's channel role from a kind:39002 members list.
 * Returns null when the pubkey is absent from the membership event.
 */
export function resolveBuzzChannelRole(
  membersEvent: NostrForgeEvent,
  pubkey: string,
): BuzzRoleResolution | null {
  if (membersEvent.kind !== BUZZ_FORGE_KINDS.channelMembers) {
    throw new ForgeError(
      'Role resolution requires a kind:39002 members event',
      'INVALID_INPUT',
      { provider: 'buzz' },
    );
  }
  for (const tag of membersEvent.tags) {
    if (tag[0] !== 'p' || tag[1] !== pubkey) continue;
    const roleRaw = (tag[2] ?? 'member').toLowerCase();
    const role: BuzzChannelRole =
      roleRaw === 'owner' ||
      roleRaw === 'admin' ||
      roleRaw === 'member' ||
      roleRaw === 'guest' ||
      roleRaw === 'bot'
        ? roleRaw
        : 'member';
    return { pubkey, role };
  }
  return null;
}

/** True when the reactor's role rank is at or above the configured floor. */
export function roleMeetsFloor(
  role: BuzzChannelRole,
  floor: BuzzChannelRole,
): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[floor];
}

/**
 * Normalize one already-verified Nostr forge event into a provider-neutral
 * envelope. Signature verification is the caller's responsibility (or use
 * {@link verifyAndNormalizeBuzzEvent}).
 */
export function normalizeBuzzEvent(
  event: NostrForgeEvent,
  receivedAt = new Date(),
  options: {
    roleFloor?: BuzzChannelRole;
    membersEvent?: NostrForgeEvent;
    referencedPatchEvent?: NostrForgeEvent;
  } = {},
): ForgeEventEnvelope {
  const repository = repositoryFromEvent(event);
  const actor = actorFromPubkey(event.pubkey);
  const observation = normalizeObservation(event, options);
  return {
    provider: 'buzz',
    deliveryId: event.id,
    event: String(event.kind),
    action: tagValue(event, 'action'),
    occurredAt: new Date(event.created_at * 1000),
    receivedAt,
    repository,
    actor,
    observation,
    raw: event,
  };
}

function normalizeObservation(
  event: NostrForgeEvent,
  options: {
    roleFloor?: BuzzChannelRole;
    membersEvent?: NostrForgeEvent;
    referencedPatchEvent?: NostrForgeEvent;
  },
): ForgeObservation {
  switch (event.kind) {
    case BUZZ_FORGE_KINDS.repositoryAnnouncement:
      return {
        kind: 'repository',
        repository: repositoryFromEvent(event),
      };
    case BUZZ_FORGE_KINDS.refUpdate: {
      const body = optionalJson(event.content);
      const ref =
        tagValue(event, 'ref') ??
        (typeof body.ref === 'string' ? body.ref : 'refs/heads/main');
      const afterSha =
        tagValue(event, 'commit') ??
        tagValue(event, 'head') ??
        (typeof body.head === 'string' ? body.head : '') ??
        (typeof body.after === 'string' ? body.after : '') ??
        '';
      const beforeSha =
        tagValue(event, 'previous') ??
        tagValue(event, 'before') ??
        (typeof body.before === 'string' ? body.before : undefined) ??
        (typeof body.previous === 'string' ? body.previous : undefined);
      return {
        kind: 'push',
        ref,
        beforeSha,
        afterSha,
        forced: body.forced === true,
        created: body.created === true,
        deleted:
          body.deleted === true ||
          afterSha === '' ||
          afterSha === '0'.repeat(40),
      };
    }
    case BUZZ_FORGE_KINDS.patch:
      return {
        kind: 'pull_request',
        pullRequest: pullRequestFromEvent(event),
      };
    case BUZZ_FORGE_KINDS.statusOpen:
    case BUZZ_FORGE_KINDS.statusDraft:
      return {
        kind: 'check',
        check: checkFromStatusEvent(event),
      };
    case BUZZ_FORGE_KINDS.statusClosed:
      return {
        kind: 'check',
        check: checkFromStatusEvent(event),
      };
    case BUZZ_FORGE_KINDS.statusApplied: {
      // kind:1631 is posted after a coordinator merge (ADR-002).
      const pullRequest = pullRequestFromEvent(event);
      return {
        kind: 'merge',
        pullRequest: { ...pullRequest, state: 'closed', merged: true },
        mergeCommitSha: pullRequest.mergeCommitSha ?? pullRequest.headSha,
      };
    }
    case BUZZ_FORGE_KINDS.reaction: {
      const body = optionalJson(event.content);
      const content =
        event.content.trim() ||
        (typeof body.content === 'string' ? body.content : '');
      const isApproval =
        content === '✅' ||
        content === '+' ||
        content.toLowerCase() === 'approved' ||
        body.approved === true;
      const commitSha =
        tagValue(event, 'commit') ??
        tagValue(event, 'e') ??
        (typeof body.commitSha === 'string' ? body.commitSha : undefined);
      let author = actorFromPubkey(event.pubkey);
      const pullRequest = pullRequestForReaction(
        event,
        options.referencedPatchEvent,
      );
      if (options.membersEvent) {
        const resolved = resolveBuzzChannelRole(
          options.membersEvent,
          event.pubkey,
        );
        if (!resolved) {
          throw new ForgeError(
            'Buzz approval actor is not a member of the configured channel',
            'AUTHORITY_MISMATCH',
            { provider: 'buzz' },
          );
        }
        author = { ...author, type: `role:${resolved.role}` };
        const floor = options.roleFloor ?? 'member';
        if (!roleMeetsFloor(resolved.role, floor)) {
          return {
            kind: 'review',
            pullRequest,
            review: {
              id: event.id,
              state: 'COMMENTED',
              body: content,
              commitSha,
              submittedAt: new Date(event.created_at * 1000),
              author,
            },
          };
        }
      }
      return {
        kind: 'review',
        pullRequest,
        review: {
          id: event.id,
          state: isApproval ? 'APPROVED' : 'COMMENTED',
          body: content,
          commitSha,
          submittedAt: new Date(event.created_at * 1000),
          author,
        },
      };
    }
    default:
      return { kind: 'unknown' };
  }
}

/**
 * Structural signature verification for Nostr events.
 *
 * When `nostr-tools` is available it performs full Schnorr verification.
 * Otherwise it fails closed unless `allowUnverifiedFixtures` is set (tests
 * that inject pre-trusted fixture events with matching id digests).
 */
export function verifyNostrEventSignature(
  event: NostrForgeEvent,
  options: { allowUnverifiedFixtures?: boolean } = {},
): void {
  if (!event.id || !event.pubkey || !event.sig) {
    throw new ForgeSignatureError(
      'Buzz forge event is missing id, pubkey, or sig',
    );
  }
  const expectedId = computeNostrEventId({
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
  });
  if (expectedId !== event.id) {
    throw new ForgeSignatureError(
      'Buzz forge event id does not match NIP-01 digest',
    );
  }
  if (options.allowUnverifiedFixtures) {
    // Fixture path: id digest already matched; signature bytes are placeholders.
    if (event.sig.length < 64) {
      throw new ForgeSignatureError(
        'Buzz forge fixture signature is malformed',
      );
    }
    return;
  }
  if (!verifyEvent(event as never)) {
    throw new ForgeSignatureError(
      'Buzz forge event Schnorr signature is invalid',
    );
  }
}

/**
 * Verify then normalize a buzz forge event. Rejects invalid signatures without
 * producing an observation.
 */
export function verifyAndNormalizeBuzzEvent(
  event: NostrForgeEvent,
  receivedAt = new Date(),
  options: {
    roleFloor?: BuzzChannelRole;
    membersEvent?: NostrForgeEvent;
    referencedPatchEvent?: NostrForgeEvent;
    allowUnverifiedFixtures?: boolean;
  } = {},
): ForgeEventEnvelope {
  verifyNostrEventSignature(event, {
    allowUnverifiedFixtures: options.allowUnverifiedFixtures,
  });
  return normalizeBuzzEvent(event, receivedAt, {
    roleFloor: options.roleFloor,
    membersEvent: options.membersEvent,
    referencedPatchEvent: options.referencedPatchEvent,
  });
}

/** Extract a channel id from common buzz tags when present. */
export function channelIdFromEvent(event: NostrForgeEvent): string | undefined {
  return tagValue(event, 'channel') ?? tagValue(event, 'h');
}
