import { loadSettings } from "../config.js";
import { updateFeedback } from "../db/index.js";

const CURSOR_API = "https://api.cursor.com";

/** Запуск Cursor-агента по заявке. Не бросает исключения наружу. */
export async function spawnFeedbackAgent(
  ticketId: number,
  prompt: string,
): Promise<string | null> {
  const key = loadSettings().cursorApiKey;
  if (!key) {
    console.warn("[feedback] CURSOR_API_KEY не задан — заявка только в БД");
    return null;
  }

  const repo = process.env.CURSOR_REPO_URL?.trim();
  if (!repo) {
    console.warn(
      "[feedback] CURSOR_REPO_URL не задан — заявка #%s сохранена, агент не запускаем",
      ticketId,
    );
    return null;
  }

  try {
    const body: Record<string, unknown> = {
      prompt: {
        text: `[rm-bot feedback #${ticketId}]\n${prompt}`,
      },
      source: {
        repository: repo,
        ref: process.env.CURSOR_GIT_REF || "main",
      },
    };

    const res = await fetch(`${CURSOR_API}/v0/agents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[feedback] Cursor API", res.status, text.slice(0, 400));
      updateFeedback(ticketId, { status: "cursor_failed" });
      return null;
    }

    let data: { id?: string; agent_id?: string };
    try {
      data = (await res.json()) as { id?: string; agent_id?: string };
    } catch {
      console.error("[feedback] Cursor API: ответ не JSON");
      updateFeedback(ticketId, { status: "cursor_failed" });
      return null;
    }

    const agentId = data.id ?? data.agent_id ?? null;
    if (agentId) {
      updateFeedback(ticketId, { status: "cursor", cursor_agent_id: agentId });
    }
    return agentId;
  } catch (e) {
    console.error("[feedback] Cursor spawn error:", e);
    updateFeedback(ticketId, { status: "cursor_failed" });
    return null;
  }
}
