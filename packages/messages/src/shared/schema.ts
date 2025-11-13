/**
 * Database schema for email message storage
 */

import type { DatabaseInterface } from '@happyvertical/sql';

/**
 * Initialize database schema for email messages
 */
export async function initializeSchema(db: DatabaseInterface): Promise<void> {
  // Email accounts table
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      provider_type TEXT NOT NULL,
      settings TEXT NOT NULL,
      last_sync_at TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Folders/Labels table
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_folders (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      delimiter TEXT DEFAULT '/',
      special_use TEXT,
      message_count INTEGER DEFAULT 0,
      unread_count INTEGER DEFAULT 0,
      subscribed INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
      UNIQUE (account_id, path)
    )
  `);

  // Messages table
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_messages (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      thread_id TEXT,
      in_reply_to TEXT,
      from_address TEXT NOT NULL,
      from_name TEXT,
      to_addresses TEXT NOT NULL,
      cc_addresses TEXT,
      bcc_addresses TEXT,
      reply_to_address TEXT,
      reply_to_name TEXT,
      subject TEXT NOT NULL,
      date TEXT NOT NULL,
      text_body TEXT,
      html_body TEXT,
      folder_id TEXT,
      folder_path TEXT,
      labels TEXT,
      flags TEXT,
      is_read INTEGER DEFAULT 0,
      is_flagged INTEGER DEFAULT 0,
      is_answered INTEGER DEFAULT 0,
      is_draft INTEGER DEFAULT 0,
      has_attachments INTEGER DEFAULT 0,
      size INTEGER,
      raw_message TEXT,
      headers TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES email_folders(id) ON DELETE SET NULL,
      UNIQUE (account_id, message_id)
    )
  `);

  // Attachments table
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      filename TEXT,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      content_id TEXT,
      content_disposition TEXT,
      content BLOB,
      file_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES email_messages(id) ON DELETE CASCADE
    )
  `);

  // Indexes for performance
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_account_folder
      ON email_messages(account_id, folder_id)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_date
      ON email_messages(date DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_read
      ON email_messages(is_read)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_thread
      ON email_messages(thread_id)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_attachments_message
      ON email_attachments(message_id)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_folders_account
      ON email_folders(account_id)
  `);

  // Full-text search (SQLite only)
  try {
    await db.query(`
      CREATE VIRTUAL TABLE IF NOT EXISTS email_messages_fts USING fts5(
        subject,
        text_body,
        from_address,
        content='email_messages',
        content_rowid='rowid'
      )
    `);
  } catch (_error) {
    // Ignore FTS errors for non-SQLite databases
  }
}
