import { InlineKeyboard } from "grammy";
import type { Api, Context } from "grammy";
import {
  getClarification,
  getTaskThread,
  getTaskThreadByRootMessage,
  insertClarification,
  insertTaskThread,
  resolveClarification,
  setClarificationMessageId,
  updateTaskThreadDraft,
} from "../db/index.js";
import { formatTaskMessagePlain } from "../services/formatter.js";
import { formatMissingReminder } from "../services/markdown-v2.js";
import { mergeEnrichment, parseReplyEnrichment } from "../services/reply-enrich.js";
import { applyDraftPatch, processTaskText } from "../services/task-pipeline.js";
import {
  FIELD_LABELS,
  missingRegulationFields,
  type TaskDraft,
} from "../services/task-draft.js";

export async function runTaskFromText(
  ctx: Context,
  text: string,
  opts?: { replyToMessageId?: number },
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const result = await processTaskText(text, userId, {
    defaultWeek: true,
    createRedmine: true,
  });

  let body = result.formatted;
  if (result.notes.length) {
    body += "\n\n—\n" + result.notes.join("\n");
  }

  const sent = await ctx.reply(body, {
    reply_to_message_id: opts?.replyToMessageId,
    link_preview_options: { is_disabled: true },
  });

  const threadId = insertTaskThread({
    chat_id: ctx.chat!.id,
    root_message_id: sent.message_id,
    redmine_issue_id: result.draft.redmineIssueId ?? undefined,
    redmine_issue_url: result.draft.redmineUrl ?? undefined,
    draft_json: JSON.stringify(result.draft),
    formatted_text: body,
    missing_fields_json: JSON.stringify(result.missing),
    created_by_telegram_id: userId,
  });

  if (result.missingLabels.length) {
    await ctx.api.sendMessage(ctx.chat!.id, formatMissingReminder(result.missingLabels), {
      parse_mode: "MarkdownV2",
      reply_to_message_id: sent.message_id,
    });
  }

  for (const amb of result.ambiguities) {
    const clarId = insertClarification({
      task_thread_id: threadId,
      field_key: amb.field,
      options_json: JSON.stringify(amb.options),
    });
    const kb = new InlineKeyboard();
    for (const opt of amb.options) {
      kb.text(opt.label, `clar:${clarId}:${encodeURIComponent(opt.value)}`).row();
    }
    const msg = await ctx.reply(`Уточните контакт для «${result.draft.company}»:`, {
      reply_markup: kb,
      reply_to_message_id: sent.message_id,
    });
    setClarificationMessageId(clarId, msg.message_id);
  }
}

export async function handleClarificationCallback(
  api: Api,
  data: string,
  chatId: number,
  messageId: number,
): Promise<void> {
  const m = data.match(/^clar:(\d+):(.+)$/);
  if (!m) return;
  const clarId = Number(m[1]);
  const value = decodeURIComponent(m[2]!);
  const clar = getClarification(clarId);
  if (!clar) return;

  resolveClarification(clarId, value);
  const thread = getTaskThread(clar.task_thread_id);
  if (!thread) return;

  let draft = JSON.parse(thread.draft_json) as TaskDraft;
  draft = applyDraftPatch(draft, clar.field_key, value);
  const formatted = formatTaskMessagePlain(draft);
  const missing = missingRegulationFields(draft);

  updateTaskThreadDraft(
    thread.id,
    JSON.stringify(draft),
    formatted,
    JSON.stringify(missing),
  );

  await api.editMessageText(chatId, messageId, `Выбрано: ${value}`);
  await api.sendMessage(chatId, formatted, {
    reply_to_message_id: thread.root_message_id ?? undefined,
    link_preview_options: { is_disabled: true },
  });

  if (missing.length) {
    const labels = missing.map((f) => FIELD_LABELS[f]);
    await api.sendMessage(chatId, formatMissingReminder(labels), {
      parse_mode: "MarkdownV2",
      reply_to_message_id: thread.root_message_id ?? undefined,
    });
  }
}

export async function handleReplyToTaskThread(ctx: Context): Promise<boolean> {
  const reply = ctx.message?.reply_to_message;
  if (!reply || !ctx.message?.text) return false;

  const thread = getTaskThreadByRootMessage(ctx.chat!.id, reply.message_id);
  if (!thread) return false;

  const intent = parseReplyEnrichment(ctx.message.text);
  if (!intent.addPhones.length && !intent.setContactName) return false;

  let draft = JSON.parse(thread.draft_json) as TaskDraft;
  draft = mergeEnrichment(draft, intent);
  const formatted = formatTaskMessagePlain(draft);
  const missing = missingRegulationFields(draft);

  updateTaskThreadDraft(thread.id, JSON.stringify(draft), formatted, JSON.stringify(missing));

  await ctx.reply("Обновил карточку задачи:", { reply_to_message_id: reply.message_id });
  await ctx.reply(formatted, {
    reply_to_message_id: reply.message_id,
    link_preview_options: { is_disabled: true },
  });

  if (intent.shouldDeleteReply) {
    try {
      await ctx.deleteMessage();
    } catch {
      /* no rights */
    }
  }
  return true;
}
