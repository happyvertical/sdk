/**
 * Factory function and type guards for @happyvertical/email package
 */

import type {
  AdapterType,
  EmailClient,
  GetEmailClientOptions,
  GmailOptions,
  IMAPOptions,
  POP3Options,
  SMTPOptions,
} from './types';

// ============================================================================
// Type Guards
// ============================================================================

export function isSMTPOptions(
  opts: GetEmailClientOptions,
): opts is SMTPOptions {
  return opts.type === 'smtp';
}

export function isIMAPOptions(
  opts: GetEmailClientOptions,
): opts is IMAPOptions {
  return opts.type === 'imap';
}

export function isPOP3Options(
  opts: GetEmailClientOptions,
): opts is POP3Options {
  return opts.type === 'pop3';
}

export function isGmailOptions(
  opts: GetEmailClientOptions,
): opts is GmailOptions {
  return opts.type === 'gmail';
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an email client adapter instance
 *
 * @param options - Configuration options for the email client adapter
 * @returns Promise resolving to an EmailClient instance
 *
 * @example
 * ```typescript
 * // SMTP adapter
 * const smtp = await getEmailClient({
 *   type: 'smtp',
 *   host: 'smtp.gmail.com',
 *   port: 587,
 *   auth: { user: 'user@gmail.com', pass: 'password' }
 * });
 *
 * // IMAP adapter
 * const imap = await getEmailClient({
 *   type: 'imap',
 *   host: 'imap.gmail.com',
 *   port: 993,
 *   secure: true,
 *   auth: { user: 'user@gmail.com', pass: 'password' }
 * });
 *
 * // Gmail adapter
 * const gmail = await getEmailClient({
 *   type: 'gmail',
 *   auth: {
 *     clientId: 'CLIENT_ID',
 *     clientSecret: 'CLIENT_SECRET',
 *     refreshToken: 'REFRESH_TOKEN'
 *   }
 * });
 * ```
 */
export async function getEmailClient(
  options: GetEmailClientOptions,
): Promise<EmailClient> {
  // Load environment variables if not provided
  const opts = await loadEnvironmentConfig(options);

  // Create adapter based on type
  if (isSMTPOptions(opts)) {
    const { SMTPAdapter } = await import('../adapters/smtp.js');
    return new SMTPAdapter(opts);
  }

  if (isIMAPOptions(opts)) {
    const { IMAPAdapter } = await import('../adapters/imap.js');
    return new IMAPAdapter(opts);
  }

  if (isPOP3Options(opts)) {
    const { POP3Adapter } = await import('../adapters/pop3.js');
    return new POP3Adapter(opts);
  }

  if (isGmailOptions(opts)) {
    const { GmailAdapter } = await import('../adapters/gmail.js');
    return new GmailAdapter(opts);
  }

  throw new Error(
    `Unknown email client type: ${(opts as { type: string }).type}`,
  );
}

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Load configuration from environment variables
 *
 * Environment variables follow the pattern: HAVE_EMAIL_*
 *
 * Common variables:
 * - HAVE_EMAIL_TYPE: Adapter type (smtp, imap, pop3, gmail)
 * - HAVE_EMAIL_HOST: Server host
 * - HAVE_EMAIL_PORT: Server port
 * - HAVE_EMAIL_SECURE: Use TLS/SSL (true/false)
 * - HAVE_EMAIL_USER: Username/email
 * - HAVE_EMAIL_PASSWORD: Password
 * - HAVE_EMAIL_DEBUG: Enable debug logging (true/false)
 *
 * SMTP-specific:
 * - HAVE_EMAIL_SMTP_HOST
 * - HAVE_EMAIL_SMTP_PORT
 * - HAVE_EMAIL_SMTP_SECURE
 *
 * IMAP-specific:
 * - HAVE_EMAIL_IMAP_HOST
 * - HAVE_EMAIL_IMAP_PORT
 * - HAVE_EMAIL_IMAP_SECURE
 *
 * Gmail-specific:
 * - HAVE_EMAIL_GMAIL_CLIENT_ID
 * - HAVE_EMAIL_GMAIL_CLIENT_SECRET
 * - HAVE_EMAIL_GMAIL_REFRESH_TOKEN
 */
async function loadEnvironmentConfig(
  options: GetEmailClientOptions,
): Promise<GetEmailClientOptions> {
  // If type is not provided, try to load from environment
  if (!options.type && process.env.HAVE_EMAIL_TYPE) {
    options = {
      ...(options as object),
      type: process.env.HAVE_EMAIL_TYPE as AdapterType,
    } as GetEmailClientOptions;
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
      process.env.HAVE_EMAIL_SMTP_HOST ||
      process.env.HAVE_EMAIL_HOST ||
      '',
    port:
      options.port ||
      Number.parseInt(
        process.env.HAVE_EMAIL_SMTP_PORT ||
          process.env.HAVE_EMAIL_PORT ||
          '587',
        10,
      ),
    secure:
      options.secure ??
      (process.env.HAVE_EMAIL_SMTP_SECURE || process.env.HAVE_EMAIL_SECURE) ===
        'true',
    auth:
      options.auth ||
      ({
        user: process.env.HAVE_EMAIL_USER || process.env.HAVE_EMAIL_SMTP_USER,
        pass:
          process.env.HAVE_EMAIL_PASSWORD ||
          process.env.HAVE_EMAIL_SMTP_PASSWORD,
      } as SMTPOptions['auth']),
    debug: options.debug ?? process.env.HAVE_EMAIL_DEBUG === 'true',
  };
}

function loadIMAPEnvironmentConfig(options: IMAPOptions): IMAPOptions {
  return {
    ...options,
    host:
      options.host ||
      process.env.HAVE_EMAIL_IMAP_HOST ||
      process.env.HAVE_EMAIL_HOST ||
      '',
    port:
      options.port ||
      Number.parseInt(
        process.env.HAVE_EMAIL_IMAP_PORT ||
          process.env.HAVE_EMAIL_PORT ||
          '993',
        10,
      ),
    secure:
      options.secure ??
      (process.env.HAVE_EMAIL_IMAP_SECURE || process.env.HAVE_EMAIL_SECURE) ===
        'true',
    auth: options.auth || {
      user: process.env.HAVE_EMAIL_USER || process.env.HAVE_EMAIL_IMAP_USER,
      pass:
        process.env.HAVE_EMAIL_PASSWORD || process.env.HAVE_EMAIL_IMAP_PASSWORD,
    },
    debug: options.debug ?? process.env.HAVE_EMAIL_DEBUG === 'true',
  };
}

function loadPOP3EnvironmentConfig(options: POP3Options): POP3Options {
  return {
    ...options,
    host:
      options.host ||
      process.env.HAVE_EMAIL_POP3_HOST ||
      process.env.HAVE_EMAIL_HOST ||
      '',
    port:
      options.port ||
      Number.parseInt(
        process.env.HAVE_EMAIL_POP3_PORT ||
          process.env.HAVE_EMAIL_PORT ||
          '995',
        10,
      ),
    secure:
      options.secure ??
      (process.env.HAVE_EMAIL_POP3_SECURE || process.env.HAVE_EMAIL_SECURE) ===
        'true',
    auth: options.auth || {
      user: process.env.HAVE_EMAIL_USER || process.env.HAVE_EMAIL_POP3_USER,
      pass:
        process.env.HAVE_EMAIL_PASSWORD || process.env.HAVE_EMAIL_POP3_PASSWORD,
    },
    debug: options.debug ?? process.env.HAVE_EMAIL_DEBUG === 'true',
  };
}

function loadGmailEnvironmentConfig(options: GmailOptions): GmailOptions {
  return {
    ...options,
    auth: options.auth || {
      clientId: process.env.HAVE_EMAIL_GMAIL_CLIENT_ID || '',
      clientSecret: process.env.HAVE_EMAIL_GMAIL_CLIENT_SECRET || '',
      refreshToken: process.env.HAVE_EMAIL_GMAIL_REFRESH_TOKEN || '',
      accessToken: process.env.HAVE_EMAIL_GMAIL_ACCESS_TOKEN,
    },
    userId: options.userId || process.env.HAVE_EMAIL_GMAIL_USER_ID || 'me',
    debug: options.debug ?? process.env.HAVE_EMAIL_DEBUG === 'true',
  };
}
