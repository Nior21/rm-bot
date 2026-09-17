import { Bot, GrammyError, HttpError } from "grammy";
import { loadSettings, saveSettings } from "../config.js";
import { isChatEnabled, upsertChat } from "../db/index.js";
import {
  formatFeedbackAccepted,
  formatQueueStatus,
  getQueueSnapshot,
  setQueueRuntime,
  submitFeedback,
} from "../services/agent-queue.js";
import { adminWebUrls, preferredAdminUrl } from "../services/lan-urls.js";
import {
  handleClarificationCallback,
  handleReplyToTaskThread,
  runTaskFromText,
} from "./task-flow.js";

let botInstance: Bot | null = null;
let pollingTask: Promise<void> | null = null;

function endsWithBotMention(text: string, username?: string): boolean {
  if (!username) return false;
  const t = text.trimEnd();
  return (
    t.endsWith(`@${username}`) ||
    t.toLowerCase().endsWith(`@${username.toLowerCase()}`)
  );
}

export function getBot(): Bot | null {
  return botInstance;
}

export async function startBot(): Promise<void> {
  const settings = loadSettings();
  if (!settings.telegramBotToken) {
    console.warn("[bot] TELEGRAM_BOT_TOKEN не задан — бот не запущен");
    return;
  }

  if (botInstance) {
    await stopBot();
  }

  const bot = new Bot(settings.telegramBotToken);
  botInstance = bot;
  setQueueRuntime({
    notify: async (chatId, text) => {
      await bot.api.sendMessage(chatId, text, { link_preview_options: { is_disabled: true } });
    },
  });

  try {
    const me = await bot.api.getMe();
    if (me.username && me.username !== settings.botUsername) {
      saveSettings({ botUsername: me.username });
    }
    await bot.api.setMyCommands([
      { command: "start", description: "Помощь" },
      { command: "task", description: "Задача из ответа" },
      { command: "feedback", description: "Заявка на доработку" },
      { command: "queue", description: "Что сейчас в работе и очередь" },
      { command: "web", description: "Админка (Ivan)" },
      { command: "ping", description: "Проверка связи" },
    ]);
  } catch (e) {
    console.warn("[bot] getMe/setMyCommands failed:", e);
  }

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "RM Bot\n\n/task — ответом на сообщение менеджера\n/feedback текст — заявка на доработку (очередь, по одной)\n/queue — какая заявка сейчас в работе и что ждёт\n/web — ссылка админки (Ivan)\n/ping — проверка",
    );
  });

  bot.command("web", async (ctx) => {
    const adminId = loadSettings().adminTelegramId;
    if (ctx.from?.id !== adminId) {
      await ctx.reply("Команда только для администратора.");
      return;
    }
    const port = loadSettings().webPort;
    const main = preferredAdminUrl(port);
    const all = adminWebUrls(port);
    const lines = [
      "Откройте в браузере (та же Wi‑Fi, что ноутбук):",
      main ? `\n${main}` : "",
      all.length > 1 ? `\n${all.join("\n")}` : "",
    ].join("");
    await ctx.reply(lines.trim(), { link_preview_options: { is_disabled: true } });
  });

  bot.command("ping", async (ctx) => {
    await ctx.reply("ok");
  });

  bot.command("queue", async (ctx) => {
    await ctx.reply(formatQueueStatus(getQueueSnapshot()));
  });

  bot.command("task", async (ctx) => {
    try {
      const reply = ctx.message?.reply_to_message;
      const text =
        reply && "text" in reply && reply.text
          ? reply.text
          : ctx.message?.text?.replace(/^\/task(@\w+)?\s*/i, "").trim();
      if (!text) {
        await ctx.reply("Ответьте командой /task на сообщение менеджера с данными задачи.");
        return;
      }
      await runTaskFromText(ctx, text, {
        replyToMessageId: reply?.message_id,
      });
    } catch (e) {
      console.error("[bot] /task error:", e);
      await ctx.reply("Ошибка при обработке задачи. Попробуйте ещё раз или напишите Ivan.");
    }
  });

  bot.command("feedback", async (ctx) => {
    try {
      const body = ctx.message?.text?.replace(/^\/feedback(@\w+)?\s*/i, "").trim();
      if (!body) {
        await ctx.reply("Напишите: /feedback ваш текст");
        return;
      }
      const { id, snapshot } = await submitFeedback({
        telegram_user_id: ctx.from?.id,
        chat_id: ctx.chat?.id,
        body,
      });
      await ctx.reply(formatFeedbackAccepted(id, snapshot));
    } catch (e) {
      console.error("[bot] /feedback error:", e);
      await ctx.reply("Не удалось сохранить заявку. Сервер жив — попробуйте позже.");
    }
  });

  bot.on("callback_query:data", async (ctx) => {
    try {
      const data = ctx.callbackQuery.data;
      if (data.startsWith("clar:")) {
        await handleClarificationCallback(
          ctx.api,
          data,
          ctx.chat!.id,
          ctx.callbackQuery.message!.message_id,
        );
        await ctx.answerCallbackQuery();
      } else {
        await ctx.answerCallbackQuery();
      }
    } catch (e) {
      console.error("[bot] callback error:", e);
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  bot.on("message:text", async (ctx) => {
    try {
      if (!ctx.chat || ctx.chat.type === "private") {
        if (ctx.message.text.startsWith("/")) return;
      }

      if (ctx.chat && ctx.chat.type !== "private") {
        upsertChat({
          chat_id: ctx.chat.id,
          title: "title" in ctx.chat ? ctx.chat.title : undefined,
        });
        if (!isChatEnabled(ctx.chat.id)) return;
      }

      if (await handleReplyToTaskThread(ctx)) return;

      const settingsNow = loadSettings();
      const text = ctx.message.text;
      const uname = settingsNow.botUsername;

      if (/^\/task(@\w+)?\s+\S+/i.test(text)) return;

      if (endsWithBotMention(text, uname)) {
        const cleaned = text.replace(new RegExp(`@${uname}\\s*$`, "i"), "").trim();
        await runTaskFromText(ctx, cleaned);
      }
    } catch (e) {
      console.error("[bot] message error:", e);
    }
  });

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[bot] update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error("GrammyError:", e.description);
    } else if (e instanceof HttpError) {
      console.error("HttpError:", e);
    } else {
      console.error(e);
    }
  });

  pollingTask = runPollingResilient(bot);
}

async function runPollingResilient(bot: Bot): Promise<void> {
  let delayMs = 1000;
  const maxDelay = 60_000;
  while (botInstance === bot) {
    try {
      console.log("[bot] polling…");
      delayMs = 1000;
      await bot.start({
        onStart: () => console.log("[bot] started"),
      });
    } catch (e) {
      console.error("[bot] polling error, retry in", delayMs, e);
      await sleep(delayMs);
      delayMs = Math.min(maxDelay, delayMs * 2);
    }
  }
  console.log("[bot] polling stopped");
}

export async function stopBot(): Promise<void> {
  const b = botInstance;
  botInstance = null;
  if (b) {
    b.stop();
    await sleep(800);
  }
  if (pollingTask) {
    await Promise.race([pollingTask, sleep(2000)]);
    pollingTask = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function restartBot(): Promise<void> {
  await stopBot();
  await startBot();
}
