/**
 * Reasoning-text helpers shared by the chat adapters and continuation.
 */

/**
 * Reasoning text an OpenAI-compatible server returned beside the answer.
 * vLLM's reasoning parsers emit `reasoning_content` (older releases) or
 * `reasoning` (newer releases) on the message and on stream deltas; SGLang and
 * several gateways use the same names. Only string values count, so a
 * structured `reasoning` object from another gateway is ignored.
 */
export function readReasoningText(source: unknown): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const record = source as { reasoning_content?: unknown; reasoning?: unknown };
  if (typeof record.reasoning_content === 'string' && record.reasoning_content)
    return record.reasoning_content;
  if (typeof record.reasoning === 'string' && record.reasoning)
    return record.reasoning;
  return undefined;
}

/**
 * Deliver accumulated stream reasoning to `ChatOptions.onReasoning`. Called
 * from a stream's `finally`, so it also runs when the stream fails, is
 * aborted, or the consumer stops early; a throwing callback is swallowed so it
 * can neither break the stream nor mask the stream's own error.
 */
export function reportReasoning(
  callback: ((reasoning: string) => void) | undefined,
  reasoning: string,
): void {
  if (!callback || !reasoning) return;
  try {
    callback(reasoning);
  } catch {
    // Diagnostic callback only; its failure must not change the stream.
  }
}
