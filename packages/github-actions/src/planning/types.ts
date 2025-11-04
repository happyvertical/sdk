/**
 * Planning Workflow Types
 */

export interface PlanningConfig {
  /** Repository description for AI context */
  repoDescription: string;
  /** Package pattern (e.g., "@happyvertical/*", "@smrt/*") */
  packagePattern?: string;
  /** Example package names for AI context */
  packageExamples?: string[];
  /** GitHub Project configuration */
  projectId?: string;
  /** Status field ID */
  statusFieldId?: string;
  /** Status option IDs */
  statusOptions?: {
    [statusName: string]: string;
  };
}

export interface PlanningContext {
  /** GitHub token */
  token: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Issue number */
  issueNumber: number;
  /** Issue title */
  issueTitle: string;
  /** Issue body */
  issueBody?: string;
  /** Issue author */
  issueAuthor: string;
  /** Configuration */
  config: PlanningConfig;
}

export interface ImplementationPlan {
  /** Summary of the plan */
  summary: string;
  /** List of tasks to complete */
  tasks: string[];
  /** Estimated effort/complexity */
  complexity: 'simple' | 'moderate' | 'complex';
  /** Technical considerations */
  considerations: string[];
  /** Files likely to be affected */
  affected_files?: string[];
  /** Dependencies or blockers */
  dependencies?: string[];
}

export interface PlanningResult {
  success: boolean;
  plan?: ImplementationPlan;
  error?: string;
}

export interface DefinitionOfReady {
  /** Issue has clear, actionable description */
  hasClearDescription: boolean;
  /** Issue has type label */
  hasTypeLabel: boolean;
  /** Issue has priority label */
  hasPriorityLabel: boolean;
  /** Issue has size label */
  hasSizeLabel: boolean;
  /** Implementation plan is documented */
  hasPlan: boolean;
  /** No blocking dependencies */
  noBlockers: boolean;
}
