/**
 * Prompt-cache hint helpers shared by the providers that forward
 * `cache_control` (Anthropic and Bifrost).
 */

import type { AICacheHint, AIMessage, TextContentPart } from './types';

/** Anthropic-format cache breakpoint (`cache_control`). */
export interface CacheControlWire {
  type: 'ephemeral';
  ttl?: '5m' | '1h';
}

/** A text block of a message, with its resolved cache breakpoint. */
export interface CacheableTextBlock {
  text: string;
  cacheControl?: CacheControlWire;
}

/** Wire form of a hint, or `undefined` when the hint is absent. */
export function toCacheControl(
  hint: AICacheHint | undefined,
): CacheControlWire | undefined {
  if (!hint) return undefined;
  if (hint === true || !hint.ttl) return { type: 'ephemeral' };
  return { type: 'ephemeral', ttl: hint.ttl };
}

/** Whether the message, or any of its text parts, carries a cache hint. */
export function hasCacheHint(message: AIMessage): boolean {
  if (message.cacheHint) return true;
  return (
    Array.isArray(message.content) &&
    message.content.some((part) => part.type === 'text' && part.cacheHint)
  );
}

/**
 * Text of a message as blocks, each with its own breakpoint. A message-level
 * hint lands on the last non-empty text block unless that block has its own.
 * Empty blocks never carry a breakpoint (providers reject them).
 */
export function toCacheableTextBlocks(
  message: AIMessage,
): CacheableTextBlock[] {
  const parts: { text: string; hint?: AICacheHint }[] =
    typeof message.content === 'string'
      ? [{ text: message.content }]
      : message.content
          .filter((part): part is TextContentPart => part.type === 'text')
          .map((part) => ({ text: part.text, hint: part.cacheHint }));

  const blocks: CacheableTextBlock[] = parts.map((part) => ({
    text: part.text,
    cacheControl: part.text ? toCacheControl(part.hint) : undefined,
  }));

  if (message.cacheHint) {
    for (let index = blocks.length - 1; index >= 0; index--) {
      if (!blocks[index].text) continue;
      blocks[index].cacheControl ??= toCacheControl(message.cacheHint);
      break;
    }
  }
  return blocks;
}
