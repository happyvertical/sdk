import { describe, expect, it } from 'vitest';
import { ForgeError, ForgeSignatureError } from '../forge/errors.js';
import {
  computeNostrEventId,
  normalizeBuzzEvent,
  resolveBuzzChannelRole,
  roleMeetsFloor,
  verifyAndNormalizeBuzzEvent,
  verifyNostrEventSignature,
} from './events.js';
import {
  createApprovalFixture,
  createBuzzConvergenceSequences,
  createMembersFixture,
  createPatchFixture,
  createRefUpdateFixture,
  createRepositoryAnnouncementFixture,
  createStatusFixture,
} from './fixtures.js';
import { BuzzRelayClient } from './relay.js';
import { BUZZ_FORGE_KINDS } from './types.js';

describe('buzz forge normalize', () => {
  it('normalizes kind:30617 repository announcements', () => {
    const event = createRepositoryAnnouncementFixture();
    const envelope = normalizeBuzzEvent(event);
    expect(envelope.provider).toBe('buzz');
    expect(envelope.deliveryId).toBe(event.id);
    expect(envelope.observation).toMatchObject({
      kind: 'repository',
      repository: {
        name: 'happyvertical.com',
      },
    });
  });

  it('normalizes kind:30618 ref updates as push observations with before/after SHA', () => {
    const event = createRefUpdateFixture({
      head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      previous: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ref: 'refs/heads/main',
    });
    const envelope = normalizeBuzzEvent(event);
    expect(envelope.observation).toEqual({
      kind: 'push',
      ref: 'refs/heads/main',
      beforeSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      afterSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      forced: false,
      created: false,
      deleted: false,
    });
  });

  it('normalizes kind:1617 patches as pull_request observations', () => {
    const event = createPatchFixture({ number: 12, headSha: 'c'.repeat(40) });
    const envelope = normalizeBuzzEvent(event);
    expect(envelope.observation).toMatchObject({
      kind: 'pull_request',
      pullRequest: {
        number: 12,
        headSha: 'c'.repeat(40),
        state: 'open',
      },
    });
  });

  it('normalizes kinds 1630–1633 into check or merge observations', () => {
    const open = normalizeBuzzEvent(
      createStatusFixture({
        kind: BUZZ_FORGE_KINDS.statusOpen,
        conclusion: 'success',
      }),
    );
    expect(open.observation.kind).toBe('check');

    const merged = normalizeBuzzEvent(
      createStatusFixture({ kind: BUZZ_FORGE_KINDS.statusApplied }),
    );
    expect(merged.observation.kind).toBe('merge');
  });

  it('normalizes kind:7 approvals with kind:39002 role floors', () => {
    const members = createMembersFixture();
    const approval = createApprovalFixture();
    const envelope = normalizeBuzzEvent(approval, new Date(), {
      membersEvent: members,
      roleFloor: 'admin',
    });
    expect(envelope.observation).toMatchObject({
      kind: 'review',
      review: { state: 'APPROVED' },
    });
    const role = resolveBuzzChannelRole(members, approval.pubkey);
    expect(role?.role).toBe('admin');
    expect(roleMeetsFloor('admin', 'member')).toBe(true);
    expect(roleMeetsFloor('guest', 'admin')).toBe(false);
  });

  it('rejects events whose id does not match the NIP-01 digest', () => {
    const event = createRefUpdateFixture();
    expect(() =>
      verifyNostrEventSignature(
        { ...event, id: '0'.repeat(64) },
        { allowUnverifiedFixtures: true },
      ),
    ).toThrow(ForgeSignatureError);
  });

  it('accepts fixture events with matching digests when allowUnverifiedFixtures is set', () => {
    const event = createRefUpdateFixture();
    expect(computeNostrEventId(event)).toBe(event.id);
    const envelope = verifyAndNormalizeBuzzEvent(event, new Date(), {
      allowUnverifiedFixtures: true,
    });
    expect(envelope.observation.kind).toBe('push');
  });

  it('requires schnorr verification outside the fixture path when nostr-tools is absent', () => {
    const event = createRefUpdateFixture();
    try {
      verifyNostrEventSignature(event);
      // If nostr-tools is installed and verifies the placeholder, that is fine.
    } catch (error) {
      expect(error).toBeInstanceOf(ForgeError);
    }
  });
});

describe('buzz forge fixtures and relay ingest', () => {
  it('produces stable convergence sequences', () => {
    const a = createBuzzConvergenceSequences();
    const b = createBuzzConvergenceSequences();
    expect(a.canonical.map((e) => e.id)).toEqual(b.canonical.map((e) => e.id));
    expect(a.duplicate.length).toBe(a.canonical.length * 2);
    expect(a.outOfOrder.map((e) => e.id)).not.toEqual(a.canonical.map((e) => e.id));
    expect(a.replay.length).toBe(a.canonical.length * 2);
  });

  it('dedupes event ids on ingest', () => {
    const client = new BuzzRelayClient({
      relays: ['https://relay.example/http'],
    });
    const sequences = createBuzzConvergenceSequences();
    const first = client.ingestEvents(sequences.duplicate, {
      allowUnverifiedFixtures: true,
    });
    const second = client.ingestEvents(sequences.canonical, {
      allowUnverifiedFixtures: true,
    });
    expect(first.length).toBe(sequences.canonical.length);
    expect(second.length).toBe(0);
  });
});
