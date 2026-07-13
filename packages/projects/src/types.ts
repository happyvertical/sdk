/**
 * Core types for project management operations
 */

export interface Project {
  id: string;
  title: string;
  description?: string;
  owner: string; // Organization or user
  url: string;
  statuses: Status[];
  fields: Field[];
}

/**
 * A provider-neutral item on a project board.
 */
export interface ProjectItem {
  /** Provider project-item ID. */
  id: string;
  /** Provider content-node ID for the issue, pull request, or draft issue. */
  contentId: string;
  /** Content title when returned by the provider. */
  title?: string;
  /** Content URL, or `null` when the content has no provider URL. */
  url?: string | null;
  /** Provider usernames assigned to the content. */
  assignees?: string[];
  /** Selected status name from the configured or canonical status field. */
  status?: string;
  /** Provider field values keyed by field name. */
  fields: Record<string, unknown>;
  /** Kind of content represented by the project item. */
  type: 'Issue' | 'PullRequest' | 'DraftIssue';
}

export interface Status {
  id: string;
  name: string;
  description?: string;
  color?: string;
  order: number;
}

export interface Field {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'single_select' | 'iteration';
  options?: FieldOption[];
}

export interface FieldOption {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

/**
 * Options for reading project items.
 */
export interface ItemFilters {
  /** Return items in this status when supported by the provider. */
  status?: string;
  /** Return items assigned to these provider usernames when supported. */
  assignees?: string[];
  /** Return items with these labels when supported. */
  labels?: string[];
  /** Maximum number of items to return. Defaults to 100; zero returns none. */
  limit?: number;
  /** Provider cursor after which item pagination begins. */
  cursor?: string;
}

/**
 * Project configuration
 */
export interface ProjectConfig {
  type: 'github' | 'jira' | 'zenhub' | 'linear';
  projectId: string;
  token: string;

  // GitHub Projects V2
  owner?: string; // Organization or user
  repo?: string; // Repository name (for repo-level projects)
  statusFieldId?: string;
  statusOptions?: Record<string, string>; // Map status name to option ID

  // Jira
  boardId?: string;

  // Linear
  teamId?: string;
}

/**
 * Kanban status names for 6-lane structure
 */
export const KANBAN_STATUSES = [
  'New',
  'Backlog',
  'Planning',
  'Ready',
  'In Progress',
  'Review',
  'Done',
] as const;

export type KanbanStatus = (typeof KANBAN_STATUSES)[number];

/**
 * Project interface - all project implementations must implement this
 */
export interface IProject {
  // Project Info
  getProject(): Promise<Project>;

  // Items (Issues/Cards)
  addItem(contentId: string): Promise<ProjectItem>;
  removeItem(itemId: string): Promise<void>;
  getItem(itemId: string): Promise<ProjectItem | null>;
  listItems(filters?: ItemFilters): Promise<ProjectItem[]>;

  // Status/Column Management
  updateItemStatus(itemId: string, status: string): Promise<void>;
  listStatuses(): Promise<Status[]>;

  // Field Management
  updateItemField(
    itemId: string,
    fieldId: string,
    value: unknown,
  ): Promise<void>;
  listFields(): Promise<Field[]>;
}
