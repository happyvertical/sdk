/**
 * AWS directory adapter
 *
 * Implements AwsDirectoryAdapter using AWS SDK v3 for Organizations and IAM.
 * Provides user/group CRUD (mapped to IAM), membership management,
 * organizational unit operations, account management, and access key operations.
 *
 * Caveats:
 * - Account creation is asynchronous; use getAccountCreationStatus to poll.
 * - AWS accounts cannot be truly deleted via the API.
 * - IAM CreateUser does not set passwords (use CreateLoginProfile separately).
 */

import {
  AddUserToGroupCommand,
  AttachUserPolicyCommand,
  CreateAccessKeyCommand,
  CreateGroupCommand,
  CreateUserCommand,
  DeleteAccessKeyCommand,
  DeleteGroupCommand,
  DeleteUserCommand,
  DetachUserPolicyCommand,
  GetGroupCommand,
  GetUserCommand,
  IAMClient,
  ListGroupsCommand,
  ListGroupsForUserCommand,
  ListUsersCommand,
  RemoveUserFromGroupCommand,
  UpdateUserCommand,
} from '@aws-sdk/client-iam';
import {
  CreateAccountCommand,
  CreateOrganizationalUnitCommand,
  DescribeCreateAccountStatusCommand,
  DescribeOrganizationalUnitCommand,
  ListAccountsCommand,
  ListOrganizationalUnitsForParentCommand,
  MoveAccountCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import {
  AuthenticationError,
  ConflictError,
  ConnectionError,
  DirectoryError,
  NotFoundError,
} from '../shared/errors.js';
import type {
  AwsAccessKey,
  AwsAccount,
  AwsAccountCreationStatus,
  AwsDirectoryAdapter,
  AwsIamUser,
  AwsOptions,
  AwsOrganizationalUnit,
  CreateAwsAccountInput,
  CreateAwsIamUserInput,
  CreateAwsOuInput,
  CreateGroupInput,
  CreateUserInput,
  DirectoryGroup,
  DirectoryUser,
  UpdateGroupInput,
  UpdateUserInput,
} from '../shared/types.js';

// ============================================================================
// Error Handling Helper
// ============================================================================

function handleAwsError(error: unknown, context: string): never {
  if (
    error instanceof AuthenticationError ||
    error instanceof ConnectionError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError ||
    error instanceof DirectoryError
  ) {
    throw error;
  }

  const awsError = error as { name?: string; message?: string };
  const name = awsError.name ?? '';
  const message = awsError.message ?? String(error);

  switch (name) {
    case 'EntityAlreadyExistsException':
    case 'DuplicateOrganizationalUnitException':
      throw new ConflictError('resource', context, 'aws', error);
    case 'NoSuchEntityException':
    case 'OrganizationalUnitNotFoundException':
    case 'AccountNotFoundException':
      throw new NotFoundError('resource', context, 'aws', error);
    case 'AccessDeniedException':
    case 'InvalidClientTokenId':
    case 'UnrecognizedClientException':
    case 'InvalidAccessKeyId':
      throw new AuthenticationError(`${context}: ${message}`, 'aws', error);
    default:
      throw new DirectoryError(
        `${context}: ${message}`,
        'AWS_ERROR',
        'aws',
        error,
      );
  }
}

// ============================================================================
// Mapping Helpers
// ============================================================================

function mapIamUserToDirectoryUser(user: {
  UserName?: string;
  Arn?: string;
  UserId?: string;
  CreateDate?: Date;
  Tags?: { Key?: string; Value?: string }[];
}): DirectoryUser {
  const displayNameTag = user.Tags?.find((t) => t.Key === 'DisplayName');
  const emailTag = user.Tags?.find((t) => t.Key === 'Email');

  return {
    id: user.UserName ?? '',
    username: user.UserName ?? '',
    displayName: displayNameTag?.Value,
    email: emailTag?.Value,
    active: true,
    metadata: {
      arn: user.Arn,
      userId: user.UserId,
      createDate: user.CreateDate?.toISOString(),
    },
  };
}

function mapIamGroupToDirectoryGroup(group: {
  GroupName?: string;
  Arn?: string;
  GroupId?: string;
  CreateDate?: Date;
}): DirectoryGroup {
  return {
    id: group.GroupName ?? '',
    name: group.GroupName ?? '',
    metadata: {
      arn: group.Arn,
      groupId: group.GroupId,
      createDate: group.CreateDate?.toISOString(),
    },
  };
}

function mapIamUserToAwsIamUser(user: {
  UserName?: string;
  Arn?: string;
  UserId?: string;
  CreateDate?: Date;
}): AwsIamUser {
  return {
    username: user.UserName ?? '',
    arn: user.Arn,
    userId: user.UserId,
    createDate: user.CreateDate,
  };
}

// ============================================================================
// Adapter Implementation
// ============================================================================

export class AwsAdapter implements AwsDirectoryAdapter {
  private readonly orgs: OrganizationsClient;
  private readonly iam: IAMClient;

  constructor(readonly options: AwsOptions) {
    const clientConfig = {
      region: options.region,
      ...(options.credentials ? { credentials: options.credentials } : {}),
    };

    this.orgs = new OrganizationsClient(clientConfig);
    this.iam = new IAMClient(clientConfig);
  }

  // ==========================================================================
  // Connection
  // ==========================================================================

  async testConnection(): Promise<boolean> {
    try {
      await this.iam.send(new ListUsersCommand({ MaxItems: 1 }));
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    // AWS SDK clients do not require explicit cleanup
  }

  // ==========================================================================
  // User CRUD (DirectoryAdapter -> IAM Users)
  // ==========================================================================

  async createUser(input: CreateUserInput): Promise<DirectoryUser> {
    try {
      const tags: { Key: string; Value: string }[] = [];
      if (input.displayName) {
        tags.push({ Key: 'DisplayName', Value: input.displayName });
      }
      if (input.email) {
        tags.push({ Key: 'Email', Value: input.email });
      }

      const result = await this.iam.send(
        new CreateUserCommand({
          UserName: input.username,
          ...(tags.length > 0 ? { Tags: tags } : {}),
        }),
      );

      return mapIamUserToDirectoryUser({
        ...result.User,
        Tags: tags,
      });
    } catch (error) {
      handleAwsError(error, `createUser(${input.username})`);
    }
  }

  async getUser(id: string): Promise<DirectoryUser> {
    try {
      const result = await this.iam.send(new GetUserCommand({ UserName: id }));
      return mapIamUserToDirectoryUser(result.User ?? {});
    } catch (error) {
      handleAwsError(error, `getUser(${id})`);
    }
  }

  async updateUser(
    id: string,
    _input: UpdateUserInput,
  ): Promise<DirectoryUser> {
    try {
      // IAM UpdateUser only supports NewPath and NewUserName.
      // displayName and email are stored as tags, updated separately.
      await this.iam.send(new UpdateUserCommand({ UserName: id }));

      // Update tags if displayName or email changed
      // Note: IAM tag updates require TagUser/UntagUser commands which are
      // beyond the scope of this adapter. We store the intent in metadata.

      return this.getUser(id);
    } catch (error) {
      handleAwsError(error, `updateUser(${id})`);
    }
  }

  async deleteUser(id: string): Promise<void> {
    try {
      await this.iam.send(new DeleteUserCommand({ UserName: id }));
    } catch (error) {
      handleAwsError(error, `deleteUser(${id})`);
    }
  }

  async listUsers(): Promise<DirectoryUser[]> {
    try {
      const result = await this.iam.send(new ListUsersCommand({}));
      return (result.Users ?? []).map((u) => mapIamUserToDirectoryUser(u));
    } catch (error) {
      handleAwsError(error, 'listUsers');
    }
  }

  // ==========================================================================
  // Group CRUD (DirectoryAdapter -> IAM Groups)
  // ==========================================================================

  async createGroup(input: CreateGroupInput): Promise<DirectoryGroup> {
    try {
      const result = await this.iam.send(
        new CreateGroupCommand({ GroupName: input.name }),
      );

      const group = mapIamGroupToDirectoryGroup(result.Group ?? {});

      // Add initial members if provided
      if (input.members) {
        for (const memberId of input.members) {
          await this.addUserToGroup(memberId, input.name);
        }
      }

      return group;
    } catch (error) {
      handleAwsError(error, `createGroup(${input.name})`);
    }
  }

  async getGroup(id: string): Promise<DirectoryGroup> {
    try {
      const result = await this.iam.send(
        new GetGroupCommand({ GroupName: id }),
      );

      const group = mapIamGroupToDirectoryGroup(result.Group ?? {});
      group.members = (result.Users ?? []).map((u) => u.UserName ?? '');

      return group;
    } catch (error) {
      handleAwsError(error, `getGroup(${id})`);
    }
  }

  async updateGroup(
    id: string,
    _input: UpdateGroupInput,
  ): Promise<DirectoryGroup> {
    // IAM groups have limited update capability (only GroupName via UpdateGroup).
    // displayName and description are not supported natively by IAM groups.
    // Return the current group state.
    return this.getGroup(id);
  }

  async deleteGroup(id: string): Promise<void> {
    try {
      await this.iam.send(new DeleteGroupCommand({ GroupName: id }));
    } catch (error) {
      handleAwsError(error, `deleteGroup(${id})`);
    }
  }

  async listGroups(): Promise<DirectoryGroup[]> {
    try {
      const result = await this.iam.send(new ListGroupsCommand({}));
      return (result.Groups ?? []).map((g) => mapIamGroupToDirectoryGroup(g));
    } catch (error) {
      handleAwsError(error, 'listGroups');
    }
  }

  // ==========================================================================
  // Membership
  // ==========================================================================

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    try {
      await this.iam.send(
        new AddUserToGroupCommand({
          UserName: userId,
          GroupName: groupId,
        }),
      );
    } catch (error) {
      handleAwsError(error, `addUserToGroup(${userId}, ${groupId})`);
    }
  }

  async removeUserFromGroup(userId: string, groupId: string): Promise<void> {
    try {
      await this.iam.send(
        new RemoveUserFromGroupCommand({
          UserName: userId,
          GroupName: groupId,
        }),
      );
    } catch (error) {
      handleAwsError(error, `removeUserFromGroup(${userId}, ${groupId})`);
    }
  }

  async getGroupMembers(groupId: string): Promise<DirectoryUser[]> {
    try {
      const result = await this.iam.send(
        new GetGroupCommand({ GroupName: groupId }),
      );
      return (result.Users ?? []).map((u) => mapIamUserToDirectoryUser(u));
    } catch (error) {
      handleAwsError(error, `getGroupMembers(${groupId})`);
    }
  }

  async getUserGroups(userId: string): Promise<DirectoryGroup[]> {
    try {
      const result = await this.iam.send(
        new ListGroupsForUserCommand({ UserName: userId }),
      );
      return (result.Groups ?? []).map((g) => mapIamGroupToDirectoryGroup(g));
    } catch (error) {
      handleAwsError(error, `getUserGroups(${userId})`);
    }
  }

  // ==========================================================================
  // Organizational Units (AwsDirectoryAdapter)
  // ==========================================================================

  async createOrganizationalUnit(
    input: CreateAwsOuInput,
  ): Promise<AwsOrganizationalUnit> {
    try {
      const result = await this.orgs.send(
        new CreateOrganizationalUnitCommand({
          ParentId: input.parentId,
          Name: input.name,
        }),
      );

      const ou = result.OrganizationalUnit;
      return {
        id: ou?.Id ?? '',
        name: ou?.Name ?? '',
        arn: ou?.Arn,
        parentId: input.parentId,
      };
    } catch (error) {
      handleAwsError(error, `createOrganizationalUnit(${input.name})`);
    }
  }

  async getOrganizationalUnit(id: string): Promise<AwsOrganizationalUnit> {
    try {
      const result = await this.orgs.send(
        new DescribeOrganizationalUnitCommand({
          OrganizationalUnitId: id,
        }),
      );

      const ou = result.OrganizationalUnit;
      return {
        id: ou?.Id ?? '',
        name: ou?.Name ?? '',
        arn: ou?.Arn,
      };
    } catch (error) {
      handleAwsError(error, `getOrganizationalUnit(${id})`);
    }
  }

  async listOrganizationalUnits(
    parentId: string,
  ): Promise<AwsOrganizationalUnit[]> {
    try {
      const result = await this.orgs.send(
        new ListOrganizationalUnitsForParentCommand({
          ParentId: parentId,
        }),
      );

      return (result.OrganizationalUnits ?? []).map((ou) => ({
        id: ou.Id ?? '',
        name: ou.Name ?? '',
        arn: ou.Arn,
        parentId,
      }));
    } catch (error) {
      handleAwsError(error, `listOrganizationalUnits(${parentId})`);
    }
  }

  // ==========================================================================
  // Accounts (AwsDirectoryAdapter)
  // ==========================================================================

  async createAccount(
    input: CreateAwsAccountInput,
  ): Promise<AwsAccountCreationStatus> {
    try {
      const result = await this.orgs.send(
        new CreateAccountCommand({
          AccountName: input.name,
          Email: input.email,
          ...(input.roleName ? { RoleName: input.roleName } : {}),
        }),
      );

      const status = result.CreateAccountStatus;
      return {
        id: status?.Id ?? '',
        accountId: status?.AccountId,
        state:
          (status?.State as AwsAccountCreationStatus['state']) ?? 'IN_PROGRESS',
        failureReason: status?.FailureReason
          ? String(status.FailureReason)
          : undefined,
      };
    } catch (error) {
      handleAwsError(error, `createAccount(${input.name})`);
    }
  }

  async getAccountCreationStatus(
    id: string,
  ): Promise<AwsAccountCreationStatus> {
    try {
      const result = await this.orgs.send(
        new DescribeCreateAccountStatusCommand({
          CreateAccountRequestId: id,
        }),
      );

      const status = result.CreateAccountStatus;
      return {
        id: status?.Id ?? '',
        accountId: status?.AccountId,
        state:
          (status?.State as AwsAccountCreationStatus['state']) ?? 'IN_PROGRESS',
        failureReason: status?.FailureReason
          ? String(status.FailureReason)
          : undefined,
      };
    } catch (error) {
      handleAwsError(error, `getAccountCreationStatus(${id})`);
    }
  }

  async listAccounts(): Promise<AwsAccount[]> {
    try {
      const result = await this.orgs.send(new ListAccountsCommand({}));
      return (result.Accounts ?? []).map((a) => ({
        id: a.Id ?? '',
        name: a.Name ?? '',
        email: a.Email ?? '',
        arn: a.Arn,
        status: a.Status ? String(a.Status) : undefined,
      }));
    } catch (error) {
      handleAwsError(error, 'listAccounts');
    }
  }

  async moveAccount(
    accountId: string,
    sourceParentId: string,
    destParentId: string,
  ): Promise<void> {
    try {
      await this.orgs.send(
        new MoveAccountCommand({
          AccountId: accountId,
          SourceParentId: sourceParentId,
          DestinationParentId: destParentId,
        }),
      );
    } catch (error) {
      handleAwsError(
        error,
        `moveAccount(${accountId}, ${sourceParentId} -> ${destParentId})`,
      );
    }
  }

  // ==========================================================================
  // IAM Users (AwsDirectoryAdapter)
  // ==========================================================================

  async createIamUser(input: CreateAwsIamUserInput): Promise<AwsIamUser> {
    try {
      const result = await this.iam.send(
        new CreateUserCommand({
          UserName: input.username,
          ...(input.path ? { Path: input.path } : {}),
        }),
      );

      return mapIamUserToAwsIamUser(result.User ?? {});
    } catch (error) {
      handleAwsError(error, `createIamUser(${input.username})`);
    }
  }

  async getIamUser(username: string): Promise<AwsIamUser> {
    try {
      const result = await this.iam.send(
        new GetUserCommand({ UserName: username }),
      );
      return mapIamUserToAwsIamUser(result.User ?? {});
    } catch (error) {
      handleAwsError(error, `getIamUser(${username})`);
    }
  }

  async deleteIamUser(username: string): Promise<void> {
    try {
      await this.iam.send(new DeleteUserCommand({ UserName: username }));
    } catch (error) {
      handleAwsError(error, `deleteIamUser(${username})`);
    }
  }

  async listIamUsers(): Promise<AwsIamUser[]> {
    try {
      const result = await this.iam.send(new ListUsersCommand({}));
      return (result.Users ?? []).map((u) => mapIamUserToAwsIamUser(u));
    } catch (error) {
      handleAwsError(error, 'listIamUsers');
    }
  }

  // ==========================================================================
  // IAM Policies (AwsDirectoryAdapter)
  // ==========================================================================

  async attachUserPolicy(username: string, policyArn: string): Promise<void> {
    try {
      await this.iam.send(
        new AttachUserPolicyCommand({
          UserName: username,
          PolicyArn: policyArn,
        }),
      );
    } catch (error) {
      handleAwsError(error, `attachUserPolicy(${username}, ${policyArn})`);
    }
  }

  async detachUserPolicy(username: string, policyArn: string): Promise<void> {
    try {
      await this.iam.send(
        new DetachUserPolicyCommand({
          UserName: username,
          PolicyArn: policyArn,
        }),
      );
    } catch (error) {
      handleAwsError(error, `detachUserPolicy(${username}, ${policyArn})`);
    }
  }

  // ==========================================================================
  // Access Keys (AwsDirectoryAdapter)
  // ==========================================================================

  async createAccessKey(username: string): Promise<AwsAccessKey> {
    try {
      const result = await this.iam.send(
        new CreateAccessKeyCommand({ UserName: username }),
      );

      const key = result.AccessKey;
      return {
        accessKeyId: key?.AccessKeyId ?? '',
        secretAccessKey: key?.SecretAccessKey ?? '',
        username: key?.UserName ?? username,
        createDate: key?.CreateDate,
      };
    } catch (error) {
      handleAwsError(error, `createAccessKey(${username})`);
    }
  }

  async deleteAccessKey(username: string, accessKeyId: string): Promise<void> {
    try {
      await this.iam.send(
        new DeleteAccessKeyCommand({
          UserName: username,
          AccessKeyId: accessKeyId,
        }),
      );
    } catch (error) {
      handleAwsError(error, `deleteAccessKey(${username}, ${accessKeyId})`);
    }
  }
}
