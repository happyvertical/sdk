/**
 * Issue body parsing and rendering utilities
 *
 * Parses GitHub issue bodies created from YAML form templates.
 * GitHub renders form fields as markdown sections with ### headings.
 */

import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';

/**
 * Template field definition - mirrors GitHub ISSUE_TEMPLATE YAML structure
 */
export interface TemplateField {
  type: 'textarea' | 'input' | 'dropdown' | 'checkboxes' | 'markdown';
  id?: string;
  attributes: {
    label: string;
    description?: string;
    placeholder?: string;
    value?: string;
    options?: string[];
  };
  validations?: {
    required?: boolean;
  };
}

/**
 * Issue template definition
 */
export interface IssueTemplate {
  name: string;
  description?: string;
  title?: string;
  labels?: string[];
  assignees?: string[];
  body: TemplateField[];
}

/**
 * Load and parse an issue template from a YAML file
 *
 * @param yamlPath - Path to the YAML template file
 * @returns Parsed issue template
 *
 * @example
 * ```typescript
 * const template = await loadIssueTemplate('.github/ISSUE_TEMPLATE/bug_report.yml');
 * ```
 */
export async function loadIssueTemplate(
  yamlPath: string,
): Promise<IssueTemplate> {
  const content = await readFile(yamlPath, 'utf-8');
  return parseIssueTemplate(content);
}

/**
 * Parse an issue template from YAML content
 *
 * @param yamlContent - YAML content string
 * @returns Parsed issue template
 *
 * @example
 * ```typescript
 * const template = parseIssueTemplate(`
 * name: Bug Report
 * body:
 *   - type: textarea
 *     id: description
 *     attributes:
 *       label: Description
 * `);
 * ```
 */
export function parseIssueTemplate(yamlContent: string): IssueTemplate {
  const parsed = yaml.load(yamlContent) as IssueTemplate;

  if (!parsed.name) {
    throw new Error('Issue template must have a name');
  }

  if (!parsed.body || !Array.isArray(parsed.body)) {
    throw new Error('Issue template must have a body array');
  }

  return parsed;
}

/**
 * Parse an issue body into field values
 *
 * GitHub renders form fields as markdown sections:
 * ```
 * ### Label
 *
 * Content here
 *
 * ### Next Label
 * ```
 *
 * Without a template, returns a Record<string, string> keyed by label.
 * With a template, returns a Record<string, string> keyed by field ID.
 *
 * @param body - The issue body markdown
 * @param template - Optional template for mapping labels to field IDs
 * @returns Parsed fields as key-value pairs
 *
 * @example
 * ```typescript
 * // Without template - keyed by label
 * const fields = parseIssueBody(issue.body);
 * // { 'Description': '...', 'Steps to Reproduce': '...' }
 *
 * // With template - keyed by field ID
 * const template = await loadIssueTemplate('.github/ISSUE_TEMPLATE/bug_report.yml');
 * const fields = parseIssueBody(issue.body, template);
 * // { description: '...', reproduction: '...' }
 * ```
 */
export function parseIssueBody(
  body: string,
  template?: IssueTemplate,
): Record<string, string> {
  const sections = parseSections(body);

  if (!template) {
    return sections;
  }

  // Build label-to-id mapping from template
  const labelToId = new Map<string, string>();
  for (const field of template.body) {
    if (field.id && field.attributes?.label) {
      labelToId.set(field.attributes.label, field.id);
    }
  }

  // Map labels to field IDs
  const result: Record<string, string> = {};
  for (const [label, content] of Object.entries(sections)) {
    const id = labelToId.get(label);
    if (id) {
      result[id] = content;
    } else {
      // Keep original label if no ID mapping found
      result[label] = content;
    }
  }

  return result;
}

/**
 * Parse markdown sections (### headers) into key-value pairs
 */
function parseSections(body: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Match ### headers and their content
  // Content is everything until the next ### or --- or end of string
  const sectionRegex =
    /^### (.+?)\r?\n\r?\n([\s\S]*?)(?=\r?\n### |\r?\n---|\s*$)/gm;

  for (const match of body.matchAll(sectionRegex)) {
    const label = match[1].trim();
    const content = match[2].trim();
    result[label] = content;
  }

  return result;
}

/**
 * Render fields into an issue body markdown string
 *
 * Without a template, uses field keys as labels.
 * With a template, uses field IDs to look up labels and renders in template order.
 *
 * @param fields - Field values as key-value pairs
 * @param template - Optional template for field ordering and labels
 * @returns Markdown string for issue body
 *
 * @example
 * ```typescript
 * // Without template
 * const body = renderIssueBody({
 *   'Description': 'Bug description here',
 *   'Steps to Reproduce': '1. Do X\n2. See error'
 * });
 *
 * // With template
 * const template = await loadIssueTemplate('.github/ISSUE_TEMPLATE/bug_report.yml');
 * const body = renderIssueBody({
 *   description: 'Bug description here',
 *   reproduction: '1. Do X\n2. See error'
 * }, template);
 * ```
 */
export function renderIssueBody(
  fields: Record<string, string>,
  template?: IssueTemplate,
): string {
  const sections: string[] = [];

  if (!template) {
    // Without template, render in field order
    for (const [label, content] of Object.entries(fields)) {
      sections.push(`### ${label}\n\n${content}`);
    }
  } else {
    // With template, render in template order using field IDs
    const idToContent = new Map(Object.entries(fields));

    for (const field of template.body) {
      // Skip markdown-only fields (no id)
      if (!field.id || field.type === 'markdown') {
        continue;
      }

      const label = field.attributes?.label || field.id;
      const content = idToContent.get(field.id);

      if (content !== undefined) {
        sections.push(`### ${label}\n\n${content}`);
      }
    }
  }

  return sections.join('\n\n');
}

/**
 * Get a specific field value from an issue body
 *
 * @param body - The issue body markdown
 * @param fieldIdOrLabel - Field ID (with template) or label (without template)
 * @param template - Optional template for field ID lookup
 * @returns Field value or undefined if not found
 */
export function getIssueField(
  body: string,
  fieldIdOrLabel: string,
  template?: IssueTemplate,
): string | undefined {
  const fields = parseIssueBody(body, template);
  return fields[fieldIdOrLabel];
}

/**
 * Update a specific field in an issue body
 *
 * @param body - The issue body markdown
 * @param fieldIdOrLabel - Field ID (with template) or label (without template)
 * @param value - New value for the field
 * @param template - Optional template for field ID lookup
 * @returns Updated issue body markdown
 */
export function updateIssueField(
  body: string,
  fieldIdOrLabel: string,
  value: string,
  template?: IssueTemplate,
): string {
  const fields = parseIssueBody(body, template);
  fields[fieldIdOrLabel] = value;
  return renderIssueBody(fields, template);
}
