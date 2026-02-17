/**
 * Factory function and type guards for @happyvertical/messages package
 */

import type {
  EmailBridgeOptions,
  GetMessageClientOptions,
  MessageClient,
  SlackOptions,
  TwitterOptions,
} from './types.js';

// ============================================================================
// Type Guards
// ============================================================================

export function isSlackOptions(
  opts: GetMessageClientOptions,
): opts is SlackOptions {
  return opts.type === 'slack';
}

export function isTwitterOptions(
  opts: GetMessageClientOptions,
): opts is TwitterOptions {
  return opts.type === 'twitter';
}

export function isEmailBridgeOptions(
  opts: GetMessageClientOptions,
): opts is EmailBridgeOptions {
  return opts.type === 'email';
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a message client adapter instance
 *
 * @param options - Configuration options for the message client adapter
 * @returns Promise resolving to a MessageClient instance
 *
 * @example
 * ```typescript
 * // Slack adapter
 * const slack = await getMessageClient({
 *   type: 'slack',
 *   botToken: 'xoxb-...',
 * });
 *
 * // Twitter adapter
 * const twitter = await getMessageClient({
 *   type: 'twitter',
 *   apiKey: 'key',
 *   apiSecret: 'secret',
 *   accessToken: 'token',
 *   accessSecret: 'secret',
 * });
 *
 * // Email bridge adapter
 * const email = await getMessageClient({
 *   type: 'email',
 *   emailOptions: { type: 'smtp', host: 'smtp.gmail.com', port: 587, auth: { user: 'x', pass: 'y' } },
 * });
 * ```
 */
export async function getMessageClient(
  options: GetMessageClientOptions,
): Promise<MessageClient> {
  if (isSlackOptions(options)) {
    const { SlackAdapter } = await import('../adapters/slack.js');
    return new SlackAdapter(options);
  }

  if (isTwitterOptions(options)) {
    const { TwitterAdapter } = await import('../adapters/twitter.js');
    return new TwitterAdapter(options);
  }

  if (isEmailBridgeOptions(options)) {
    const { EmailBridgeAdapter } = await import('../adapters/email-bridge.js');
    return new EmailBridgeAdapter(options);
  }

  throw new Error(
    `Unknown message client type: ${(options as { type: string }).type}`,
  );
}
