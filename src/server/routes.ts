import { Router } from "express";
import { loadSettings, saveSettings, type AppSettings } from "../config.js";
import {
  deleteAccount,
  getFeedback,
  listAccounts,
  listChats,
  listFeedback,
  replacePhonebook,
  searchPhonebook,
  upsertAccount,
  upsertChat,
  updateFeedback,
} from "../db/index.js";
import { restartBot } from "../bot/index.js";
import { getQueueSnapshot, tickAgentQueue } from "../services/agent-queue.js";
import { normalizePhoneE164 } from "../services/phone.js";
import { listRedmineProjects } from "../services/redmine.js";

const ADMIN_ID = 233097427;

export function createApiRouter(requireAdmin: (req: import("express").Request) => boolean) {
  const r = Router();

  r.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  r.get("/settings", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const s = loadSettings();
    res.json({
      ...s,
      telegramBotToken: mask(s.telegramBotToken),
      cursorApiKey: mask(s.cursorApiKey),
      webAdminSecret: mask(s.webAdminSecret),
    });
  });

  r.put("/settings", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const body = req.body as Partial<AppSettings> & {
      telegramBotToken?: string;
      cursorApiKey?: string;
      webAdminSecret?: string;
    };
    const patch: Partial<AppSettings> = {};
    if (body.adminTelegramId !== undefined) patch.adminTelegramId = Number(body.adminTelegramId);
    if (body.redmineBaseUrl) patch.redmineBaseUrl = body.redmineBaseUrl;
    if (body.webPort !== undefined) patch.webPort = Number(body.webPort);
    if (body.botUsername) patch.botUsername = body.botUsername;
    if (body.telegramBotToken && !body.telegramBotToken.includes("•")) {
      patch.telegramBotToken = body.telegramBotToken;
    }
    if (body.cursorApiKey && !body.cursorApiKey.includes("•")) {
      patch.cursorApiKey = body.cursorApiKey;
    }
    if (body.webAdminSecret && !body.webAdminSecret.includes("•")) {
      patch.webAdminSecret = body.webAdminSecret;
    }
    const next = saveSettings(patch);
    restartBot().catch(console.error);
    res.json(next);
  });

  r.get("/accounts", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const rows = listAccounts().map((a) => ({
      ...a,
      redmine_api_key: mask(a.redmine_api_key),
    }));
    res.json(rows);
  });

  r.post("/accounts", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const { telegram_user_id, display_name, redmine_api_key, redmine_project_id, active } =
      req.body;
    upsertAccount({
      telegram_user_id: Number(telegram_user_id),
      display_name: String(display_name),
      redmine_api_key: String(redmine_api_key),
      redmine_project_id:
        redmine_project_id !== undefined && redmine_project_id !== ""
          ? Number(redmine_project_id)
          : null,
      active: active !== false,
    });
    res.json({ ok: true });
  });

  r.post("/redmine/projects", async (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const apiKey = String(req.body?.api_key ?? "").trim();
    if (!apiKey || apiKey.includes("•")) {
      res.status(400).json({ error: "api_key required" });
      return;
    }
    try {
      const projects = await listRedmineProjects(apiKey);
      res.json(projects);
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.delete("/accounts/:telegramUserId", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    deleteAccount(Number(req.params.telegramUserId));
    res.json({ ok: true });
  });

  r.get("/chats", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.json(listChats());
  });

  r.post("/chats", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const { chat_id, title, enabled, notes } = req.body;
    upsertChat({
      chat_id: Number(chat_id),
      title: title ? String(title) : undefined,
      enabled: enabled !== false,
      notes: notes ? String(notes) : undefined,
    });
    res.json({ ok: true });
  });

  r.get("/phonebook", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const q = String(req.query.q || "");
    res.json(q ? searchPhonebook(q) : searchPhonebook(""));
  });

  r.put("/phonebook", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const rows = (req.body as { rows: unknown[] }).rows ?? req.body;
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: "rows array expected" });
      return;
    }
    const normalized = (rows as Record<string, unknown>[]).map((row) => {
      const phone = normalizePhoneE164(String(row.phone_e164 ?? row.phone ?? ""));
      if (!phone) throw new Error("invalid phone");
      return {
        company: String(row.company),
        contact_name: row.contact_name ? String(row.contact_name) : undefined,
        phone_e164: phone,
        alt_phones: Array.isArray(row.alt_phones)
          ? row.alt_phones.map(String)
          : undefined,
      };
    });
    replacePhonebook(normalized);
    res.json({ ok: true, count: normalized.length });
  });

  r.get("/feedback", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.json(listFeedback());
  });

  r.get("/queue", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.json(getQueueSnapshot());
  });

  r.post("/queue/tick", async (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const snapshot = await tickAgentQueue();
      res.json(snapshot);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.post("/feedback/:id/run-cursor", async (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const id = Number(req.params.id);
    const row = getFeedback(id);
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    try {
      if (!["in_progress", "cursor", "queued", "open"].includes(row.status)) {
        updateFeedback(id, {
          status: "queued",
          cursor_agent_id: null,
          started_at: null,
          finished_at: null,
        });
      }
      const snapshot = await tickAgentQueue();
      res.json({ ok: true, snapshot });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.post("/bot/restart", async (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    restartBot().catch(console.error);
    res.json({ ok: true });
  });

  r.get("/meta/admin", (_req, res) => {
    res.json({ adminTelegramId: ADMIN_ID, username: "Nior90" });
  });

  return r;
}

function mask(value?: string): string | undefined {
  if (!value) return value;
  if (value.length <= 6) return "••••••";
  return value.slice(0, 3) + "•••" + value.slice(-3);
}
