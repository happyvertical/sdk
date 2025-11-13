import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMailbox,
  isGmailOptions,
  isIMAPOptions,
  isPOP3Options,
  isSMTPOptions,
} from '../../src/shared/factory';
import type {
  GmailOptions,
  IMAPOptions,
  POP3Options,
  SMTPOptions,
} from '../../src/shared/types';

describe('Type Guards', () => {
  describe('isSMTPOptions', () => {
    it('should return true for SMTP options', () => {
      const options: SMTPOptions = {
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      expect(isSMTPOptions(options)).toBe(true);
    });

    it('should return false for IMAP options', () => {
      const options: IMAPOptions = {
        type: 'imap',
        host: 'imap.example.com',
        port: 993,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      expect(isSMTPOptions(options)).toBe(false);
    });

    it('should return false for POP3 options', () => {
      const options: POP3Options = {
        type: 'pop3',
        host: 'pop.example.com',
        port: 995,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      expect(isSMTPOptions(options)).toBe(false);
    });

    it('should return false for Gmail options', () => {
      const options: GmailOptions = {
        type: 'gmail',
        auth: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token',
        },
      };

      expect(isSMTPOptions(options)).toBe(false);
    });
  });

  describe('isIMAPOptions', () => {
    it('should return true for IMAP options', () => {
      const options: IMAPOptions = {
        type: 'imap',
        host: 'imap.example.com',
        port: 993,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      expect(isIMAPOptions(options)).toBe(true);
    });

    it('should return false for non-IMAP options', () => {
      const smtp: SMTPOptions = {
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user@example.com', pass: 'password' },
      };
      const pop3: POP3Options = {
        type: 'pop3',
        host: 'pop.example.com',
        port: 995,
        auth: { user: 'user@example.com', pass: 'password' },
      };
      const gmail: GmailOptions = {
        type: 'gmail',
        auth: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token',
        },
      };

      expect(isIMAPOptions(smtp)).toBe(false);
      expect(isIMAPOptions(pop3)).toBe(false);
      expect(isIMAPOptions(gmail)).toBe(false);
    });
  });

  describe('isPOP3Options', () => {
    it('should return true for POP3 options', () => {
      const options: POP3Options = {
        type: 'pop3',
        host: 'pop.example.com',
        port: 995,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      expect(isPOP3Options(options)).toBe(true);
    });

    it('should return false for non-POP3 options', () => {
      const smtp: SMTPOptions = {
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user@example.com', pass: 'password' },
      };
      const imap: IMAPOptions = {
        type: 'imap',
        host: 'imap.example.com',
        port: 993,
        auth: { user: 'user@example.com', pass: 'password' },
      };
      const gmail: GmailOptions = {
        type: 'gmail',
        auth: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token',
        },
      };

      expect(isPOP3Options(smtp)).toBe(false);
      expect(isPOP3Options(imap)).toBe(false);
      expect(isPOP3Options(gmail)).toBe(false);
    });
  });

  describe('isGmailOptions', () => {
    it('should return true for Gmail options', () => {
      const options: GmailOptions = {
        type: 'gmail',
        auth: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token',
        },
      };

      expect(isGmailOptions(options)).toBe(true);
    });

    it('should return false for non-Gmail options', () => {
      const smtp: SMTPOptions = {
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user@example.com', pass: 'password' },
      };
      const imap: IMAPOptions = {
        type: 'imap',
        host: 'imap.example.com',
        port: 993,
        auth: { user: 'user@example.com', pass: 'password' },
      };
      const pop3: POP3Options = {
        type: 'pop3',
        host: 'pop.example.com',
        port: 995,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      expect(isGmailOptions(smtp)).toBe(false);
      expect(isGmailOptions(imap)).toBe(false);
      expect(isGmailOptions(pop3)).toBe(false);
    });
  });
});

describe('getMailbox Factory', () => {
  describe('Adapter Creation', () => {
    it('should create SMTP adapter successfully', async () => {
      const options: SMTPOptions = {
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      const mailbox = await getMailbox(options);

      expect(mailbox).toBeDefined();
      expect(mailbox.getAdapter()).toBe('smtp');
    });

    it('should create IMAP adapter successfully', async () => {
      const options: IMAPOptions = {
        type: 'imap',
        host: 'imap.example.com',
        port: 993,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      const mailbox = await getMailbox(options);

      expect(mailbox).toBeDefined();
      expect(mailbox.getAdapter()).toBe('imap');
    });

    it('should throw error for POP3 (not yet implemented)', async () => {
      const options: POP3Options = {
        type: 'pop3',
        host: 'pop.example.com',
        port: 995,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      await expect(getMailbox(options)).rejects.toThrow(
        'POP3 adapter not yet implemented',
      );
    });

    it('should throw error for Gmail (not yet implemented)', async () => {
      const options: GmailOptions = {
        type: 'gmail',
        auth: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token',
        },
      };

      await expect(getMailbox(options)).rejects.toThrow(
        'Gmail adapter not yet implemented',
      );
    });

    it('should throw error for unknown adapter type', async () => {
      const options = {
        type: 'unknown',
      } as never;

      await expect(getMailbox(options)).rejects.toThrow(
        'Unknown mailbox type',
      );
    });
  });

  describe('Environment Variable Loading', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    describe('SMTP Environment Variables', () => {
      it('should load SMTP-specific environment variables', async () => {
        process.env.HAVE_MESSAGES_SMTP_HOST = 'smtp.env.com';
        process.env.HAVE_MESSAGES_SMTP_PORT = '465';
        process.env.HAVE_MESSAGES_SMTP_SECURE = 'true';
        process.env.HAVE_MESSAGES_SMTP_USER = 'smtp@env.com';
        process.env.HAVE_MESSAGES_SMTP_PASSWORD = 'smtp-pass';

        const options: SMTPOptions = {
          type: 'smtp',
          host: '',
          port: 0,
        };

        const mailbox = await getMailbox(options);
        expect(mailbox).toBeDefined();
        expect(mailbox.getAdapter()).toBe('smtp');
      });

      it('should fall back to generic environment variables', async () => {
        process.env.HAVE_MESSAGES_HOST = 'generic.env.com';
        process.env.HAVE_MESSAGES_PORT = '587';
        process.env.HAVE_MESSAGES_USER = 'generic@env.com';
        process.env.HAVE_MESSAGES_PASSWORD = 'generic-pass';

        const options: SMTPOptions = {
          type: 'smtp',
          host: '',
          port: 0,
        };

        const mailbox = await getMailbox(options);
        expect(mailbox).toBeDefined();
        expect(mailbox.getAdapter()).toBe('smtp');
      });

      it('should prefer explicit options over environment variables', async () => {
        process.env.HAVE_MESSAGES_SMTP_HOST = 'env.example.com';
        process.env.HAVE_MESSAGES_SMTP_PORT = '465';

        const options: SMTPOptions = {
          type: 'smtp',
          host: 'explicit.example.com',
          port: 587,
        };

        const mailbox = await getMailbox(options);
        expect(mailbox).toBeDefined();
        expect(mailbox.getAdapter()).toBe('smtp');
      });

      it('should use default port when not provided', async () => {
        const options: SMTPOptions = {
          type: 'smtp',
          host: 'smtp.example.com',
          port: 0,
        };

        const mailbox = await getMailbox(options);
        expect(mailbox).toBeDefined();
        expect(mailbox.getAdapter()).toBe('smtp');
      });

      it('should load debug flag from environment', async () => {
        process.env.HAVE_MESSAGES_DEBUG = 'true';

        const options: SMTPOptions = {
          type: 'smtp',
          host: 'smtp.example.com',
          port: 587,
        };

        const mailbox = await getMailbox(options);
        expect(mailbox).toBeDefined();
        expect(mailbox.getAdapter()).toBe('smtp');
      });
    });

    describe('IMAP Environment Variables', () => {
      it('should load IMAP-specific environment variables', async () => {
        process.env.HAVE_MESSAGES_IMAP_HOST = 'imap.env.com';
        process.env.HAVE_MESSAGES_IMAP_PORT = '993';
        process.env.HAVE_MESSAGES_IMAP_SECURE = 'true';
        process.env.HAVE_MESSAGES_IMAP_USER = 'imap@env.com';
        process.env.HAVE_MESSAGES_IMAP_PASSWORD = 'imap-pass';

        const options: IMAPOptions = {
          type: 'imap',
          host: '',
          port: 0,
          auth: { user: '', pass: '' },
        };

        const mailbox = await getMailbox(options);
        expect(mailbox).toBeDefined();
        expect(mailbox.getAdapter()).toBe('imap');
      });

      it('should use default IMAP port 993', async () => {
        const options: IMAPOptions = {
          type: 'imap',
          host: 'imap.example.com',
          port: 0,
          auth: { user: 'user@example.com', pass: 'password' },
        };

        const mailbox = await getMailbox(options);
        expect(mailbox).toBeDefined();
        expect(mailbox.getAdapter()).toBe('imap');
      });
    });

    describe('POP3 Environment Variables', () => {
      it('should load POP3-specific environment variables', async () => {
        process.env.HAVE_MESSAGES_POP3_HOST = 'pop.env.com';
        process.env.HAVE_MESSAGES_POP3_PORT = '995';
        process.env.HAVE_MESSAGES_POP3_SECURE = 'true';
        process.env.HAVE_MESSAGES_POP3_USER = 'pop@env.com';
        process.env.HAVE_MESSAGES_POP3_PASSWORD = 'pop-pass';

        const options: POP3Options = {
          type: 'pop3',
          host: '',
          port: 0,
          auth: { user: '', pass: '' },
        };

        await expect(getMailbox(options)).rejects.toThrow(
          'POP3 adapter not yet implemented',
        );
      });

      it('should use default POP3 port 995', async () => {
        const options: POP3Options = {
          type: 'pop3',
          host: 'pop.example.com',
          port: 0,
          auth: { user: 'user@example.com', pass: 'password' },
        };

        await expect(getMailbox(options)).rejects.toThrow(
          'POP3 adapter not yet implemented',
        );
      });
    });

    describe('Gmail Environment Variables', () => {
      it('should load Gmail-specific environment variables', async () => {
        process.env.HAVE_MESSAGES_GMAIL_CLIENT_ID = 'client-id-env';
        process.env.HAVE_MESSAGES_GMAIL_CLIENT_SECRET = 'client-secret-env';
        process.env.HAVE_MESSAGES_GMAIL_REFRESH_TOKEN = 'refresh-token-env';
        process.env.HAVE_MESSAGES_GMAIL_ACCESS_TOKEN = 'access-token-env';
        process.env.HAVE_MESSAGES_GMAIL_USER_ID = 'custom-user-id';

        const options: GmailOptions = {
          type: 'gmail',
          auth: {
            clientId: '',
            clientSecret: '',
            refreshToken: '',
          },
        };

        await expect(getMailbox(options)).rejects.toThrow(
          'Gmail adapter not yet implemented',
        );
      });

      it('should use default userId "me"', async () => {
        const options: GmailOptions = {
          type: 'gmail',
          auth: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            refreshToken: 'refresh-token',
          },
        };

        await expect(getMailbox(options)).rejects.toThrow(
          'Gmail adapter not yet implemented',
        );
      });
    });

    describe('Type Auto-Detection', () => {
      it('should load type from HAVE_MESSAGES_TYPE environment variable', async () => {
        process.env.HAVE_MESSAGES_TYPE = 'smtp';
        process.env.HAVE_MESSAGES_HOST = 'smtp.example.com';
        process.env.HAVE_MESSAGES_PORT = '587';

        const options = {} as never;

        const mailbox = await getMailbox(options);
        expect(mailbox).toBeDefined();
        expect(mailbox.getAdapter()).toBe('smtp');
      });
    });
  });

  describe('Type Safety', () => {
    it('should narrow type with isSMTPOptions', async () => {
      const options: SMTPOptions = {
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      if (isSMTPOptions(options)) {
        // TypeScript should know this is SMTPOptions
        expect(options.host).toBe('smtp.example.com');
        expect(options.port).toBe(587);
      }
    });

    it('should narrow type with isIMAPOptions', async () => {
      const options: IMAPOptions = {
        type: 'imap',
        host: 'imap.example.com',
        port: 993,
        secure: true,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      if (isIMAPOptions(options)) {
        // TypeScript should know this is IMAPOptions
        expect(options.host).toBe('imap.example.com');
        expect(options.port).toBe(993);
        expect(options.secure).toBe(true);
      }
    });

    it('should narrow type with isPOP3Options', async () => {
      const options: POP3Options = {
        type: 'pop3',
        host: 'pop.example.com',
        port: 995,
        leaveOnServer: true,
        auth: { user: 'user@example.com', pass: 'password' },
      };

      if (isPOP3Options(options)) {
        // TypeScript should know this is POP3Options
        expect(options.host).toBe('pop.example.com');
        expect(options.port).toBe(995);
        expect(options.leaveOnServer).toBe(true);
      }
    });

    it('should narrow type with isGmailOptions', async () => {
      const options: GmailOptions = {
        type: 'gmail',
        userId: 'me',
        auth: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token',
        },
      };

      if (isGmailOptions(options)) {
        // TypeScript should know this is GmailOptions
        expect(options.auth.clientId).toBe('client-id');
        expect(options.auth.clientSecret).toBe('client-secret');
        expect(options.userId).toBe('me');
      }
    });
  });
});
