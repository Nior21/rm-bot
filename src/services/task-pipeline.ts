import { getAccountByTelegramId } from "../db/index.js";
import { formatTaskMessagePlain } from "./formatter.js";
import { enrichDraftFromPhonebook } from "./phonebook-match.js";
import { createRedmineIssue } from "./redmine.js";
import {
  FIELD_LABELS,
  missingRegulationFields,
  parseTaskFromText,
  type RegulationField,
  type TaskDraft,
} from "./task-draft.js";

export type ProcessTaskResult = {
  draft: TaskDraft;
  formatted: string;
  missing: RegulationField[];
  missingLabels: string[];
  ambiguities: ReturnType<typeof enrichDraftFromPhonebook>["ambiguities"];
  notes: string[];
  redmineCreated: boolean;
};

export async function processTaskText(
  text: string,
  telegramUserId: number,
  opts?: { defaultWeek?: boolean; createRedmine?: boolean },
): Promise<ProcessTaskResult> {
  let draft = parseTaskFromText(text, { defaultWeek: opts?.defaultWeek ?? true });
  const enriched = enrichDraftFromPhonebook(draft);
  draft = enriched.draft;

  const missing = missingRegulationFields(draft);
  const missingLabels = missing.map((m) => FIELD_LABELS[m]);

  let redmineCreated = false;
  if ((opts?.createRedmine ?? true) && !draft.redmineUrl) {
    const account = getAccountByTelegramId(telegramUserId);
    if (account?.redmine_api_key && account.redmine_project_id) {
      const subject =
        [draft.company, draft.contactName].filter(Boolean).join(" — ") ||
        "Задача из Telegram";
      const description = formatTaskMessagePlain(draft);
      try {
        const issue = await createRedmineIssue({
          subject,
          description,
          projectId: account.redmine_project_id,
          apiKey: account.redmine_api_key,
        });
        draft.redmineIssueId = issue.id;
        draft.redmineUrl = issue.url;
        redmineCreated = true;
      } catch (e) {
        enriched.notes.push(
          `Redmine: не удалось создать задачу (${e instanceof Error ? e.message : String(e)})`,
        );
      }
    } else if (!draft.redmineUrl) {
      enriched.notes.push(
        "Redmine: привяжите API-ключ в веб-интерфейсе (аккаунт Telegram).",
      );
    }
  }

  const formatted = formatTaskMessagePlain(draft);
  return {
    draft,
    formatted,
    missing,
    missingLabels,
    ambiguities: enriched.ambiguities,
    notes: enriched.notes,
    redmineCreated,
  };
}

export function applyDraftPatch(draft: TaskDraft, field: string, value: string): TaskDraft {
  const next = { ...draft };
  if (field === "contactName") next.contactName = value;
  return next;
}
