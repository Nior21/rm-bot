import { normalizePhoneE164, extractPhonesFromText } from "./phone.js";
import type { TaskDraft } from "./task-draft.js";

const ADD_PHONE = /(?:добав(ь|ить)|внес(и|ить)|укаж(и|ить))[^\n]{0,40}телефон/i;
const ADD_CONTACT = /(?:добав(ь|ить)|уточн(и|ить))[^\n]{0,40}(имя|контакт)/i;

export type EnrichIntent = {
  addPhones: string[];
  setContactName: string | null;
  shouldDeleteReply: boolean;
};

export function parseReplyEnrichment(text: string): EnrichIntent {
  const intent: EnrichIntent = {
    addPhones: [],
    setContactName: null,
    shouldDeleteReply: false,
  };
  if (ADD_PHONE.test(text)) {
    intent.addPhones = extractPhonesFromText(text)
      .map((p) => normalizePhoneE164(p))
      .filter((p): p is string => !!p);
    intent.shouldDeleteReply = intent.addPhones.length > 0;
  }
  if (ADD_CONTACT.test(text)) {
    const m = text.match(/контакт[:\s]+([A-Za-zА-Яа-яЁё\-]+)/i);
    if (m) {
      intent.setContactName = m[1]!;
      intent.shouldDeleteReply = true;
    }
  }
  return intent;
}

export function mergeEnrichment(draft: TaskDraft, intent: EnrichIntent): TaskDraft {
  const next = { ...draft, phones: [...draft.phones], extraPhones: [...draft.extraPhones] };
  for (const p of intent.addPhones) {
    if (!next.phones.includes(p) && !next.extraPhones.includes(p)) {
      next.phones.push(p);
    }
  }
  if (intent.setContactName) next.contactName = intent.setContactName;
  return next;
}
