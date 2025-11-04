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

export interface ProjectItem {
  id: string; // Project item ID
  contentId: string; // Issue/PR node ID
  status?: string;
  fields: Record<string, unknown>;
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

export interface ItemFilters {
  status?: string;
  assignees?: string[];
  labels?: string[];
  limit?: number;
  cursor?: string; // For pagination
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
