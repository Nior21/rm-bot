import { extractWeekFromMessage, defaultWeekLine } from "./dates.js";
import {
  extractPhonesFromText,
  formatPhoneForTelegram,
  normalizePhoneE164,
} from "./phone.js";

export type TaskDraft = {
  weekLine: string | null;
  company: string | null;
  contactName: string | null;
  phones: string[];
  extraPhones: string[];
  description: string | null;
  redmineUrl: string | null;
  redmineIssueId: number | null;
  phoneCorrections: string[];
};

const REDMINE_RE =
  /https?:\/\/track\.grandproject\.ru\/issues\/(\d+)/i;

/** Same-line only — do not match name on the next line after phone */
const NAME_AFTER_PHONE =
  /(?:\+7|8|7)?[\d\s\-()]{10,18}[ \t]+([A-Za-zА-Яа-яЁё\-]{2,})/;
const NAME_BEFORE_PHONE =
  /([A-Za-zА-Яа-яЁё\-]{2,})[ \t]+(?:\+7|8|7)?[\d\s\-()]{10,}/;

export function parseRedmineLink(text: string): { url: string; id: number } | null {
  const m = text.match(REDMINE_RE);
  if (!m) return null;
  return { url: m[0], id: Number(m[1]) };
}

function guessCompany(lines: string[]): string | null {
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("http") || parseRedmineLink(t)) continue;
    if (extractWeekFromMessage(t)) continue;
    if (/^[+\d\s\-()]{10,}$/.test(t)) continue;
    if (/\bВань\b/i.test(t)) continue;
    if (NAME_AFTER_PHONE.test(t) || NAME_BEFORE_PHONE.test(t)) continue;
    if (/:\s*[A-Za-zА-Яа-яЁё\-]{2,}/.test(t) && /\d{10,}/.test(t)) continue;
    if (t.length >= 2 && t.length < 80 && lines.indexOf(line) < 6) {
      return t;
    }
  }
  return null;
}

function guessContactName(text: string): string | null {
  const mVan = text.match(
    /(?:Вань[^\n]*?:\s*|после\s+\S+\s*:\s*)([A-Za-zА-Яа-яЁё\-]{2,})/i,
  );
  if (mVan) return mVan[1]!;
  for (const line of text.split(/\r?\n/)) {
    const mBefore = line.match(NAME_BEFORE_PHONE);
    if (mBefore) return mBefore[1]!;
    const mAfter = line.match(NAME_AFTER_PHONE);
    if (mAfter) return mAfter[1]!;
  }
  return null;
}

function buildDescription(lines: string[], draft: Partial<TaskDraft>): string | null {
  const skip = new Set<string>();
  if (draft.weekLine) skip.add(draft.weekLine);
  if (draft.company) skip.add(draft.company);
  if (draft.redmineUrl) skip.add(draft.redmineUrl);

  const parts: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || skip.has(t)) continue;
    if (parseRedmineLink(t)) continue;
    if (extractWeekFromMessage(t)) continue;
    if (draft.phones?.some((p) => t.includes(formatPhoneForTelegram(p).replace(/-/g, ""))))
      continue;
    if (draft.contactName && t.includes(draft.contactName)) continue;
    if (/^[+\d\s\-()]{10,}$/.test(t)) continue;
    if (/\bВань\b/i.test(t)) continue;
    if (t.length > 8) parts.push(t);
  }
  return parts.join("\n").trim() || null;
}

export function parseTaskFromText(text: string, opts?: { defaultWeek?: boolean }): TaskDraft {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const weekLine =
    extractWeekFromMessage(text) ?? (opts?.defaultWeek ? defaultWeekLine() : null);
  const rm = parseRedmineLink(text);
  const phonesRaw = extractPhonesFromText(text);
  const phones = phonesRaw
    .map((p) => normalizePhoneE164(p))
    .filter((p): p is string => !!p);

  const company = guessCompany(lines);
  const contactName = guessContactName(text);

  const draft: TaskDraft = {
    weekLine,
    company,
    contactName,
    phones,
    extraPhones: [],
    description: null,
    redmineUrl: rm?.url ?? null,
    redmineIssueId: rm?.id ?? null,
    phoneCorrections: [],
  };
  draft.description = buildDescription(lines, draft);
  return draft;
}

export type RegulationField =
  | "weekLine"
  | "company"
  | "contact"
  | "phone"
  | "description"
  | "redmineUrl";

export function missingRegulationFields(d: TaskDraft): RegulationField[] {
  const missing: RegulationField[] = [];
  if (!d.weekLine) missing.push("weekLine");
  if (!d.company) missing.push("company");
  if (!d.contactName) missing.push("contact");
  if (d.phones.length === 0) missing.push("phone");
  if (!d.description) missing.push("description");
  if (!d.redmineUrl) missing.push("redmineUrl");
  return missing;
}

export const FIELD_LABELS: Record<RegulationField, string> = {
  weekLine: "даты недели",
  company: "компания / клиент",
  contact: "имя контакта",
  phone: "телефон",
  description: "краткое описание задачи",
  redmineUrl: "ссылка на задачу в Redmine",
};
