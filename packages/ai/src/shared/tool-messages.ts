/**
 * Internal helpers for replaying tool-call conversations to providers.
 *
 * A tool loop is: assistant message with `tool_calls` -> one `role: 'tool'`
 * message per call carrying `tool_call_id` -> next model call. Providers
 * pair results with calls differently (id, name, or position); these helpers
 * give every mapper the same view of that pairing.
 *
 * @internal
 */

import type { AIMessage } from './types';

/**
 * Index every assistant tool call id to its function name.
 */
export function indexToolCallNames(messages: AIMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.tool_calls) continue;
    for (const toolCall of message.tool_calls) {
      names.set(toolCall.id, toolCall.function.name);
    }
  }
  return names;
}

/**
 * Function name for a tool result: its explicit `name`, else the name of the
 * assistant tool call its `tool_call_id` answers.
 */
export function resolveToolResultName(
  message: AIMessage,
  names: Map<string, string>,
): string | undefined {
  if (message.name) return message.name;
  return message.tool_call_id ? names.get(message.tool_call_id) : undefined;
}

/**
 * True when the conversation contains tool calls or tool results.
 */
export function hasToolTraffic(messages: AIMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === 'tool' ||
      (message.role === 'assistant' &&
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length > 0),
  );
}

/**
 * Parse JSON-encoded tool call arguments into the object form Anthropic and
 * Gemini expect. Unparseable or non-object arguments are preserved under
 * `rawArguments` rather than dropped (same convention as the Bedrock mapper).
 */
export function parseToolArguments(args: string): Record<string, unknown> {
  if (!args) return {};
  try {
    const parsed: unknown = JSON.parse(args);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through: keep the raw text so the model still sees it
  }
  return { rawArguments: args };
}

/**
 * Tool result text as an object, for APIs whose tool results must be objects
 * (Gemini `functionResponse.response`). JSON objects pass through; anything
 * else is wrapped as `{ result }`.
 */
export function toolResultObject(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { result: parsed };
  } catch {
    return { result: text };
  }
}
