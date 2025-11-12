/**
 * Factory function and type guards for @happyvertical/messages package
 */

import type {
  GetMailboxOptions,
  GmailOptions,
  IMAPOptions,
  Mailbox,
  POP3Options,
  SMTPOptions,
} from './types';

// Import adapters (will be implemented)
// import { SMTPAdapter } from '../adapters/smtp';
// import { IMAPAdapter } from '../adapters/imap';
// import { POP3Adapter } from '../adapters/pop3';
// import { GmailAdapter } from '../adapters/gmail';

// ============================================================================
// Type Guards
// ============================================================================

export function isSMTPOptions(opts: GetMailboxOptions): opts is SMTPOptions {
  return opts.type === 'smtp';
}

export function isIMAPOptions(opts: GetMailboxOptions): opts is IMAPOptions {
  return opts.type === 'imap';
}

export function isPOP3Options(opts: GetMailboxOptions): opts is POP3Options {
  return opts.type === 'pop3';
}

export function isGmailOptions(opts: GetMailboxOptions): opts is GmailOptions {
  return opts.type === 'gmail';
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a mailbox adapter instance
 *
 * @param options - Configuration options for the mailbox adapter
 * @returns Promise resolving to a Mailbox instance
 *
 * @example
 * ```typescript
 * // SMTP adapter
 * const smtp = await getMailbox({
 *   type: 'smtp',
 *   host: 'smtp.gmail.com',
 *   port: 587,
 *   auth: { user: 'user@gmail.com', pass: 'password' }
 * });
 *
 * // IMAP adapter
 * const imap = await getMailbox({
 *   type: 'imap',
 *   host: 'imap.gmail.com',
 *   port: 993,
 *   secure: true,
 *   auth: { user: 'user@gmail.com', pass: 'password' }
 * });
 *
 * // Gmail adapter
 * const gmail = await getMailbox({
 *   type: 'gmail',
 *   auth: {
 *     clientId: 'CLIENT_ID',
 *     clientSecret: 'CLIENT_SECRET',
 *     refreshToken: 'REFRESH_TOKEN'
 *   }
 * });
 * ```
 */
export async function getMailbox(options: GetMailboxOptions): Promise<Mailbox> {
  // Load environment variables if not provided
  const opts = await loadEnvironmentConfig(options);

  // Create adapter based on type
  if (isSMTPOptions(opts)) {
    // return new SMTPAdapter(opts);
    throw new Error('SMTP adapter not yet implemented');
  }

  if (isIMAPOptions(opts)) {
    // return new IMAPAdapter(opts);
    throw new Error('IMAP adapter not yet implemented');
  }

  if (isPOP3Options(opts)) {
    // return new POP3Adapter(opts);
    throw new Error('POP3 adapter not yet implemented');
  }

  if (isGmailOptions(opts)) {
    // return new GmailAdapter(opts);
    throw new Error('Gmail adapter not yet implemented');
  }

  throw new Error(`Unknown mailbox type: ${opts.type}`);
}

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Load configuration from environment variables
 *
 * Environment variables follow the pattern: HAVE_MESSAGES_*
 *
 * Common variables:
 * - HAVE_MESSAGES_TYPE: Adapter type (smtp, imap, pop3, gmail)
 * - HAVE_MESSAGES_HOST: Server host
 * - HAVE_MESSAGES_PORT: Server port
 * - HAVE_MESSAGES_SECURE: Use TLS/SSL (true/false)
 * - HAVE_MESSAGES_USER: Username/email
 * - HAVE_MESSAGES_PASSWORD: Password
 * - HAVE_MESSAGES_DEBUG: Enable debug logging (true/false)
 *
 * SMTP-specific:
 * - HAVE_MESSAGES_SMTP_HOST
 * - HAVE_MESSAGES_SMTP_PORT
 * - HAVE_MESSAGES_SMTP_SECURE
 *
 * IMAP-specific:
 * - HAVE_MESSAGES_IMAP_HOST
 * - HAVE_MESSAGES_IMAP_PORT
 * - HAVE_MESSAGES_IMAP_SECURE
 *
 * Gmail-specific:
 * - HAVE_MESSAGES_GMAIL_CLIENT_ID
 * - HAVE_MESSAGES_GMAIL_CLIENT_SECRET
 * - HAVE_MESSAGES_GMAIL_REFRESH_TOKEN
 *
 * Database:
 * - HAVE_MESSAGES_DB_TYPE: Database type (sqlite, postgres)
 * - HAVE_MESSAGES_DB_URL: Database connection URL
 */
async function loadEnvironmentConfig(
  options: GetMailboxOptions,
): Promise<GetMailboxOptions> {
  // If type is not provided, try to load from environment
  if (!options.type && process.env.HAVE_MESSAGES_TYPE) {
    options = {
      ...options,
      type: process.env.HAVE_MESSAGES_TYPE as AdapterType,
    };
  }

  // Load type-specific environment variables
  if (options.type === 'smtp') {
    return loadSMTPEnvironmentConfig(options as SMTPOptions);
  }

  if (options.type === 'imap') {
    return loadIMAPEnvironmentConfig(options as IMAPOptions);
  }

  if (options.type === 'pop3') {
    return loadPOP3EnvironmentConfig(options as POP3Options);
  }

  if (options.type === 'gmail') {
    return loadGmailEnvironmentConfig(options as GmailOptions);
  }

  return options;
}

function loadSMTPEnvironmentConfig(options: SMTPOptions): SMTPOptions {
  return {
    ...options,
    host:
      options.host ||
      process.env.HAVE_MESSAGES_SMTP_HOST ||
      process.env.HAVE_MESSAGES_HOST ||
      '',
    port:
      options.port ||
      Number.parseInt(
        process.env.HAVE_MESSAGES_SMTP_PORT ||
          process.env.HAVE_MESSAGES_PORT ||
          '587',
        10,
      ),
    secure:
      options.secure ??
      (process.env.HAVE_MESSAGES_SMTP_SECURE ||
        process.env.HAVE_MESSAGES_SECURE) === 'true',
    auth: options.auth || {
      user:
        process.env.HAVE_MESSAGES_USER || process.env.HAVE_MESSAGES_SMTP_USER,
      pass:
        process.env.HAVE_MESSAGES_PASSWORD ||
        process.env.HAVE_MESSAGES_SMTP_PASSWORD,
    },
    debug: options.debug ?? process.env.HAVE_MESSAGES_DEBUG === 'true',
  };
}

function loadIMAPEnvironmentConfig(options: IMAPOptions): IMAPOptions {
  return {
    ...options,
    host:
      options.host ||
      process.env.HAVE_MESSAGES_IMAP_HOST ||
      process.env.HAVE_MESSAGES_HOST ||
      '',
    port:
      options.port ||
      Number.parseInt(
        process.env.HAVE_MESSAGES_IMAP_PORT ||
          process.env.HAVE_MESSAGES_PORT ||
          '993',
        10,
      ),
    secure:
      options.secure ??
      (process.env.HAVE_MESSAGES_IMAP_SECURE ||
        process.env.HAVE_MESSAGES_SECURE) === 'true',
    auth: options.auth || {
      user:
        process.env.HAVE_MESSAGES_USER || process.env.HAVE_MESSAGES_IMAP_USER,
      pass:
        process.env.HAVE_MESSAGES_PASSWORD ||
        process.env.HAVE_MESSAGES_IMAP_PASSWORD,
    },
    debug: options.debug ?? process.env.HAVE_MESSAGES_DEBUG === 'true',
  };
}

function loadPOP3EnvironmentConfig(options: POP3Options): POP3Options {
  return {
    ...options,
    host:
      options.host ||
      process.env.HAVE_MESSAGES_POP3_HOST ||
      process.env.HAVE_MESSAGES_HOST ||
      '',
    port:
      options.port ||
      Number.parseInt(
        process.env.HAVE_MESSAGES_POP3_PORT ||
          process.env.HAVE_MESSAGES_PORT ||
          '995',
        10,
      ),
    secure:
      options.secure ??
      (process.env.HAVE_MESSAGES_POP3_SECURE ||
        process.env.HAVE_MESSAGES_SECURE) === 'true',
    auth: options.auth || {
      user:
        process.env.HAVE_MESSAGES_USER || process.env.HAVE_MESSAGES_POP3_USER,
      pass:
        process.env.HAVE_MESSAGES_PASSWORD ||
        process.env.HAVE_MESSAGES_POP3_PASSWORD,
    },
    debug: options.debug ?? process.env.HAVE_MESSAGES_DEBUG === 'true',
  };
}

function loadGmailEnvironmentConfig(options: GmailOptions): GmailOptions {
  return {
    ...options,
    auth: options.auth || {
      clientId: process.env.HAVE_MESSAGES_GMAIL_CLIENT_ID || '',
      clientSecret: process.env.HAVE_MESSAGES_GMAIL_CLIENT_SECRET || '',
      refreshToken: process.env.HAVE_MESSAGES_GMAIL_REFRESH_TOKEN || '',
      accessToken: process.env.HAVE_MESSAGES_GMAIL_ACCESS_TOKEN,
    },
    userId: options.userId || process.env.HAVE_MESSAGES_GMAIL_USER_ID || 'me',
    debug: options.debug ?? process.env.HAVE_MESSAGES_DEBUG === 'true',
  };
}
