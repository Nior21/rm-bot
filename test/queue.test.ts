import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { afterEach, beforeEach } from "node:test";
import {
  claimNextFeedback,
  closeDb,
  insertFeedback,
  listInProgressFeedback,
  listQueuedFeedback,
  setDbPathForTests,
} from "../src/db/index.js";
import {
  clip,
  formatFeedbackAccepted,
  formatQueueStatus,
  getQueueSnapshot,
  resetQueueRuntime,
  setQueueRuntime,
  statusLabel,
  submitFeedback,
  tickAgentQueue,
  type QueueSnapshot,
} from "../src/services/agent-queue.js";
import {
  buildFeedbackAgentPrompt,
  mapCursorStatus,
} from "../src/services/cursor-api.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rm-bot-queue-"));
  setDbPathForTests(path.join(tmpDir, "t.db"));
  resetQueueRuntime();
});

afterEach(() => {
  closeDb();
  setDbPathForTests(null);
  resetQueueRuntime();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function emptySnapshot(over: Partial<QueueSnapshot> = {}): QueueSnapshot {
  return {
    current: null,
    extraInProgress: [],
    waiting: [],
    recentDone: [],
    ...over,
  };
}

test("mapCursorStatus phases", () => {
  assert.equal(mapCursorStatus("RUNNING"), "running");
  assert.equal(mapCursorStatus("CREATING"), "running");
  assert.equal(mapCursorStatus("ACTIVE"), "running");
  assert.equal(mapCursorStatus("FINISHED"), "done");
  assert.equal(mapCursorStatus("IDLE"), "done");
  assert.equal(mapCursorStatus("ERROR"), "failed");
  assert.equal(mapCursorStatus("EXPIRED"), "failed");
  assert.equal(mapCursorStatus("mystery"), "unknown");
});

test("status labels and clip", () => {
  assert.equal(statusLabel("in_progress"), "в работе");
  assert.equal(statusLabel("queued"), "в очереди");
  assert.equal(statusLabel("open"), "в очереди");
  assert.equal(statusLabel("cursor_failed"), "ошибка");
  assert.equal(clip("abc"), "abc");
  assert.equal(clip("x".repeat(90), 80).endsWith("…"), true);
});

test("formatQueueStatus shows current vs waiting", () => {
  const text = formatQueueStatus(
    emptySnapshot({
      current: {
        id: 3,
        body: "отмечай статус задач",
        status: "in_progress",
        telegram_user_id: 1,
        chat_id: 1,
        cursor_agent_id: "ag-1",
        git_commit: null,
        deploy_ok: null,
        started_at: "2026-09-17 18:00:00",
        finished_at: null,
        result_summary: null,
        pr_url: null,
        created_at: "2026-09-17 17:00:00",
        updated_at: "2026-09-17 18:00:00",
      },
      waiting: [
        {
          id: 4,
          body: "вторая заявка",
          status: "queued",
          telegram_user_id: 1,
          chat_id: 1,
          cursor_agent_id: null,
          git_commit: null,
          deploy_ok: null,
          started_at: null,
          finished_at: null,
          result_summary: null,
          pr_url: null,
          created_at: "2026-09-17 17:05:00",
          updated_at: "2026-09-17 17:05:00",
        },
      ],
    }),
  );
  assert.match(text, /Сейчас в работе/);
  assert.match(text, /#3/);
  assert.match(text, /В очереди \(1\)/);
  assert.match(text, /#4/);
});

test("formatFeedbackAccepted distinguishes in-progress vs queued", () => {
  const current = {
    id: 1,
    body: "первая",
    status: "in_progress",
    telegram_user_id: 1,
    chat_id: 1,
    cursor_agent_id: "ag",
    git_commit: null,
    deploy_ok: null,
    started_at: null,
    finished_at: null,
    result_summary: null,
    pr_url: null,
    created_at: "",
    updated_at: "",
  };
  const waiting = {
    ...current,
    id: 2,
    body: "вторая",
    status: "queued",
    cursor_agent_id: null,
  };
  const started = formatFeedbackAccepted(1, emptySnapshot({ current, waiting: [waiting] }));
  assert.match(started, /беру в работу/);
  const queued = formatFeedbackAccepted(2, emptySnapshot({ current, waiting: [waiting] }));
  assert.match(queued, /поставлена в очередь/);
  assert.match(queued, /позиция в очереди: 1/);
});

test("prompt points agent at playbook and ticket id", () => {
  const p = buildFeedbackAgentPrompt(3, "отмечай статус");
  assert.match(p, /AGENT_PLAYBOOK/);
  assert.match(p, /Заявка #3/);
  assert.match(p, /queue job #1/);
});

test("claimNextFeedback serializes: only one in_progress", () => {
  insertFeedback({ body: "a" });
  insertFeedback({ body: "b" });
  const first = claimNextFeedback();
  const second = claimNextFeedback();
  assert.ok(first);
  assert.equal(first.id, 1);
  assert.equal(first.status, "in_progress");
  assert.equal(second, null);
  assert.equal(listInProgressFeedback().length, 1);
  assert.equal(listQueuedFeedback().length, 1);
  assert.equal(listQueuedFeedback()[0]!.id, 2);
});

test("tick starts one job and leaves the rest queued", async () => {
  const spawned: number[] = [];
  const notes: string[] = [];
  setQueueRuntime({
    spawn: async (id) => {
      spawned.push(id);
      return { ok: true, agentId: `ag-${id}` };
    },
    fetchAgent: async (id) => ({ id, status: "RUNNING" }),
    notify: async (_chatId, text) => {
      notes.push(text);
    },
  });

  const a = await submitFeedback({ body: "первая", chat_id: 10 });
  const b = await submitFeedback({ body: "вторая", chat_id: 10 });

  assert.equal(a.snapshot.current?.id, a.id);
  assert.equal(b.snapshot.waiting.map((t) => t.id).join(","), String(b.id));
  assert.deepEqual(spawned, [a.id]);
  assert.match(notes.join("\n"), /Начинаю заявку #1/);

  const snap = getQueueSnapshot();
  assert.equal(snap.current?.status, "in_progress");
  assert.equal(snap.waiting.length, 1);
});

test("when current agent finishes, next queued job starts", async () => {
  const spawned: number[] = [];
  let phase: Record<string, string> = {};
  setQueueRuntime({
    spawn: async (id) => {
      spawned.push(id);
      phase[`ag-${id}`] = "RUNNING";
      return { ok: true, agentId: `ag-${id}` };
    },
    fetchAgent: async (id) => ({
      id,
      status: phase[id] ?? "RUNNING",
      summary: "ok",
      target: { prUrl: "https://github.com/Nior21/rm-bot/pull/1" },
    }),
    notify: async () => undefined,
  });

  await submitFeedback({ body: "one", chat_id: 1 });
  await submitFeedback({ body: "two", chat_id: 1 });
  assert.deepEqual(spawned, [1]);

  phase["ag-1"] = "FINISHED";
  const snap = await tickAgentQueue();
  assert.equal(snap.current?.id, 2);
  assert.equal(snap.current?.status, "in_progress");
  assert.deepEqual(spawned, [1, 2]);
  assert.equal(snap.waiting.length, 0);
  assert.equal(snap.recentDone[0]?.id, 1);
  assert.equal(snap.recentDone[0]?.status, "done");
  assert.equal(snap.recentDone[0]?.pr_url, "https://github.com/Nior21/rm-bot/pull/1");
});

test("no Cursor key keeps tickets queued instead of hanging as in_progress", async () => {
  setQueueRuntime({
    spawn: async () => ({ ok: false, reason: "no_key" }),
    fetchAgent: async () => null,
    notify: async () => undefined,
  });
  const { snapshot } = await submitFeedback({ body: "ждём ключ" });
  assert.equal(snapshot.current, null);
  assert.equal(snapshot.waiting.length, 1);
  assert.equal(snapshot.waiting[0]!.status, "queued");
});
