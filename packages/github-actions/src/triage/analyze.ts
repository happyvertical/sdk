/**
 * GitHub Models AI Analysis
 */

import { getAICompletion, parseAIJson } from '../shared/ai.js';
import type { AIAnalysis, TriageContext } from './types.js';

const VALID_TYPES = [
  'bug',
  'feature',
  'docs',
  'maintenance',
  'research',
  'question',
] as const;
const VALID_PRIORITIES = [
  'critical',
  'high',
  'medium',
  'low',
  'icebox',
] as const;
const VALID_SIZES = ['xs', 's', 'm', 'l', 'xl'] as const;

function validateAIAnalysis(parsed: unknown): AIAnalysis {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI response is not a valid object');
  }

  const response = parsed as Record<string, unknown>;

  // Validate required fields exist
  if (!response.type || typeof response.type !== 'string') {
    throw new Error('AI response missing required field: type');
  }
  if (!response.priority || typeof response.priority !== 'string') {
    throw new Error('AI response missing required field: priority');
  }
  if (!response.size || typeof response.size !== 'string') {
    throw new Error('AI response missing required field: size');
  }
  if (!response.reasoning || typeof response.reasoning !== 'string') {
    throw new Error('AI response missing required field: reasoning');
  }

  // Validate enum values
  if (!VALID_TYPES.includes(response.type as never)) {
    throw new Error(`Invalid type: ${response.type}`);
  }
  if (!VALID_PRIORITIES.includes(response.priority as never)) {
    throw new Error(`Invalid priority: ${response.priority}`);
  }
  if (!VALID_SIZES.includes(response.size as never)) {
    throw new Error(`Invalid size: ${response.size}`);
  }

  // Validate optional affected_packages field
  if (response.affected_packages !== undefined) {
    if (!Array.isArray(response.affected_packages)) {
      throw new Error('affected_packages must be an array');
    }
    if (!response.affected_packages.every((pkg) => typeof pkg === 'string')) {
      throw new Error('affected_packages must contain only strings');
    }
  }

  // All validations passed - construct validated object
  return {
    type: response.type,
    priority: response.priority,
    size: response.size,
    reasoning: response.reasoning,
    ...(response.affected_packages && {
      affected_packages: response.affected_packages,
    }),
  } as AIAnalysis;
}

/**
 * Analyze a GitHub issue using AI to determine type, priority, size, and affected packages.
 *
 * Sends the issue details to the configured AI provider and validates the structured response.
 *
 * @param context - Triage context with issue details and repository config
 * @returns Validated AI analysis with type, priority, size, and reasoning
 * @throws If the AI response cannot be parsed or fails validation
 */
export async function analyzeIssue(
  context: TriageContext,
): Promise<AIAnalysis> {
  const prompt = buildAnalysisPrompt(context);

  const response = await getAICompletion([
    {
      role: 'system',
      content:
        'You are an expert GitHub issue triager. Analyze issues and provide structured triage information in JSON format.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]);

  const parsed = parseAIJson(response);
  return validateAIAnalysis(parsed);
}

function buildAnalysisPrompt(context: TriageContext): string {
  const { config, issueNumber, issueTitle, issueBody, issueAuthor } = context;

  let prompt = `Analyze this GitHub issue and provide triage information for our kanban workflow.

Repository: ${context.owner}/${context.repo} (${config.repoDescription})

Issue #${issueNumber}
Title: ${issueTitle}
Body: ${issueBody || '(empty)'}
Author: ${issueAuthor}

Determine:
1. **type**: One of: bug, feature, docs, maintenance, research, question
2. **priority**: critical, high, medium, low, icebox
   - Use "icebox" for low priority or future consideration items
3. **size**: Estimated effort: xs (<2hr), s (2-4hr), m (~1day), l (2-3days), xl (>3days)`;

  if (config.packagePattern) {
    prompt += `
4. **affected_packages**: List of ${config.packagePattern} packages affected`;
    if (config.packageExamples && config.packageExamples.length > 0) {
      prompt += ` (e.g., ${JSON.stringify(config.packageExamples)})`;
    }
    prompt += `
5. **reasoning**: Brief explanation of your analysis (2-3 sentences)`;
  } else {
    prompt += `
4. **reasoning**: Brief explanation of your analysis (2-3 sentences)`;
  }

  prompt += `

Return JSON in this exact format:
{
  "type": "bug|feature|docs|maintenance|research|question",
  "priority": "critical|high|medium|low|icebox",
  "size": "xs|s|m|l|xl",`;

  if (config.packagePattern) {
    prompt += `
  "affected_packages": ["package names"],`;
  }

  prompt += `
  "reasoning": "explanation here"
}`;

  return prompt;
}
