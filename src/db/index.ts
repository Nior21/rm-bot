import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { migrations } from "./schema.js";

const dbPath = path.join(process.cwd(), "data", "rm-bot.db");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath);
    try {
      db.exec("PRAGMA journal_mode = WAL");
    } catch {
      /* ignore */
    }
    db.exec(migrations);
  }
  return db;
}

export type AccountRow = {
  id: number;
  telegram_user_id: number;
  display_name: string;
  redmine_api_key: string;
  redmine_project_id: number | null;
  active: number;
};

export function listAccounts(): AccountRow[] {
  return getDb()
    .prepare("SELECT * FROM accounts ORDER BY display_name")
    .all() as AccountRow[];
}

export function upsertAccount(row: {
  telegram_user_id: number;
  display_name: string;
  redmine_api_key: string;
  redmine_project_id?: number | null;
  active?: boolean;
}): void {
  getDb()
    .prepare(
      `INSERT INTO accounts (telegram_user_id, display_name, redmine_api_key, redmine_project_id, active)
       VALUES (@telegram_user_id, @display_name, @redmine_api_key, @redmine_project_id, @active)
       ON CONFLICT(telegram_user_id) DO UPDATE SET
         display_name = excluded.display_name,
         redmine_api_key = excluded.redmine_api_key,
         redmine_project_id = excluded.redmine_project_id,
         active = excluded.active`,
    )
    .run({
      telegram_user_id: row.telegram_user_id,
      display_name: row.display_name,
      redmine_api_key: row.redmine_api_key,
      redmine_project_id: row.redmine_project_id ?? null,
      active: row.active === false ? 0 : 1,
    });
}

export function deleteAccount(telegramUserId: number): void {
  getDb()
    .prepare("DELETE FROM accounts WHERE telegram_user_id = ?")
    .run(telegramUserId);
}

export function getAccountByTelegramId(
  telegramUserId: number,
): AccountRow | undefined {
  return getDb()
    .prepare("SELECT * FROM accounts WHERE telegram_user_id = ? AND active = 1")
    .get(telegramUserId) as AccountRow | undefined;
}

export function listChats(): { chat_id: number; title: string | null; enabled: number; notes: string | null }[] {
  return getDb()
    .prepare("SELECT chat_id, title, enabled, notes FROM chats ORDER BY title")
    .all() as {
    chat_id: number;
    title: string | null;
    enabled: number;
    notes: string | null;
  }[];
}

export function upsertChat(chat: {
  chat_id: number;
  title?: string;
  enabled?: boolean;
  notes?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO chats (chat_id, title, enabled, notes, updated_at)
       VALUES (@chat_id, @title, @enabled, @notes, datetime('now'))
       ON CONFLICT(chat_id) DO UPDATE SET
         title = COALESCE(excluded.title, chats.title),
         enabled = excluded.enabled,
         notes = COALESCE(excluded.notes, chats.notes),
         updated_at = datetime('now')`,
    )
    .run({
      chat_id: chat.chat_id,
      title: chat.title ?? null,
      enabled: chat.enabled === false ? 0 : 1,
      notes: chat.notes ?? null,
    });
}

export function isChatEnabled(chatId: number): boolean {
  const row = getDb()
    .prepare("SELECT enabled FROM chats WHERE chat_id = ?")
    .get(chatId) as { enabled: number } | undefined;
  return row ? row.enabled === 1 : true;
}

export function insertTaskThread(row: {
  chat_id: number;
  root_message_id?: number;
  redmine_issue_id?: number;
  redmine_issue_url?: string;
  draft_json: string;
  formatted_text?: string;
  missing_fields_json?: string;
  created_by_telegram_id?: number;
}): number {
  const r = getDb()
    .prepare(
      `INSERT INTO task_threads
       (chat_id, root_message_id, redmine_issue_id, redmine_issue_url, draft_json, formatted_text, missing_fields_json, created_by_telegram_id)
       VALUES (@chat_id, @root_message_id, @redmine_issue_id, @redmine_issue_url, @draft_json, @formatted_text, @missing_fields_json, @created_by_telegram_id)`,
    )
    .run({
      root_message_id: row.root_message_id ?? null,
      redmine_issue_id: row.redmine_issue_id ?? null,
      redmine_issue_url: row.redmine_issue_url ?? null,
      missing_fields_json: row.missing_fields_json ?? "[]",
      formatted_text: row.formatted_text ?? null,
      created_by_telegram_id: row.created_by_telegram_id ?? null,
      ...row,
    });
  return Number(r.lastInsertRowid);
}

export function getTaskThreadByRootMessage(
  chatId: number,
  messageId: number,
): {
  id: number;
  draft_json: string;
  redmine_issue_url: string | null;
  formatted_text: string | null;
} | undefined {
  return getDb()
    .prepare(
      "SELECT id, draft_json, redmine_issue_url, formatted_text FROM task_threads WHERE chat_id = ? AND root_message_id = ?",
    )
    .get(chatId, messageId) as
    | {
        id: number;
        draft_json: string;
        redmine_issue_url: string | null;
        formatted_text: string | null;
      }
    | undefined;
}

export function updateTaskThreadDraft(
  id: number,
  draftJson: string,
  formattedText: string,
  missingJson: string,
): void {
  getDb()
    .prepare(
      "UPDATE task_threads SET draft_json = ?, formatted_text = ?, missing_fields_json = ? WHERE id = ?",
    )
    .run(draftJson, formattedText, missingJson, id);
}

export function insertClarification(row: {
  task_thread_id: number;
  field_key: string;
  options_json: string;
  telegram_message_id?: number;
}): number {
  const r = getDb()
    .prepare(
      `INSERT INTO clarifications (task_thread_id, field_key, options_json, telegram_message_id)
       VALUES (@task_thread_id, @field_key, @options_json, @telegram_message_id)`,
    )
    .run({
      telegram_message_id: row.telegram_message_id ?? null,
      ...row,
    });
  return Number(r.lastInsertRowid);
}

export function setClarificationMessageId(id: number, messageId: number): void {
  getDb()
    .prepare("UPDATE clarifications SET telegram_message_id = ? WHERE id = ?")
    .run(messageId, id);
}

export function resolveClarification(id: number, value: string): void {
  getDb()
    .prepare("UPDATE clarifications SET resolved_value = ? WHERE id = ?")
    .run(value, id);
}

export function getClarification(id: number): {
  id: number;
  task_thread_id: number;
  field_key: string;
  options_json: string;
} | undefined {
  return getDb()
    .prepare("SELECT id, task_thread_id, field_key, options_json FROM clarifications WHERE id = ?")
    .get(id) as
    | { id: number; task_thread_id: number; field_key: string; options_json: string }
    | undefined;
}

export function getTaskThread(id: number): {
  id: number;
  chat_id: number;
  root_message_id: number | null;
  draft_json: string;
  formatted_text: string | null;
  redmine_issue_url: string | null;
} | undefined {
  return getDb()
    .prepare(
      "SELECT id, chat_id, root_message_id, draft_json, formatted_text, redmine_issue_url FROM task_threads WHERE id = ?",
    )
    .get(id) as
    | {
        id: number;
        chat_id: number;
        root_message_id: number | null;
        draft_json: string;
        formatted_text: string | null;
        redmine_issue_url: string | null;
      }
    | undefined;
}

export type PhonebookRow = {
  id: number;
  company: string;
  contact_name: string | null;
  phone_e164: string;
  alt_phones_json: string;
};

export function searchPhonebook(company: string, contactName?: string): PhonebookRow[] {
  const norm = company.trim().toLowerCase();
  if (contactName) {
    const name = contactName.trim().toLowerCase();
    return getDb()
      .prepare(
        `SELECT * FROM phonebook
         WHERE lower(company) LIKE '%' || ? || '%'
           AND (contact_name IS NULL OR lower(contact_name) LIKE '%' || ? || '%')`,
      )
      .all(norm, name) as PhonebookRow[];
  }
  return getDb()
    .prepare(`SELECT * FROM phonebook WHERE lower(company) LIKE '%' || ? || '%'`)
    .all(norm) as PhonebookRow[];
}

export function replacePhonebook(rows: {
  company: string;
  contact_name?: string;
  phone_e164: string;
  alt_phones?: string[];
}[]): void {
  const dbi = getDb();
  dbi.exec("BEGIN IMMEDIATE");
  try {
    dbi.prepare("DELETE FROM phonebook").run();
    const ins = dbi.prepare(
      `INSERT INTO phonebook (company, contact_name, phone_e164, alt_phones_json)
       VALUES (@company, @contact_name, @phone_e164, @alt_phones_json)`,
    );
    for (const r of rows) {
      ins.run({
        company: r.company,
        contact_name: r.contact_name ?? null,
        phone_e164: r.phone_e164,
        alt_phones_json: JSON.stringify(r.alt_phones ?? []),
      });
    }
    dbi.exec("COMMIT");
  } catch (e) {
    dbi.exec("ROLLBACK");
    throw e;
  }
}

export function insertFeedback(body: {
  telegram_user_id?: number;
  chat_id?: number;
  body: string;
}): number {
  const r = getDb()
    .prepare(
      `INSERT INTO feedback_tickets (telegram_user_id, chat_id, body) VALUES (@telegram_user_id, @chat_id, @body)`,
    )
    .run({
      telegram_user_id: body.telegram_user_id ?? null,
      chat_id: body.chat_id ?? null,
      body: body.body,
    });
  return Number(r.lastInsertRowid);
}

export function listFeedback(): {
  id: number;
  body: string;
  status: string;
  cursor_agent_id: string | null;
  deploy_ok: number | null;
  created_at: string;
}[] {
  return getDb()
    .prepare(
      "SELECT id, body, status, cursor_agent_id, deploy_ok, created_at FROM feedback_tickets ORDER BY id DESC LIMIT 100",
    )
    .all() as {
    id: number;
    body: string;
    status: string;
    cursor_agent_id: string | null;
    deploy_ok: number | null;
    created_at: string;
  }[];
}

export function updateFeedback(id: number, patch: {
  status?: string;
  cursor_agent_id?: string;
  git_commit?: string;
  deploy_ok?: boolean;
}): void {
  const fields: string[] = ["updated_at = datetime('now')"];
  const params: Record<string, string | number> = { id };
  if (patch.status !== undefined) {
    fields.push("status = @status");
    params.status = patch.status;
  }
  if (patch.cursor_agent_id !== undefined) {
    fields.push("cursor_agent_id = @cursor_agent_id");
    params.cursor_agent_id = patch.cursor_agent_id;
  }
  if (patch.git_commit !== undefined) {
    fields.push("git_commit = @git_commit");
    params.git_commit = patch.git_commit;
  }
  if (patch.deploy_ok !== undefined) {
    fields.push("deploy_ok = @deploy_ok");
    params.deploy_ok = patch.deploy_ok ? 1 : 0;
  }
  getDb()
    .prepare(`UPDATE feedback_tickets SET ${fields.join(", ")} WHERE id = @id`)
    .run(params);
}
