/**
 * Claude model-family facts shared by the providers that can reach Claude
 * (Anthropic, Bifrost, Bedrock). Model ids are matched anywhere in the id so
 * gateway prefixes (`anthropic/claude-opus-5-5`, `us.anthropic.claude-...`)
 * work.
 */

import type { AIReasoningOptions } from './types';

type ClaudeFamily = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'mythos';

interface ClaudeVersion {
  family: ClaudeFamily;
  major: number;
  minor: number;
}

// `claude-opus-4-6`, `claude-opus-5`, `claude-sonnet-5-5`. A trailing date
// stamp (`-20250514`) is not a minor version, hence the digit lookahead.
const CLAUDE_MODEL =
  /claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2})(?!\d))?/i;

function parseClaudeModel(
  model: string | undefined,
): ClaudeVersion | undefined {
  const match = model ? CLAUDE_MODEL.exec(model) : null;
  if (!match) return undefined;
  return {
    family: match[1].toLowerCase() as ClaudeFamily,
    major: Number(match[2]),
    minor: match[3] ? Number(match[3]) : 0,
  };
}

function atLeast(version: ClaudeVersion, major: number, minor: number) {
  return (
    version.major > major || (version.major === major && version.minor >= minor)
  );
}

/**
 * Whether the model takes `output_config.effort` (Opus and Sonnet 4.6 and
 * later, Haiku 5 and later, and the Fable and Mythos models). Earlier Claude
 * models have no effort control.
 */
export function claudeSupportsEffort(model: string | undefined): boolean {
  const version = parseClaudeModel(model);
  if (!version) return false;
  switch (version.family) {
    case 'fable':
    case 'mythos':
      return true;
    case 'haiku':
      return version.major >= 5;
    default:
      return atLeast(version, 4, 6);
  }
}

/**
 * Whether `thinking: { type: 'enabled', budget_tokens }` is rejected with a
 * 400. It is removed on Opus and Sonnet 4.7 and later, Haiku 5 and later, and
 * the Fable and Mythos models; Opus and Sonnet 4.6 still accept it
 * (deprecated).
 */
export function claudeRejectsThinkingBudget(
  model: string | undefined,
): boolean {
  const version = parseClaudeModel(model);
  if (!version) return false;
  switch (version.family) {
    case 'fable':
    case 'mythos':
      return true;
    case 'haiku':
      return version.major >= 5;
    default:
      return atLeast(version, 4, 7);
  }
}

export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Claude `output_config.effort` for an SDK effort. Claude cannot be told "no
 * reasoning" through effort, so `'none'` and `'minimal'` become `'low'`
 * (`'none'` is handled by callers that also drop thinking). Opus and Sonnet
 * 4.6 have no `'xhigh'`, which maps to `'high'` there.
 */
export function toClaudeEffort(
  model: string | undefined,
  effort: NonNullable<AIReasoningOptions['effort']>,
): ClaudeEffort {
  switch (effort) {
    case 'none':
    case 'minimal':
    case 'low':
      return 'low';
    case 'xhigh': {
      const version = parseClaudeModel(model);
      return version && version.minor === 6 && version.major === 4
        ? 'high'
        : 'xhigh';
    }
    default:
      return effort;
  }
}
