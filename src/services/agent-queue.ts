import {
  claimNextFeedback,
  insertFeedback,
  listInProgressFeedback,
  listQueuedFeedback,
  listRecentFinishedFeedback,
  markFeedbackFinished,
  unclaimFeedback,
  updateFeedback,
  type FeedbackRow,
} from "../db/index.js";
import {
  buildFeedbackAgentPrompt,
  fetchCursorAgent,
  mapCursorStatus,
  spawnFeedbackAgent,
  type CursorAgentStatus,
  type SpawnResult,
} from "./cursor-api.js";

export type QueueSnapshot = {
  current: FeedbackRow | null;
  extraInProgress: FeedbackRow[];
  waiting: FeedbackRow[];
  recentDone: FeedbackRow[];
};

export type QueueRuntime = {
  spawn: (ticketId: number, prompt: string) => Promise<SpawnResult>;
  fetchAgent: (id: string) => Promise<CursorAgentStatus | null>;
  notify: (chatId: number, text: string) => Promise<void>;
};

const defaultRuntime: QueueRuntime = {
  spawn: spawnFeedbackAgent,
  fetchAgent: fetchCursorAgent,
  notify: async () => undefined,
};

let runtime: QueueRuntime = { ...defaultRuntime };

export function setQueueRuntime(partial: Partial<QueueRuntime>): void {
  runtime = { ...runtime, ...partial };
}

export function resetQueueRuntime(): void {
  runtime = { ...defaultRuntime };
}

export const STATUS_LABELS: Record<string, string> = {
  queued: "в очереди",
  open: "в очереди",
  in_progress: "в работе",
  cursor: "в работе",
  done: "готово",
  failed: "ошибка",
  cursor_failed: "ошибка",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function clip(text: string, n = 80): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

export function getQueueSnapshot(): QueueSnapshot {
  const inProgress = listInProgressFeedback();
  return {
    current: inProgress[0] ?? null,
    extraInProgress: inProgress.slice(1),
    waiting: listQueuedFeedback(),
    recentDone: listRecentFinishedFeedback(5),
  };
}

function lineFor(ticket: FeedbackRow): string {
  return `#${ticket.id} — ${clip(ticket.body, 70)}`;
}

/** Текст статуса очереди для Telegram и админки. */
export function formatQueueStatus(snapshot: QueueSnapshot): string {
  const lines: string[] = [];

  if (snapshot.current) {
    const since = snapshot.current.started_at ? ` (с ${snapshot.current.started_at})` : "";
    lines.push(`Сейчас в работе:\n${lineFor(snapshot.current)}${since}`);
  } else {
    lines.push("Сейчас в работе: никто. Агент свободен.");
  }

  if (snapshot.extraInProgress.length) {
    lines.push(
      `\nЕщё дорабатываются старые запуски:\n${snapshot.extraInProgress.map(lineFor).join("\n")}`,
    );
  }

  if (snapshot.waiting.length) {
    const listed = snapshot.waiting
      .map((t, i) => `${i + 1}. ${lineFor(t)}`)
      .join("\n");
    lines.push(`\nВ очереди (${snapshot.waiting.length}):\n${listed}`);
  } else {
    lines.push("\nОчередь пуста.");
  }

  if (snapshot.recentDone.length) {
    const listed = snapshot.recentDone
      .map((t) => `#${t.id} — ${statusLabel(t.status)}${t.pr_url ? ` ${t.pr_url}` : ""}`)
      .join("\n");
    lines.push(`\nНедавно:\n${listed}`);
  }

  return lines.join("\n").trim();
}

export function formatFeedbackAccepted(id: number, snapshot: QueueSnapshot): string {
  const waitingIds = snapshot.waiting.map((t) => t.id);
  const position = waitingIds.indexOf(id);
  const current = snapshot.current;

  if (current?.id === id) {
    return [
      `Заявка #${id} принята — беру в работу.`,
      snapshot.waiting.length
        ? `Дальше в очереди: ${snapshot.waiting.map((t) => `#${t.id}`).join(", ")}.`
        : "Других заявок в очереди нет.",
      "Статус: /queue",
    ].join("\n");
  }

  const parts = [`Заявка #${id} сохранена и поставлена в очередь.`];
  if (current) {
    parts.push(`Сейчас в работе: ${lineFor(current)}.`);
  } else {
    parts.push("Сейчас в работе: никто (агент ещё не стартовал).");
  }
  if (position >= 0) {
    parts.push(`Ваша позиция в очереди: ${position + 1} из ${waitingIds.length}.`);
  }
  if (waitingIds.length) {
    parts.push(`Ждут: ${snapshot.waiting.map((t) => `#${t.id}`).join(", ")}.`);
  }
  parts.push("Статус очереди: /queue");
  return parts.join("\n");
}

async function notifyTicket(ticket: FeedbackRow, text: string): Promise<void> {
  if (!ticket.chat_id) return;
  try {
    await runtime.notify(ticket.chat_id, text);
  } catch (e) {
    console.error("[queue] notify failed", e);
  }
}

async function syncInProgress(): Promise<void> {
  const running = listInProgressFeedback();
  for (const ticket of running) {
    if (!ticket.cursor_agent_id) continue;
    const agent = await runtime.fetchAgent(ticket.cursor_agent_id);
    if (!agent) continue;
    const phase = mapCursorStatus(agent.status);
    if (phase === "running" || phase === "unknown") continue;

    const summary = agent.summary?.trim() || null;
    const prUrl = agent.target?.prUrl ?? null;
    if (phase === "done") {
      markFeedbackFinished(ticket.id, "done", { result_summary: summary, pr_url: prUrl });
      const bits = [`Заявка #${ticket.id} готова (${statusLabel("done")}).`];
      if (prUrl) bits.push(`PR: ${prUrl}`);
      if (summary) bits.push(clip(summary, 300));
      await notifyTicket(ticket, bits.join("\n"));
    } else if (phase === "failed") {
      markFeedbackFinished(ticket.id, "failed", { result_summary: summary, pr_url: prUrl });
      await notifyTicket(
        ticket,
        `Заявка #${ticket.id} не выполнена (Cursor: ${agent.status}).`,
      );
    }
  }
}

async function startNextIfIdle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    if (listInProgressFeedback().length > 0) return;

    const claimed = claimNextFeedback();
    if (!claimed) return;

    const prompt = buildFeedbackAgentPrompt(claimed.id, claimed.body);
    const result = await runtime.spawn(claimed.id, prompt);

    if (result.ok) {
      updateFeedback(claimed.id, { cursor_agent_id: result.agentId, status: "in_progress" });
      const waiting = listQueuedFeedback();
      const extra = waiting.length
        ? `\nЕщё в очереди: ${waiting.map((t) => `#${t.id}`).join(", ")}.`
        : "";
      await notifyTicket(
        claimed,
        `Начинаю заявку #${claimed.id}.\n${clip(claimed.body, 120)}${extra}`,
      );
      return;
    }

    if (result.reason === "no_key" || result.reason === "no_repo") {
      unclaimFeedback(claimed.id);
      console.warn(
        "[queue] пропускаю запуск #%s: %s — заявки остаются в очереди",
        claimed.id,
        result.reason,
      );
      return;
    }

    markFeedbackFinished(claimed.id, "failed", {
      result_summary: result.detail ?? result.reason,
    });
    await notifyTicket(
      claimed,
      `Заявка #${claimed.id} не запустилась (${result.detail ?? result.reason}). Беру следующую, если есть.`,
    );
  }
}

/** Один цикл: обновить статусы агентов, при необходимости взять следующую заявку. */
export async function tickAgentQueue(): Promise<QueueSnapshot> {
  await syncInProgress();
  await startNextIfIdle();
  return getQueueSnapshot();
}

export async function submitFeedback(input: {
  body: string;
  telegram_user_id?: number;
  chat_id?: number;
}): Promise<{ id: number; snapshot: QueueSnapshot }> {
  const id = insertFeedback({
    body: input.body,
    telegram_user_id: input.telegram_user_id,
    chat_id: input.chat_id,
    status: "queued",
  });
  const snapshot = await tickAgentQueue();
  return { id, snapshot };
}
