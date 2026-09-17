import { loadSettings } from "../config.js";

const CURSOR_API = "https://api.cursor.com";

export type SpawnResult =
  | { ok: true; agentId: string }
  | { ok: false; reason: "no_key" | "no_repo" | "api_error"; detail?: string };

export type CursorAgentStatus = {
  id: string;
  status: string;
  summary?: string;
  target?: {
    prUrl?: string;
    url?: string;
    branchName?: string;
  };
};

export function buildFeedbackAgentPrompt(ticketId: number, body: string): string {
  return [
    `[rm-bot queue job #1 type=feedback]`,
    `Прочитай docs/AGENT_PLAYBOOK.md и следуй роли агента.`,
    `Тип feedback. Заявка #${ticketId}:`,
    ``,
    body,
  ].join("\n");
}

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/** Запуск Cursor-агента. Статус заявки в БД выставляет очередь, не эта функция. */
export async function spawnFeedbackAgent(
  ticketId: number,
  prompt: string,
): Promise<SpawnResult> {
  const key = loadSettings().cursorApiKey;
  if (!key) {
    console.warn("[feedback] CURSOR_API_KEY не задан — заявка только в БД");
    return { ok: false, reason: "no_key" };
  }

  const repo = process.env.CURSOR_REPO_URL?.trim();
  if (!repo) {
    console.warn(
      "[feedback] CURSOR_REPO_URL не задан — заявка #%s в очереди, агент не запускаем",
      ticketId,
    );
    return { ok: false, reason: "no_repo" };
  }

  try {
    const body: Record<string, unknown> = {
      prompt: { text: prompt },
      source: {
        repository: repo,
        ref: process.env.CURSOR_GIT_REF || "main",
      },
      target: { autoCreatePr: true },
    };

    const res = await fetch(`${CURSOR_API}/v0/agents`, {
      method: "POST",
      headers: authHeaders(key),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[feedback] Cursor API", res.status, text.slice(0, 400));
      return { ok: false, reason: "api_error", detail: `HTTP ${res.status}` };
    }

    let data: { id?: string; agent_id?: string };
    try {
      data = (await res.json()) as { id?: string; agent_id?: string };
    } catch {
      console.error("[feedback] Cursor API: ответ не JSON");
      return { ok: false, reason: "api_error", detail: "ответ не JSON" };
    }

    const agentId = data.id ?? data.agent_id;
    if (!agentId) {
      return { ok: false, reason: "api_error", detail: "нет id агента" };
    }
    return { ok: true, agentId };
  } catch (e) {
    console.error("[feedback] Cursor spawn error:", e);
    return {
      ok: false,
      reason: "api_error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function fetchCursorAgent(agentId: string): Promise<CursorAgentStatus | null> {
  const key = loadSettings().cursorApiKey;
  if (!key) return null;

  try {
    const res = await fetch(`${CURSOR_API}/v0/agents/${encodeURIComponent(agentId)}`, {
      headers: authHeaders(key),
    });
    if (!res.ok) {
      console.error("[feedback] Cursor status", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    return (await res.json()) as CursorAgentStatus;
  } catch (e) {
    console.error("[feedback] Cursor status error:", e);
    return null;
  }
}

const RUNNING_CURSOR = new Set([
  "CREATING",
  "RUNNING",
  "NOT_YET_STARTED",
  "WAITING_FOR_BACKGROUND_WORK",
  "ACTIVE",
  "UNSPECIFIED",
]);

const FAILED_CURSOR = new Set(["ERROR", "EXPIRED", "ARCHIVED", "FAILED"]);

export type CursorPhase = "running" | "done" | "failed" | "unknown";

export function mapCursorStatus(status: string | undefined | null): CursorPhase {
  if (!status) return "unknown";
  const s = status.toUpperCase();
  if (RUNNING_CURSOR.has(s)) return "running";
  if (FAILED_CURSOR.has(s)) return "failed";
  if (s === "FINISHED" || s === "COMPLETED" || s === "IDLE") return "done";
  return "unknown";
}
