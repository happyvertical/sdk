/**
 * Tests for AWS directory adapter
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import type { AwsOptions } from '../shared/types.js';

// Mock AWS SDK clients
const mockOrgSend = vi.fn();
const mockIamSend = vi.fn();

// Use class-based mocks so constructors survive vi.restoreAllMocks()
class MockCommand {
  constructor(public input?: unknown) {}
}

vi.mock('@aws-sdk/client-organizations', () => ({
  OrganizationsClient: class {
    send = mockOrgSend;
  },
  CreateOrganizationalUnitCommand: MockCommand,
  DescribeOrganizationalUnitCommand: MockCommand,
  ListOrganizationalUnitsForParentCommand: MockCommand,
  CreateAccountCommand: MockCommand,
  DescribeCreateAccountStatusCommand: MockCommand,
  ListAccountsCommand: MockCommand,
  MoveAccountCommand: MockCommand,
}));

vi.mock('@aws-sdk/client-iam', () => ({
  IAMClient: class {
    send = mockIamSend;
  },
  CreateUserCommand: MockCommand,
  GetUserCommand: MockCommand,
  UpdateUserCommand: MockCommand,
  DeleteUserCommand: MockCommand,
  ListUsersCommand: MockCommand,
  CreateGroupCommand: MockCommand,
  GetGroupCommand: MockCommand,
  DeleteGroupCommand: MockCommand,
  ListGroupsCommand: MockCommand,
  AddUserToGroupCommand: MockCommand,
  RemoveUserFromGroupCommand: MockCommand,
  AttachUserPolicyCommand: MockCommand,
  DetachUserPolicyCommand: MockCommand,
  CreateAccessKeyCommand: MockCommand,
  DeleteAccessKeyCommand: MockCommand,
  ListGroupsForUserCommand: MockCommand,
}));

const OPTIONS: AwsOptions = {
  type: 'aws',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
};

describe('AwsAdapter', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adapter: any;

  beforeEach(async () => {
    mockOrgSend.mockReset();
    mockIamSend.mockReset();

    const { AwsAdapter } = await import('../adapters/aws.js');
    adapter = new AwsAdapter(OPTIONS);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('testConnection', () => {
    it('should return true when ListUsers succeeds', async () => {
      mockIamSend.mockResolvedValueOnce({ Users: [] });
      const result = await adapter.testConnection();
      expect(result).toBe(true);
    });

    it('should return false when call fails', async () => {
      mockIamSend.mockRejectedValueOnce(new Error('Access denied'));
      const result = await adapter.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('user CRUD (IAM Users)', () => {
    it('should create a user', async () => {
      mockIamSend.mockResolvedValueOnce({
        User: {
          UserName: 'alice',
          Arn: 'arn:aws:iam::123456789:user/alice',
          UserId: 'AIDAEXAMPLE',
          CreateDate: new Date('2024-01-01'),
        },
      });

      const user = await adapter.createUser({ username: 'alice' });
      expect(user.username).toBe('alice');
      expect(user.id).toBe('alice');
    });

    it('should get a user', async () => {
      mockIamSend.mockResolvedValueOnce({
        User: {
          UserName: 'alice',
          Arn: 'arn:aws:iam::123456789:user/alice',
          UserId: 'AIDAEXAMPLE',
        },
      });

      const user = await adapter.getUser('alice');
      expect(user.username).toBe('alice');
    });

    it('should throw NotFoundError for missing user', async () => {
      const error = new Error('NoSuchEntity');
      error.name = 'NoSuchEntityException';
      mockIamSend.mockRejectedValueOnce(error);

      await expect(adapter.getUser('missing')).rejects.toThrow(NotFoundError);
    });

    it('should list users', async () => {
      mockIamSend.mockResolvedValueOnce({
        Users: [
          {
            UserName: 'alice',
            Arn: 'arn:aws:iam::123:user/alice',
            UserId: 'A1',
          },
          { UserName: 'bob', Arn: 'arn:aws:iam::123:user/bob', UserId: 'A2' },
        ],
      });

      const users = await adapter.listUsers();
      expect(users).toHaveLength(2);
      expect(users[0].username).toBe('alice');
    });

    it('should delete a user', async () => {
      mockIamSend.mockResolvedValueOnce({});
      await expect(adapter.deleteUser('alice')).resolves.toBeUndefined();
    });

    it('should throw ConflictError on duplicate', async () => {
      const error = new Error('Entity already exists');
      error.name = 'EntityAlreadyExistsException';
      mockIamSend.mockRejectedValueOnce(error);

      await expect(adapter.createUser({ username: 'alice' })).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe('group CRUD (IAM Groups)', () => {
    it('should create a group', async () => {
      mockIamSend.mockResolvedValueOnce({
        Group: {
          GroupName: 'developers',
          Arn: 'arn:aws:iam::123:group/developers',
          GroupId: 'AGPAEXAMPLE',
        },
      });

      const group = await adapter.createGroup({ name: 'developers' });
      expect(group.name).toBe('developers');
    });

    it('should list groups', async () => {
      mockIamSend.mockResolvedValueOnce({
        Groups: [
          { GroupName: 'developers', GroupId: 'G1' },
          { GroupName: 'admins', GroupId: 'G2' },
        ],
      });

      const groups = await adapter.listGroups();
      expect(groups).toHaveLength(2);
    });
  });

  describe('membership', () => {
    it('should add user to group', async () => {
      mockIamSend.mockResolvedValueOnce({});
      await expect(
        adapter.addUserToGroup('alice', 'developers'),
      ).resolves.toBeUndefined();
    });

    it('should remove user from group', async () => {
      mockIamSend.mockResolvedValueOnce({});
      await expect(
        adapter.removeUserFromGroup('alice', 'developers'),
      ).resolves.toBeUndefined();
    });

    it('should get group members', async () => {
      mockIamSend.mockResolvedValueOnce({
        Users: [
          { UserName: 'alice', UserId: 'A1' },
          { UserName: 'bob', UserId: 'A2' },
        ],
        Group: { GroupName: 'developers' },
      });

      const members = await adapter.getGroupMembers('developers');
      expect(members).toHaveLength(2);
    });

    it('should get user groups', async () => {
      mockIamSend.mockResolvedValueOnce({
        Groups: [
          { GroupName: 'developers', GroupId: 'G1' },
          { GroupName: 'admins', GroupId: 'G2' },
        ],
      });

      const groups = await adapter.getUserGroups('alice');
      expect(groups).toHaveLength(2);
    });
  });

  describe('Organizations', () => {
    it('should create an organizational unit', async () => {
      mockOrgSend.mockResolvedValueOnce({
        OrganizationalUnit: {
          Id: 'ou-1234',
          Name: 'Production',
          Arn: 'arn:aws:organizations::123:ou/o-root/ou-1234',
        },
      });

      const ou = await adapter.createOrganizationalUnit({
        name: 'Production',
        parentId: 'r-root',
      });
      expect(ou.name).toBe('Production');
      expect(ou.id).toBe('ou-1234');
    });

    it('should list OUs', async () => {
      mockOrgSend.mockResolvedValueOnce({
        OrganizationalUnits: [
          { Id: 'ou-1', Name: 'Production' },
          { Id: 'ou-2', Name: 'Staging' },
        ],
      });

      const ous = await adapter.listOrganizationalUnits('r-root');
      expect(ous).toHaveLength(2);
    });

    it('should create an account (async)', async () => {
      mockOrgSend.mockResolvedValueOnce({
        CreateAccountStatus: {
          Id: 'car-1234',
          State: 'IN_PROGRESS',
        },
      });

      const status = await adapter.createAccount({
        name: 'Dev Account',
        email: 'dev@example.com',
      });
      expect(status.state).toBe('IN_PROGRESS');
      expect(status.id).toBe('car-1234');
    });

    it('should get account creation status', async () => {
      mockOrgSend.mockResolvedValueOnce({
        CreateAccountStatus: {
          Id: 'car-1234',
          AccountId: '123456789012',
          State: 'SUCCEEDED',
        },
      });

      const status = await adapter.getAccountCreationStatus('car-1234');
      expect(status.state).toBe('SUCCEEDED');
      expect(status.accountId).toBe('123456789012');
    });

    it('should list accounts', async () => {
      mockOrgSend.mockResolvedValueOnce({
        Accounts: [
          {
            Id: '111',
            Name: 'Dev',
            Email: 'dev@example.com',
            Status: 'ACTIVE',
          },
          {
            Id: '222',
            Name: 'Prod',
            Email: 'prod@example.com',
            Status: 'ACTIVE',
          },
        ],
      });

      const accounts = await adapter.listAccounts();
      expect(accounts).toHaveLength(2);
    });

    it('should move account between OUs', async () => {
      mockOrgSend.mockResolvedValueOnce({});
      await expect(
        adapter.moveAccount('111', 'ou-1', 'ou-2'),
      ).resolves.toBeUndefined();
    });
  });

  describe('IAM-specific operations', () => {
    it('should create an IAM user', async () => {
      mockIamSend.mockResolvedValueOnce({
        User: {
          UserName: 'deploy-bot',
          Arn: 'arn:aws:iam::123:user/deploy-bot',
          UserId: 'AIDAEXAMPLE',
        },
      });

      const user = await adapter.createIamUser({ username: 'deploy-bot' });
      expect(user.username).toBe('deploy-bot');
    });

    it('should attach a policy to user', async () => {
      mockIamSend.mockResolvedValueOnce({});
      await expect(
        adapter.attachUserPolicy(
          'alice',
          'arn:aws:iam::aws:policy/ReadOnlyAccess',
        ),
      ).resolves.toBeUndefined();
    });

    it('should detach a policy from user', async () => {
      mockIamSend.mockResolvedValueOnce({});
      await expect(
        adapter.detachUserPolicy(
          'alice',
          'arn:aws:iam::aws:policy/ReadOnlyAccess',
        ),
      ).resolves.toBeUndefined();
    });

    it('should create an access key', async () => {
      mockIamSend.mockResolvedValueOnce({
        AccessKey: {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG',
          UserName: 'alice',
          CreateDate: new Date('2024-01-01'),
        },
      });

      const key = await adapter.createAccessKey('alice');
      expect(key.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(key.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG');
      expect(key.username).toBe('alice');
    });

    it('should delete an access key', async () => {
      mockIamSend.mockResolvedValueOnce({});
      await expect(
        adapter.deleteAccessKey('alice', 'AKIAIOSFODNN7EXAMPLE'),
      ).resolves.toBeUndefined();
    });
  });
});
