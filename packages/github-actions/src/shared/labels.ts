/**
 * Standard Label Definitions and Management
 *
 * Defines the organization-wide standard label set for kanban workflow.
 */

export interface LabelDefinition {
  name: string;
  color: string;
  description: string;
}

/**
 * Standard label set organized by category
 */
export const STANDARD_LABELS: Record<string, LabelDefinition[]> = {
  type: [
    {
      name: 'type: bug',
      color: 'd73a4a',
      description: "Something isn't working",
    },
    {
      name: 'type: feature',
      color: '0075ca',
      description: 'New feature or enhancement',
    },
    {
      name: 'type: docs',
      color: '0075ca',
      description: 'Documentation improvements',
    },
    {
      name: 'type: maintenance',
      color: '6c757d',
      description: 'Maintenance and refactoring',
    },
    {
      name: 'type: research',
      color: 'a371f7',
      description: 'Research and investigation',
    },
    {
      name: 'type: question',
      color: 'd876e3',
      description: 'Question or discussion',
    },
  ],
  priority: [
    {
      name: 'priority: critical',
      color: 'b60205',
      description: 'Critical priority, needs immediate attention',
    },
    {
      name: 'priority: high',
      color: 'd93f0b',
      description: 'High priority',
    },
    {
      name: 'priority: medium',
      color: 'fbca04',
      description: 'Medium priority (default)',
    },
    {
      name: 'priority: low',
      color: 'fef2c0',
      description: 'Low priority',
    },
    {
      name: 'priority: icebox',
      color: 'e1e4e8',
      description: 'Future consideration, keep in Backlog',
    },
  ],
  size: [
    {
      name: 'size: xs',
      color: 'c2e0c6',
      description: 'Extra small (< 2 hours)',
    },
    {
      name: 'size: s',
      color: '7bd88f',
      description: 'Small (2-4 hours)',
    },
    {
      name: 'size: m',
      color: '3fb950',
      description: 'Medium (~1 day)',
    },
    {
      name: 'size: l',
      color: '2ea043',
      description: 'Large (2-3 days)',
    },
    {
      name: 'size: xl',
      color: '1a7f37',
      description: 'Extra large (> 3 days)',
    },
  ],
  status: [
    {
      name: 'status: blocked',
      color: 'd73a4a',
      description: 'Blocked by external dependency',
    },
    {
      name: 'status: help-wanted',
      color: '008672',
      description: 'Community contributions welcome',
    },
    {
      name: 'status: good-first-issue',
      color: '7057ff',
      description: 'Good for newcomers',
    },
  ],
  agent: [
    {
      name: 'agent: triage',
      color: 'bfdadc',
      description: 'AI triage in progress',
    },
    {
      name: 'agent: planning',
      color: 'bfdadc',
      description: 'AI planning assistance',
    },
    {
      name: 'agent: implementation',
      color: 'bfdadc',
      description: 'AI implementation in progress',
    },
    {
      name: 'agent: testing',
      color: 'bfdadc',
      description: 'AI testing in progress',
    },
    {
      name: 'agent: review',
      color: 'bfdadc',
      description: 'AI code review in progress',
    },
    {
      name: 'agent: claude',
      color: '0E8A16',
      description: 'Claude Code is assigned to work on this issue',
    },
  ],
};

/**
 * Area labels are repository-specific, so we provide a template
 */
export const AREA_LABEL_TEMPLATE: LabelDefinition[] = [
  {
    name: 'area: core',
    color: 'fbca04',
    description: 'Core functionality',
  },
  {
    name: 'area: api',
    color: 'fbca04',
    description: 'API-related',
  },
  {
    name: 'area: ui',
    color: 'fbca04',
    description: 'User interface',
  },
  {
    name: 'area: cli',
    color: 'fbca04',
    description: 'Command-line interface',
  },
  {
    name: 'area: docs',
    color: 'fbca04',
    description: 'Documentation',
  },
  {
    name: 'area: infra',
    color: 'fbca04',
    description: 'Infrastructure and deployment',
  },
  {
    name: 'area: tests',
    color: 'fbca04',
    description: 'Testing infrastructure',
  },
];

/**
 * Get all standard labels as a flat array
 */
export function getAllStandardLabels(): LabelDefinition[] {
  return Object.values(STANDARD_LABELS).flat();
}

/**
 * Get labels by category
 */
export function getLabelsByCategory(category: string): LabelDefinition[] {
  return STANDARD_LABELS[category] || [];
}

/**
 * Map old label names to new standard names
 */
export const LABEL_MIGRATIONS: Record<string, string> = {
  bug: 'type: bug',
  feature: 'type: feature',
  enhancement: 'type: feature',
  documentation: 'type: docs',
  question: 'type: question',
  'tech-debt': 'type: maintenance',
  epic: 'type: feature',
};

/**
 * Migrate old label to new standard label
 */
export function migrateLabel(oldLabel: string): string {
  return LABEL_MIGRATIONS[oldLabel] || oldLabel;
}
