/**
 * GitHub Actions Issue Triage Types
 */

export interface TriageConfig {
  /** Repository description for AI analysis */
  repoDescription: string;
  /** Package pattern (e.g., "@have/*", "@smrt/*") */
  packagePattern?: string;
  /** Example package names for AI context */
  packageExamples?: string[];
  /** Whether to update project board */
  projectEnabled?: boolean;
  /** GitHub Project V2 ID */
  projectId?: string;
  /** Status field ID */
  statusFieldId?: string;
  /** Status option IDs */
  statusOptions?: {
    [statusName: string]: string;
  };
}

export interface AIAnalysis {
  /** Issue type: bug, feature, enhancement, tech-debt, epic, documentation, question */
  type: string;
  /** Priority: critical, high, medium, low */
  priority: string;
  /** Urgency: urgent, normal */
  urgency: string;
  /** Affected packages */
  affected_packages?: string[];
  /** Analysis reasoning */
  reasoning: string;
}

export interface DuplicateIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
}

export interface TriageContext {
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
  config: TriageConfig;
}

export interface TriageResult {
  success: boolean;
  analysis?: AIAnalysis;
  duplicates?: DuplicateIssue[];
  error?: string;
}
