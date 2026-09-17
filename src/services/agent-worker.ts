import { setQueueRuntime, tickAgentQueue } from "./agent-queue.js";

const INTERVAL_MS = 20_000;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

async function safeTick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    await tickAgentQueue();
  } catch (e) {
    console.error("[queue] tick error", e);
  } finally {
    ticking = false;
  }
}

export function startAgentWorker(): void {
  stopAgentWorker();
  void safeTick();
  timer = setInterval(() => void safeTick(), INTERVAL_MS);
  console.log("[queue] worker started, interval", INTERVAL_MS, "ms");
}

export function stopAgentWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
