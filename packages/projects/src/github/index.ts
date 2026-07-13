/**
 * GitHub Projects V2 implementation
 */

import { GraphQLClient, type IGraphQLClient } from '@happyvertical/graphql';
import { ProjectError, ProjectErrorCode } from '../errors.js';
import type {
  Field,
  IProject,
  ItemFilters,
  Project,
  ProjectConfig,
  ProjectItem,
  Status,
} from '../types.js';

const GITHUB_DEFAULT_ITEMS_LIMIT = 100;
const GITHUB_ITEMS_PAGE_SIZE = 20;

interface GitHubProjectItemReference {
  typename: ProjectItem['type'];
  id: string;
}

interface GitHubProjectItemContent extends GitHubProjectItemReference {
  title: string;
  url?: string;
  assignees: {
    nodes: Array<{ login: string } | null>;
  };
}

interface GitHubProjectFieldValue {
  typename: string;
  field?: {
    id: string;
    name: string;
  };
  date?: string | null;
  title?: string;
  labels?: {
    nodes: Array<{ name: string } | null>;
  } | null;
  milestone?: {
    title: string;
  } | null;
  number?: number | null;
  pullRequests?: {
    nodes: Array<{ url: string } | null>;
  } | null;
  repository?: {
    nameWithOwner: string;
  } | null;
  reviewers?: {
    nodes: Array<{
      login?: string;
      slug?: string;
    } | null>;
  } | null;
  name?: string | null;
  text?: string | null;
  users?: {
    nodes: Array<{ login: string } | null>;
  } | null;
  issueFieldValue?: {
    typename: string;
    name?: string;
    dateValue?: string;
    multiSelectOptions?: Array<{ name: string }>;
    numberValue?: number;
    singleSelectValue?: string;
    textValue?: string;
  } | null;
}

interface GitHubProjectItemNode {
  id: string;
  content: GitHubProjectItemContent | null;
  fieldValues: {
    nodes: Array<GitHubProjectFieldValue | null>;
  };
}

interface GitHubProjectItemsPage {
  node: {
    items: {
      nodes: Array<GitHubProjectItemNode | null>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  } | null;
}

/**
 * GitHub Projects V2 implementation
 */
export class GitHubProject implements IProject {
  private graphql: IGraphQLClient;
  private projectId: string;
  private owner?: string;
  private repo?: string;
  private statusFieldId?: string;
  private statusOptions?: Record<string, string>;

  constructor(config: ProjectConfig) {
    if (config.type !== 'github') {
      throw new Error('Invalid config type for GitHubProject');
    }

    this.graphql = new GraphQLClient({
      endpoint: 'https://api.github.com/graphql',
      token: config.token,
    });
    this.projectId = config.projectId;
    this.owner = config.owner;
    this.repo = config.repo;
    this.statusFieldId = config.statusFieldId;
    this.statusOptions = config.statusOptions;
  }

  // Project Info
  async getProject(): Promise<Project> {
    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            id
            title
            shortDescription
            url
            owner {
              ... on Organization {
                login
              }
              ... on User {
                login
              }
            }
            fields(first: 20) {
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options {
                    id
                    name
                    description
                    color
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = (await this.graphql.query(query, {
      projectId: this.projectId,
    })) as {
      node: {
        id: string;
        title: string;
        shortDescription: string;
        url: string;
        owner: { login: string };
        fields: {
          nodes: Array<{
            id: string;
            name: string;
            dataType: string;
            options?: Array<{
              id: string;
              name: string;
              description?: string;
              color?: string;
            }>;
          }>;
        };
      };
    };

    const statusField = data.node.fields.nodes.find(
      (f) => f.name === 'Status' && f.options,
    );

    return {
      id: data.node.id,
      title: data.node.title,
      description: data.node.shortDescription,
      owner: data.node.owner.login,
      url: data.node.url,
      statuses: statusField?.options
        ? statusField.options.map((opt, index) => ({
            id: opt.id,
            name: opt.name,
            description: opt.description,
            color: opt.color,
            order: index,
          }))
        : [],
      fields: data.node.fields.nodes.map((f) => ({
        id: f.id,
        name: f.name,
        type: this.mapFieldType(f.dataType),
        options: f.options?.map((opt) => ({
          id: opt.id,
          name: opt.name,
          description: opt.description,
          color: opt.color,
        })),
      })),
    };
  }

  // Items
  /**
   * Add an issue or pull request to the configured GitHub project.
   *
   * The mutation result contains item identity and content type only. Use
   * {@link listItems} when content metadata, status, or fields are required.
   *
   * @param contentId - GitHub node ID for the issue or pull request
   * @returns The created provider-neutral project item
   */
  async addItem(contentId: string): Promise<ProjectItem> {
    const mutation = `
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {
          projectId: $projectId
          contentId: $contentId
        }) {
          item {
            id
            content {
              ... on Issue {
                id
                typename: __typename
              }
              ... on PullRequest {
                id
                typename: __typename
              }
            }
          }
        }
      }
    `;

    const data = (await this.graphql.mutate(mutation, {
      projectId: this.projectId,
      contentId,
    })) as {
      addProjectV2ItemById: {
        item: {
          id: string;
          content: GitHubProjectItemReference;
        };
      };
    };

    return {
      id: data.addProjectV2ItemById.item.id,
      contentId: data.addProjectV2ItemById.item.content.id,
      fields: {},
      type: data.addProjectV2ItemById.item.content.typename,
    };
  }

  async removeItem(itemId: string): Promise<void> {
    const mutation = `
      mutation($projectId: ID!, $itemId: ID!) {
        deleteProjectV2Item(input: {
          projectId: $projectId
          itemId: $itemId
        }) {
          deletedItemId
        }
      }
    `;

    await this.graphql.mutate(mutation, {
      projectId: this.projectId,
      itemId,
    });
  }

  /**
   * Get one GitHub Projects V2 item by its project-item ID.
   *
   * This identity lookup does not hydrate content metadata, status, or fields.
   * Use {@link listItems} for the enriched board-item representation.
   *
   * @param itemId - GitHub project-item node ID
   * @returns The item, or `null` when it or its content is inaccessible
   */
  async getItem(itemId: string): Promise<ProjectItem | null> {
    const query = `
      query($itemId: ID!) {
        node(id: $itemId) {
          ... on ProjectV2Item {
            id
            content {
              ... on Issue {
                id
                typename: __typename
              }
              ... on PullRequest {
                id
                typename: __typename
              }
              ... on DraftIssue {
                id
                typename: __typename
              }
            }
          }
        }
      }
    `;

    const data = (await this.graphql.query(query, { itemId })) as {
      node: {
        id: string;
        content: Partial<GitHubProjectItemReference> | null;
      } | null;
    };

    if (!data.node?.content?.id || !data.node.content.typename) {
      return null;
    }

    return {
      id: data.node.id,
      contentId: data.node.content.id,
      fields: {},
      type: data.node.content.typename,
    };
  }

  /**
   * List GitHub Projects V2 items after an optional cursor.
   *
   * Deleted or inaccessible content is skipped, and the result defaults to at
   * most 100 accessible items to preserve the adapter's historical limit.
   *
   * @param filters - Optional cursor and maximum result count
   * @returns Provider-neutral project items with content metadata and fields
   */
  async listItems(filters?: ItemFilters): Promise<ProjectItem[]> {
    const query = `
      query($projectId: ID!, $first: Int!, $after: String) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: $first, after: $after) {
              nodes {
                id
                content {
                  ... on Issue {
                    id
                    typename: __typename
                    title
                    url
                    assignees(first: 100) {
                      nodes {
                        login
                      }
                    }
                  }
                  ... on PullRequest {
                    id
                    typename: __typename
                    title
                    url
                    assignees(first: 100) {
                      nodes {
                        login
                      }
                    }
                  }
                  ... on DraftIssue {
                    id
                    typename: __typename
                    title
                    assignees(first: 100) {
                      nodes {
                        login
                      }
                    }
                  }
                }
                fieldValues(first: 50) {
                  nodes {
                    typename: __typename
                    # GitHub Projects have at most 50 fields. A 20-item page and
                    # four 100-node nested connections stay below GitHub's
                    # 500,000-node query limit while avoiding partial values.
                    ... on ProjectV2ItemFieldDateValue {
                      field {
                        ...ProjectField
                      }
                      date
                    }
                    ... on ProjectV2ItemFieldIterationValue {
                      field {
                        ...ProjectField
                      }
                      title
                    }
                    ... on ProjectV2ItemFieldLabelValue {
                      field {
                        ...ProjectField
                      }
                      labels(first: 100) {
                        nodes {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldMilestoneValue {
                      field {
                        ...ProjectField
                      }
                      milestone {
                        title
                      }
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      field {
                        ...ProjectField
                      }
                      number
                    }
                    ... on ProjectV2ItemFieldPullRequestValue {
                      field {
                        ...ProjectField
                      }
                      pullRequests(first: 100) {
                        nodes {
                          url
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldRepositoryValue {
                      field {
                        ...ProjectField
                      }
                      repository {
                        nameWithOwner
                      }
                    }
                    ... on ProjectV2ItemFieldReviewerValue {
                      field {
                        ...ProjectField
                      }
                      reviewers(first: 100) {
                        nodes {
                          ... on Bot {
                            login
                          }
                          ... on EnterpriseTeam {
                            slug
                          }
                          ... on Mannequin {
                            login
                          }
                          ... on Team {
                            slug
                          }
                          ... on User {
                            login
                          }
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      field {
                        ...ProjectField
                      }
                      name
                    }
                    ... on ProjectV2ItemFieldTextValue {
                      field {
                        ...ProjectField
                      }
                      text
                    }
                    ... on ProjectV2ItemFieldUserValue {
                      field {
                        ...ProjectField
                      }
                      users(first: 100) {
                        nodes {
                          login
                        }
                      }
                    }
                    ... on ProjectV2ItemIssueFieldValue {
                      field {
                        ...ProjectField
                      }
                      issueFieldValue {
                        typename: __typename
                        ... on IssueFieldDateValue {
                          dateValue: value
                        }
                        ... on IssueFieldMultiSelectValue {
                          multiSelectOptions: options {
                            name
                          }
                        }
                        ... on IssueFieldNumberValue {
                          numberValue: value
                        }
                        ... on IssueFieldSingleSelectValue {
                          name
                          singleSelectValue: value
                        }
                        ... on IssueFieldTextValue {
                          textValue: value
                        }
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }

      fragment ProjectField on ProjectV2FieldCommon {
        id
        name
      }
    `;

    const requestedLimit = filters?.limit ?? GITHUB_DEFAULT_ITEMS_LIMIT;
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(0, Math.floor(requestedLimit))
      : GITHUB_DEFAULT_ITEMS_LIMIT;
    if (limit === 0) {
      return [];
    }

    const items: ProjectItem[] = [];
    let after = filters?.cursor;
    let fillPage = false;
    const seenCursors = new Set<string>();

    while (items.length < limit) {
      const remaining = limit - items.length;
      const first = fillPage
        ? GITHUB_ITEMS_PAGE_SIZE
        : Math.min(GITHUB_ITEMS_PAGE_SIZE, remaining);
      const data = await this.graphql.query<GitHubProjectItemsPage>(query, {
        projectId: this.projectId,
        first,
        after,
      });
      if (!data.node) {
        throw new ProjectError(
          `GitHub project ${this.projectId} was not found or is inaccessible`,
          ProjectErrorCode.NOT_FOUND,
        );
      }
      const connection = data.node.items;
      let skippedContent = false;

      for (const node of connection.nodes) {
        if (!node) {
          skippedContent = true;
          continue;
        }
        const item = this.mapProjectItem(node);
        if (item) {
          items.push(item);
        } else {
          skippedContent = true;
        }
        if (items.length >= limit) {
          break;
        }
      }
      fillPage = skippedContent;

      const { endCursor, hasNextPage } = connection.pageInfo;
      if (
        !hasNextPage ||
        !endCursor ||
        endCursor === after ||
        seenCursors.has(endCursor)
      ) {
        break;
      }
      seenCursors.add(endCursor);
      after = endCursor;
    }

    return items;
  }

  /**
   * Convert one GitHub Projects V2 item into the provider-neutral item shape.
   */
  private mapProjectItem(item: GitHubProjectItemNode): ProjectItem | null {
    const { content } = item;
    if (!content) {
      return null;
    }

    const fieldEntries: Array<[string, unknown]> = [];
    let status: string | undefined;

    for (const fieldValue of item.fieldValues.nodes) {
      if (!fieldValue?.field) {
        continue;
      }
      const value = this.mapProjectFieldValue(fieldValue);
      if (value !== undefined) {
        fieldEntries.push([fieldValue.field.name, value]);
      }

      const isStatusField = this.statusFieldId
        ? fieldValue.field.id === this.statusFieldId
        : fieldValue.field.name.toLowerCase() === 'status';
      if (isStatusField && typeof value === 'string') {
        status = value;
      }
    }

    return {
      id: item.id,
      contentId: content.id,
      title: content.title,
      url: content.url ?? null,
      assignees: content.assignees.nodes.flatMap((assignee) =>
        assignee ? [assignee.login] : [],
      ),
      status,
      fields: Object.fromEntries(fieldEntries),
      type: content.typename,
    };
  }

  /**
   * Convert GitHub's field-value union into stable scalar or string-array values.
   */
  private mapProjectFieldValue(value: GitHubProjectFieldValue): unknown {
    switch (value.typename) {
      case 'ProjectV2ItemFieldDateValue':
        return value.date;
      case 'ProjectV2ItemFieldIterationValue':
        return value.title;
      case 'ProjectV2ItemFieldLabelValue':
        return value.labels?.nodes.flatMap((label) =>
          label ? [label.name] : [],
        );
      case 'ProjectV2ItemFieldMilestoneValue':
        return value.milestone?.title;
      case 'ProjectV2ItemFieldNumberValue':
        return value.number;
      case 'ProjectV2ItemFieldPullRequestValue':
        return value.pullRequests?.nodes.flatMap((pullRequest) =>
          pullRequest ? [pullRequest.url] : [],
        );
      case 'ProjectV2ItemFieldRepositoryValue':
        return value.repository?.nameWithOwner;
      case 'ProjectV2ItemFieldReviewerValue':
        return value.reviewers?.nodes.flatMap((reviewer) => {
          const name = reviewer?.login ?? reviewer?.slug;
          return name ? [name] : [];
        });
      case 'ProjectV2ItemFieldSingleSelectValue':
        return value.name;
      case 'ProjectV2ItemFieldTextValue':
        return value.text;
      case 'ProjectV2ItemFieldUserValue':
        return value.users?.nodes.flatMap((user) => (user ? [user.login] : []));
      case 'ProjectV2ItemIssueFieldValue': {
        const issueValue = value.issueFieldValue;
        switch (issueValue?.typename) {
          case 'IssueFieldDateValue':
            return issueValue.dateValue;
          case 'IssueFieldMultiSelectValue':
            return issueValue.multiSelectOptions?.map((option) => option.name);
          case 'IssueFieldNumberValue':
            return issueValue.numberValue;
          case 'IssueFieldSingleSelectValue':
            return issueValue.name ?? issueValue.singleSelectValue;
          case 'IssueFieldTextValue':
            return issueValue.textValue;
          default:
            return undefined;
        }
      }
      default:
        return undefined;
    }
  }

  // Status Management
  async updateItemStatus(itemId: string, status: string): Promise<void> {
    if (!this.statusFieldId || !this.statusOptions) {
      throw new ProjectError(
        'Status field configuration is required. Provide statusFieldId and statusOptions in config.',
        ProjectErrorCode.INVALID_STATUS,
      );
    }

    const statusOptionId = this.statusOptions[status];
    if (!statusOptionId) {
      throw new ProjectError(
        `Status "${status}" not found in project configuration. Available: ${Object.keys(this.statusOptions).join(', ')}`,
        ProjectErrorCode.INVALID_STATUS,
      );
    }

    await this.updateItemField(itemId, this.statusFieldId, statusOptionId);
  }

  async listStatuses(): Promise<Status[]> {
    const project = await this.getProject();
    return project.statuses;
  }

  // Field Management
  async updateItemField(
    itemId: string,
    fieldId: string,
    value: unknown,
  ): Promise<void> {
    const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: $value
        }) {
          projectV2Item {
            id
          }
        }
      }
    `;

    await this.graphql.mutate(mutation, {
      projectId: this.projectId,
      itemId,
      fieldId,
      value: { singleSelectOptionId: value },
    });
  }

  async listFields(): Promise<Field[]> {
    const project = await this.getProject();
    return project.fields;
  }

  /**
   * Map GitHub field type to our standard types
   */
  private mapFieldType(
    dataType: string,
  ): 'text' | 'number' | 'date' | 'single_select' | 'iteration' {
    switch (dataType.toLowerCase()) {
      case 'text':
        return 'text';
      case 'number':
        return 'number';
      case 'date':
        return 'date';
      case 'single_select':
        return 'single_select';
      case 'iteration':
        return 'iteration';
      default:
        return 'text';
    }
  }
}
