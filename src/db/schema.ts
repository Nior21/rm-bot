export const migrations = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id INTEGER NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  redmine_api_key TEXT NOT NULL,
  redmine_project_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chats (
  chat_id INTEGER PRIMARY KEY,
  title TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  root_message_id INTEGER,
  redmine_issue_id INTEGER,
  redmine_issue_url TEXT,
  draft_json TEXT NOT NULL,
  formatted_text TEXT,
  missing_fields_json TEXT,
  created_by_telegram_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clarifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_thread_id INTEGER NOT NULL,
  field_key TEXT NOT NULL,
  options_json TEXT NOT NULL,
  resolved_value TEXT,
  telegram_message_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_thread_id) REFERENCES task_threads(id)
);

CREATE TABLE IF NOT EXISTS phonebook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  contact_name TEXT,
  phone_e164 TEXT NOT NULL,
  alt_phones_json TEXT DEFAULT '[]',
  UNIQUE(company, contact_name, phone_e164)
);

CREATE TABLE IF NOT EXISTS feedback_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id INTEGER,
  chat_id INTEGER,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  cursor_agent_id TEXT,
  git_commit TEXT,
  deploy_ok INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_threads_chat ON task_threads(chat_id);
CREATE INDEX IF NOT EXISTS idx_phonebook_company ON phonebook(company);
`;
