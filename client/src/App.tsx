import { useCallback, useEffect, useState } from "react";
import { api, getSecret, setSecret } from "./api";

type Settings = {
  telegramBotToken?: string;
  cursorApiKey?: string;
  adminTelegramId: number;
  redmineBaseUrl: string;
  webPort: number;
  webAdminSecret?: string;
  botUsername?: string;
};

type Account = {
  id: number;
  telegram_user_id: number;
  display_name: string;
  redmine_api_key: string;
  redmine_project_id: number | null;
  active: number;
};

type Chat = {
  chat_id: number;
  title: string | null;
  enabled: number;
  notes: string | null;
};

type Feedback = {
  id: number;
  body: string;
  status: string;
  cursor_agent_id: string | null;
  deploy_ok: number | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  result_summary?: string | null;
  pr_url?: string | null;
};

type QueueSnapshot = {
  current: Feedback | null;
  extraInProgress: Feedback[];
  waiting: Feedback[];
  recentDone: Feedback[];
};

type RedmineProject = { id: number; name: string; identifier: string };

type Tab = "settings" | "accounts" | "chats" | "phonebook" | "feedback";

export function App() {
  const [tab, setTab] = useState<Tab>("settings");
  const [secret, setSecretState] = useState(getSecret());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [queue, setQueue] = useState<QueueSnapshot | null>(null);
  const [phoneJson, setPhoneJson] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rmProjects, setRmProjects] = useState<RedmineProject[]>([]);
  const [rmProjectId, setRmProjectId] = useState<string>("");

  const load = useCallback(async () => {
    setErr(null);
    try {
      if (tab === "settings") setSettings(await api<Settings>("/settings"));
      if (tab === "accounts") setAccounts(await api<Account[]>("/accounts"));
      if (tab === "chats") setChats(await api<Chat[]>("/chats"));
      if (tab === "feedback") {
        const [rows, snap] = await Promise.all([
          api<Feedback[]>("/feedback"),
          api<QueueSnapshot>("/queue"),
        ]);
        setFeedback(rows);
        setQueue(snap);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setErr(raw.includes("forbidden") ? "Доступ запрещён (forbidden): неверный секрет админа." : raw);
    }
  }, [tab]);

  useEffect(() => {
    if (secret) load();
  }, [secret, tab, load]);

  useEffect(() => {
    if (!secret || tab !== "feedback") return;
    const t = setInterval(() => {
      load().catch(() => undefined);
    }, 10_000);
    return () => clearInterval(t);
  }, [secret, tab, load]);

  function saveSecret() {
    setSecret(secret);
    setMsg("Секрет сохранён в sessionStorage");
  }

  async function saveSettingsForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!settings) return;
    setMsg(null);
    setErr(null);
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify(settings) });
      setMsg("Настройки сохранены, бот перезапускается");
      await load();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setErr(raw.includes("forbidden") ? "Доступ запрещён (forbidden): неверный секрет админа." : raw);
    }
  }

  async function addAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/accounts", {
      method: "POST",
      body: JSON.stringify({
        telegram_user_id: fd.get("telegram_user_id"),
        display_name: fd.get("display_name"),
        redmine_api_key: fd.get("redmine_api_key"),
        redmine_project_id: fd.get("redmine_project_id"),
      }),
    });
    e.currentTarget.reset();
    setMsg("Аккаунт сохранён");
    load();
  }

  async function addChat(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/chats", {
      method: "POST",
      body: JSON.stringify({
        chat_id: fd.get("chat_id"),
        title: fd.get("title"),
        enabled: fd.get("enabled") === "on",
        notes: fd.get("notes"),
      }),
    });
    e.currentTarget.reset();
    setMsg("Чат сохранён");
    load();
  }

  async function importPhonebook() {
    const rows = JSON.parse(phoneJson);
    await api("/phonebook", { method: "PUT", body: JSON.stringify({ rows }) });
    setMsg("Телефонная книга обновлена");
  }

  return (
    <div className="wrap">
      <h1>RM Bot — панель администратора (Ivan / @Nior90)</h1>

      <div className="card">
        <label>Web admin secret (X-Admin-Secret)</label>
        <div className="row">
          <input
            value={secret}
            onChange={(e) => setSecretState(e.target.value)}
            placeholder="из .env WEB_ADMIN_SECRET"
          />
          <button type="button" onClick={saveSecret}>
            Применить
          </button>
        </div>
        <p style={{ fontSize: "0.85rem", color: "#666" }}>
          Интерфейс слушает только 127.0.0.1 — доступ с ноутбука локально.
        </p>
      </div>

      <div className="tabs">
        {(
          [
            ["settings", "Настройки"],
            ["accounts", "Аккаунты RM"],
            ["chats", "Чаты"],
            ["phonebook", "Телефонная книга"],
            ["feedback", "Заявки"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && <p className="ok">{msg}</p>}
      {err && <p className="err">{err}</p>}

      {tab === "settings" && settings && (
        <form className="card" onSubmit={saveSettingsForm}>
          <div className="row">
            <div>
              <label>Telegram bot token</label>
              <input
                value={settings.telegramBotToken ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, telegramBotToken: e.target.value })
                }
              />
            </div>
            <div>
              <label>Cursor API key</label>
              <input
                value={settings.cursorApiKey ?? ""}
                onChange={(e) => setSettings({ ...settings, cursorApiKey: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <div>
              <label>Admin Telegram ID</label>
              <input
                type="number"
                value={settings.adminTelegramId}
                onChange={(e) =>
                  setSettings({ ...settings, adminTelegramId: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label>Redmine URL</label>
              <input
                value={settings.redmineBaseUrl}
                onChange={(e) => setSettings({ ...settings, redmineBaseUrl: e.target.value })}
              />
            </div>
          </div>
          <button type="submit">Сохранить и перезапустить бота</button>
        </form>
      )}

      {tab === "accounts" && (
        <>
          <form className="card" onSubmit={addAccount}>
            <h3 style={{ marginTop: 0 }}>Привязка Telegram → Redmine API key</h3>
            <div className="row">
              <div>
                <label>Telegram user id</label>
                <input name="telegram_user_id" required placeholder="233097427" />
              </div>
              <div>
                <label>Имя</label>
                <input name="display_name" required placeholder="Ivan" />
              </div>
            </div>
            <label>Redmine API key</label>
            <input name="redmine_api_key" required />
            <label>Project ID в Redmine</label>
            <input name="redmine_project_id" type="number" required />
            <button type="submit">Сохранить аккаунт</button>
          </form>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>TG id</th>
                  <th>Project</th>
                  <th>Key</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.display_name}</td>
                    <td>{a.telegram_user_id}</td>
                    <td>{a.redmine_project_id ?? "—"}</td>
                    <td>{a.redmine_api_key}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "chats" && (
        <>
          <form className="card" onSubmit={addChat}>
            <h3 style={{ marginTop: 0 }}>Чат, где работает бот</h3>
            <label>Chat ID (отрицательный для групп)</label>
            <input name="chat_id" required />
            <label>Название</label>
            <input name="title" />
            <label>
              <input type="checkbox" name="enabled" defaultChecked /> Включён
            </label>
            <label>Заметки</label>
            <textarea name="notes" rows={2} />
            <button type="submit">Сохранить чат</button>
          </form>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Название</th>
                  <th>On</th>
                </tr>
              </thead>
              <tbody>
                {chats.map((c) => (
                  <tr key={c.chat_id}>
                    <td>{c.chat_id}</td>
                    <td>{c.title}</td>
                    <td>{c.enabled ? "да" : "нет"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "phonebook" && (
        <div className="card">
          <p>JSON-массив: company, contact_name, phone_e164, alt_phones[]</p>
          <textarea
            rows={12}
            value={phoneJson}
            onChange={(e) => setPhoneJson(e.target.value)}
            placeholder='[{"company":"Техстройсервис","contact_name":"Елена","phone_e164":"+79032697432","alt_phones":[]}]'
          />
          <button type="button" onClick={() => importPhonebook().catch(setErr)}>
            Загрузить в базу
          </button>
        </div>
      )}

      {tab === "feedback" && (
        <div className="card">
          <div className="queue-banner">
            {queue?.current ? (
              <>
                <strong>Сейчас в работе:</strong> #{queue.current.id} — {queue.current.body.slice(0, 120)}
                {queue.current.started_at ? ` (с ${queue.current.started_at})` : ""}
              </>
            ) : (
              <strong>Сейчас в работе: никто. Агент свободен.</strong>
            )}
            {queue && queue.waiting.length > 0 && (
              <p style={{ margin: "0.5rem 0 0" }}>
                В очереди ({queue.waiting.length}):{" "}
                {queue.waiting.map((t) => `#${t.id}`).join(", ")}
              </p>
            )}
            {queue && queue.waiting.length === 0 && (
              <p style={{ margin: "0.5rem 0 0" }}>Очередь пуста.</p>
            )}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              api("/queue/tick", { method: "POST", body: "{}" })
                .then(() => load())
                .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
            }
          >
            Обновить статусы
          </button>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Статус</th>
                <th>Текст</th>
                <th>Cursor</th>
                <th>Когда</th>
              </tr>
            </thead>
            <tbody>
              {feedback.map((f) => (
                <tr
                  key={f.id}
                  className={
                    f.status === "in_progress" || f.status === "cursor" ? "current-job" : ""
                  }
                >
                  <td>{f.id}</td>
                  <td>
                    <span className={`status-pill status-${normalizeStatus(f.status)}`}>
                      {statusLabel(f.status)}
                    </span>
                  </td>
                  <td>
                    {f.body.slice(0, 120)}
                    {f.pr_url ? (
                      <>
                        <br />
                        <a href={f.pr_url} target="_blank" rel="noreferrer">
                          PR
                        </a>
                      </>
                    ) : null}
                  </td>
                  <td>{f.cursor_agent_id ?? "—"}</td>
                  <td>{f.started_at || f.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function normalizeStatus(status: string): string {
  if (status === "open") return "queued";
  if (status === "cursor") return "in_progress";
  if (status === "cursor_failed") return "failed";
  return status;
}

function statusLabel(status: string): string {
  switch (normalizeStatus(status)) {
    case "queued":
      return "в очереди";
    case "in_progress":
      return "в работе";
    case "done":
      return "готово";
    case "failed":
      return "ошибка";
    default:
      return status;
  }
}
