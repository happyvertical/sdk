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
              }
              ... on PullRequest {
                id
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
          content: {
            id: string;
          };
        };
      };
    };

    return {
      id: data.addProjectV2ItemById.item.id,
      contentId: data.addProjectV2ItemById.item.content.id,
      fields: {},
      type: 'Issue',
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

  async getItem(itemId: string): Promise<ProjectItem | null> {
    const query = `
      query($itemId: ID!) {
        node(id: $itemId) {
          ... on ProjectV2Item {
            id
            content {
              ... on Issue {
                id
              }
              ... on PullRequest {
                id
              }
            }
          }
        }
      }
    `;

    const data = (await this.graphql.query(query, { itemId })) as {
      node: {
        id: string;
        content: {
          id: string;
        };
      } | null;
    };

    if (!data.node) {
      return null;
    }

    return {
      id: data.node.id,
      contentId: data.node.content.id,
      fields: {},
      type: 'Issue',
    };
  }

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
                  }
                  ... on PullRequest {
                    id
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
    `;

    const data = (await this.graphql.query(query, {
      projectId: this.projectId,
      first: filters?.limit || 100,
      after: filters?.cursor,
    })) as {
      node: {
        items: {
          nodes: Array<{
            id: string;
            content: {
              id: string;
            };
          }>;
        };
      };
    };

    return data.node.items.nodes.map((item) => ({
      id: item.id,
      contentId: item.content.id,
      fields: {},
      type: 'Issue' as const,
    }));
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
