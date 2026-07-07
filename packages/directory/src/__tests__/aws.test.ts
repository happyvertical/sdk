/**
 * Tests for AWS directory adapter
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  DirectoryError,
  NotFoundError,
} from '../shared/errors.js';
import type { AwsOptions } from '../shared/types.js';

// Mock AWS SDK clients
const mockOrgSend = vi.fn();
const mockIamSend = vi.fn();
const mockStsSend = vi.fn();

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
  ListParentsCommand: MockCommand,
  MoveAccountCommand: MockCommand,
  TagResourceCommand: MockCommand,
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
  CreateRoleCommand: MockCommand,
  GetRoleCommand: MockCommand,
  PutRolePolicyCommand: MockCommand,
  TagRoleCommand: MockCommand,
  UpdateAssumeRolePolicyCommand: MockCommand,
  UpdateRoleCommand: MockCommand,
}));

vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: class {
    send = mockStsSend;
  },
  AssumeRoleCommand: MockCommand,
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
    mockStsSend.mockReset();

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
        tags: { Tenant: 'anytown' },
      });
      expect(ou.name).toBe('Production');
      expect(ou.id).toBe('ou-1234');
      expect(mockOrgSend.mock.calls[0][0].input).toMatchObject({
        ParentId: 'r-root',
        Name: 'Production',
        Tags: [{ Key: 'Tenant', Value: 'anytown' }],
      });
    });

    it('should list OUs across pages', async () => {
      mockOrgSend.mockResolvedValueOnce({
        OrganizationalUnits: [{ Id: 'ou-1', Name: 'Production' }],
        NextToken: 'page-2',
      });
      mockOrgSend.mockResolvedValueOnce({
        OrganizationalUnits: [{ Id: 'ou-2', Name: 'Staging' }],
      });

      const ous = await adapter.listOrganizationalUnits('r-root');
      expect(ous).toHaveLength(2);
      expect(mockOrgSend.mock.calls[1][0].input).toMatchObject({
        ParentId: 'r-root',
        NextToken: 'page-2',
      });
    });

    it('should find an OU by name under a parent', async () => {
      mockOrgSend.mockResolvedValueOnce({
        OrganizationalUnits: [
          { Id: 'ou-1', Name: 'Production' },
          { Id: 'ou-2', Name: 'Staging' },
        ],
      });

      const ou = await adapter.findOrganizationalUnitByName(
        'r-root',
        'Staging',
      );
      expect(ou?.id).toBe('ou-2');
    });

    it('should ensure an existing OU and refresh tags', async () => {
      mockOrgSend.mockResolvedValueOnce({
        OrganizationalUnits: [{ Id: 'ou-1', Name: 'Production' }],
      });
      mockOrgSend.mockResolvedValueOnce({});

      const ou = await adapter.ensureOrganizationalUnit({
        name: 'Production',
        parentId: 'r-root',
        tags: { ManagedBy: 'directory' },
      });

      expect(ou.id).toBe('ou-1');
      expect(mockOrgSend).toHaveBeenCalledTimes(2);
      expect(mockOrgSend.mock.calls[1][0].input).toMatchObject({
        ResourceId: 'ou-1',
        Tags: [{ Key: 'ManagedBy', Value: 'directory' }],
      });
    });

    it('should create an OU when ensure cannot find one', async () => {
      mockOrgSend.mockResolvedValueOnce({ OrganizationalUnits: [] });
      mockOrgSend.mockResolvedValueOnce({
        OrganizationalUnit: { Id: 'ou-new', Name: 'Tenant' },
      });

      const ou = await adapter.ensureOrganizationalUnit({
        name: 'Tenant',
        parentId: 'r-root',
      });

      expect(ou.id).toBe('ou-new');
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
        roleName: 'OrganizationAccountAccessRole',
        tags: { Tenant: 'dev' },
      });
      expect(status.state).toBe('IN_PROGRESS');
      expect(status.id).toBe('car-1234');
      expect(mockOrgSend.mock.calls[0][0].input).toMatchObject({
        AccountName: 'Dev Account',
        Email: 'dev@example.com',
        RoleName: 'OrganizationAccountAccessRole',
        Tags: [{ Key: 'Tenant', Value: 'dev' }],
      });
    });

    it('should fail fast when account creation omits the request id', async () => {
      mockOrgSend.mockResolvedValueOnce({
        CreateAccountStatus: {
          State: 'IN_PROGRESS',
        },
      });

      await expect(
        adapter.createAccount({
          name: 'Dev Account',
          email: 'dev@example.com',
        }),
      ).rejects.toMatchObject({
        code: 'AWS_ACCOUNT_CREATION_REQUEST_ID_MISSING',
      });
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

    it('should list accounts across pages', async () => {
      mockOrgSend.mockResolvedValueOnce({
        Accounts: [
          {
            Id: '111',
            Name: 'Dev',
            Email: 'dev@example.com',
            Status: 'ACTIVE',
          },
        ],
        NextToken: 'page-2',
      });
      mockOrgSend.mockResolvedValueOnce({
        Accounts: [
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
      expect(mockOrgSend.mock.calls[1][0].input).toMatchObject({
        NextToken: 'page-2',
      });
    });

    it('should find account by email', async () => {
      mockOrgSend.mockResolvedValueOnce({
        Accounts: [
          {
            Id: '111',
            Name: 'Dev',
            Email: 'dev@example.com',
            Status: 'ACTIVE',
          },
        ],
      });

      const account = await adapter.findAccountByEmail('DEV@example.com');
      expect(account?.id).toBe('111');
    });

    it('should ensure an existing account and refresh tags', async () => {
      mockOrgSend.mockResolvedValueOnce({
        Accounts: [
          {
            Id: '111',
            Name: 'Dev',
            Email: 'dev@example.com',
            Status: 'ACTIVE',
          },
        ],
      });
      mockOrgSend.mockResolvedValueOnce({});

      const account = await adapter.ensureAccount({
        name: 'Dev',
        email: 'dev@example.com',
        tags: { Tenant: 'dev' },
      });

      expect(account.id).toBe('111');
      expect(mockOrgSend.mock.calls[1][0].input).toMatchObject({
        ResourceId: '111',
        Tags: [{ Key: 'Tenant', Value: 'dev' }],
      });
    });

    it('should create and wait for an account when ensure cannot find one', async () => {
      mockOrgSend.mockResolvedValueOnce({ Accounts: [] });
      mockOrgSend.mockResolvedValueOnce({
        CreateAccountStatus: {
          Id: 'car-1234',
          State: 'IN_PROGRESS',
        },
      });
      mockOrgSend.mockResolvedValueOnce({
        CreateAccountStatus: {
          Id: 'car-1234',
          AccountId: '123456789012',
          State: 'SUCCEEDED',
        },
      });
      mockOrgSend.mockResolvedValueOnce({
        Accounts: [
          {
            Id: '123456789012',
            Name: 'Prod',
            Email: 'prod@example.com',
            Status: 'ACTIVE',
          },
        ],
      });

      const account = await adapter.ensureAccount({
        name: 'Prod',
        email: 'prod@example.com',
        tags: { Tenant: 'prod' },
        wait: { pollIntervalMs: 0, timeoutMs: 1000 },
      });

      expect(account.id).toBe('123456789012');
      expect(mockOrgSend.mock.calls[1][0].input).toMatchObject({
        AccountName: 'Prod',
        Email: 'prod@example.com',
        Tags: [{ Key: 'Tenant', Value: 'prod' }],
      });
    });

    it('should move account between OUs', async () => {
      mockOrgSend.mockResolvedValueOnce({});
      await expect(
        adapter.moveAccount('111', 'ou-1', 'ou-2'),
      ).resolves.toBeUndefined();
    });

    it('should get the current account parent', async () => {
      mockOrgSend.mockResolvedValueOnce({
        Parents: [{ Id: 'r-root', Type: 'ROOT' }],
      });

      const parent = await adapter.getAccountParent('111');
      expect(parent).toEqual({ id: 'r-root', type: 'ROOT' });
    });

    it('should not invent an OU parent type when AWS omits the type', async () => {
      mockOrgSend.mockResolvedValueOnce({
        Parents: [{ Id: 'r-root' }],
      });

      const parent = await adapter.getAccountParent('111');
      expect(parent).toEqual({ id: 'r-root', type: '' });
    });

    it('should not move an account already under the destination parent', async () => {
      mockOrgSend.mockResolvedValueOnce({
        Parents: [{ Id: 'ou-dest', Type: 'ORGANIZATIONAL_UNIT' }],
      });

      await adapter.ensureAccountInOrganizationalUnit('111', 'ou-dest');
      expect(mockOrgSend).toHaveBeenCalledTimes(1);
    });

    it('should move an account from its current parent to the destination OU', async () => {
      mockOrgSend.mockResolvedValueOnce({
        Parents: [{ Id: 'r-root', Type: 'ROOT' }],
      });
      mockOrgSend.mockResolvedValueOnce({});

      await adapter.ensureAccountInOrganizationalUnit('111', 'ou-dest');
      expect(mockOrgSend.mock.calls[1][0].input).toMatchObject({
        AccountId: '111',
        SourceParentId: 'r-root',
        DestinationParentId: 'ou-dest',
      });
    });

    it('should report missing account parent state without NotFoundError', async () => {
      mockOrgSend.mockResolvedValueOnce({ Parents: [] });

      let thrown: unknown;
      try {
        await adapter.ensureAccountInOrganizationalUnit('111', 'ou-dest');
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(DirectoryError);
      expect(thrown).not.toBeInstanceOf(NotFoundError);
      expect(thrown).toMatchObject({ code: 'AWS_ACCOUNT_PARENT_MISSING' });
    });

    it('should tag an Organizations resource', async () => {
      mockOrgSend.mockResolvedValueOnce({});
      await adapter.tagAwsOrganizationsResource('ou-1', {
        Tenant: 'example',
      });
      expect(mockOrgSend.mock.calls[0][0].input).toMatchObject({
        ResourceId: 'ou-1',
        Tags: [{ Key: 'Tenant', Value: 'example' }],
      });
    });

    it('should preserve empty AWS tag values and skip only empty keys', async () => {
      mockOrgSend.mockResolvedValueOnce({});
      await adapter.tagAwsOrganizationsResource('ou-1', {
        Tenant: '',
        '': 'ignored',
      });
      expect(mockOrgSend.mock.calls[0][0].input).toMatchObject({
        ResourceId: 'ou-1',
        Tags: [{ Key: 'Tenant', Value: '' }],
      });
    });
  });

  describe('STS operations', () => {
    it('should assume an AWS role', async () => {
      const expiration = new Date('2026-01-01T00:00:00.000Z');
      mockStsSend.mockResolvedValueOnce({
        Credentials: {
          AccessKeyId: 'ASIATEMP',
          SecretAccessKey: 'secret',
          SessionToken: 'token',
          Expiration: expiration,
        },
        AssumedRoleUser: {
          Arn: 'arn:aws:sts::123:assumed-role/Role/session',
          AssumedRoleId: 'ARO123:session',
        },
      });

      const credentials = await adapter.assumeAwsRole({
        roleArn: 'arn:aws:iam::123:role/Role',
        sessionName: 'session',
        externalId: 'external',
        durationSeconds: 900,
      });

      expect(credentials.accessKeyId).toBe('ASIATEMP');
      expect(credentials.sessionToken).toBe('token');
      expect(mockStsSend.mock.calls[0][0].input).toMatchObject({
        RoleArn: 'arn:aws:iam::123:role/Role',
        RoleSessionName: 'session',
        ExternalId: 'external',
        DurationSeconds: 900,
      });
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

    it('should get an IAM role', async () => {
      mockIamSend.mockResolvedValueOnce({
        Role: {
          RoleName: 'TenantDeploy',
          Arn: 'arn:aws:iam::123:role/TenantDeploy',
          RoleId: 'ARO123',
        },
      });

      const role = await adapter.getIamRole('TenantDeploy');
      expect(role.roleName).toBe('TenantDeploy');
    });

    it('should update trust policy for an existing IAM role', async () => {
      mockIamSend.mockResolvedValueOnce({
        Role: {
          RoleName: 'TenantDeploy',
          Arn: 'arn:aws:iam::123:role/TenantDeploy',
          AssumeRolePolicyDocument: 'old-policy',
        },
      });
      mockIamSend.mockResolvedValueOnce({});
      mockIamSend.mockResolvedValueOnce({});
      mockIamSend.mockResolvedValueOnce({});
      mockIamSend.mockResolvedValueOnce({
        Role: {
          RoleName: 'TenantDeploy',
          Arn: 'arn:aws:iam::123:role/TenantDeploy',
          AssumeRolePolicyDocument: 'new-policy',
        },
      });

      const role = await adapter.ensureIamRole({
        roleName: 'TenantDeploy',
        assumeRolePolicyDocument: 'new-policy',
        description: 'Tenant deployment role',
        tags: { Tenant: 'example' },
      });

      expect(role.roleName).toBe('TenantDeploy');
      expect(role.assumeRolePolicyDocument).toBe('new-policy');
      expect(mockIamSend.mock.calls[1][0].input).toMatchObject({
        RoleName: 'TenantDeploy',
        PolicyDocument: 'new-policy',
      });
      expect(mockIamSend.mock.calls[2][0].input).toMatchObject({
        RoleName: 'TenantDeploy',
        Description: 'Tenant deployment role',
      });
      expect(mockIamSend.mock.calls[3][0].input).toMatchObject({
        RoleName: 'TenantDeploy',
        Tags: [{ Key: 'Tenant', Value: 'example' }],
      });
    });

    it('should create a missing IAM role', async () => {
      const error = new Error('NoSuchEntity');
      error.name = 'NoSuchEntityException';
      mockIamSend.mockRejectedValueOnce(error);
      mockIamSend.mockResolvedValueOnce({
        Role: {
          RoleName: 'TenantDeploy',
          Arn: 'arn:aws:iam::123:role/TenantDeploy',
        },
      });

      const role = await adapter.ensureIamRole({
        roleName: 'TenantDeploy',
        assumeRolePolicyDocument: '{"Version":"2012-10-17"}',
        description: 'Tenant deployment role',
        tags: { Tenant: 'example' },
      });

      expect(role.roleName).toBe('TenantDeploy');
      expect(mockIamSend.mock.calls[1][0].input).toMatchObject({
        RoleName: 'TenantDeploy',
        AssumeRolePolicyDocument: '{"Version":"2012-10-17"}',
        Description: 'Tenant deployment role',
        Tags: [{ Key: 'Tenant', Value: 'example' }],
      });
    });

    it('should put an inline IAM role policy', async () => {
      mockIamSend.mockResolvedValueOnce({});
      await adapter.putIamRolePolicy({
        roleName: 'TenantDeploy',
        policyName: 'TenantDeployPolicy',
        policyDocument: '{"Version":"2012-10-17"}',
      });

      expect(mockIamSend.mock.calls[0][0].input).toMatchObject({
        RoleName: 'TenantDeploy',
        PolicyName: 'TenantDeployPolicy',
        PolicyDocument: '{"Version":"2012-10-17"}',
      });
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
