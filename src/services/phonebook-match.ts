import { searchPhonebook, type PhonebookRow } from "../db/index.js";
import {
  correctPhoneTypo,
  digitsOnly,
  formatPhoneForTelegram,
  normalizePhoneE164,
} from "./phone.js";
import type { TaskDraft } from "./task-draft.js";

export type ContactAmbiguity = {
  field: "contactName";
  options: { label: string; value: string }[];
};

export function enrichDraftFromPhonebook(draft: TaskDraft): {
  draft: TaskDraft;
  ambiguities: ContactAmbiguity[];
  notes: string[];
} {
  const notes: string[] = [];
  const ambiguities: ContactAmbiguity[] = [];
  if (!draft.company) {
    return { draft, ambiguities, notes };
  }

  const rows = searchPhonebook(draft.company, draft.contactName ?? undefined);
  if (rows.length === 0) return { draft, ambiguities, notes };

  const allPhones = collectCandidatePhones(rows);
  if (draft.phones.length > 0 && allPhones.length > 0) {
    const fixed: string[] = [];
    for (const p of draft.phones) {
      const c = correctPhoneTypo(p, allPhones);
      if (c) {
        if (c.corrected) {
          notes.push(
            `Телефон исправлен по справочнику: ${formatPhoneForTelegram(p)} → ${formatPhoneForTelegram(c.phone)}`,
          );
        }
        fixed.push(c.phone);
      } else {
        fixed.push(p);
      }
    }
    draft.phones = [...new Set(fixed)];
  }

  const byName = groupByContactName(rows);
  if (!draft.contactName && byName.size === 1) {
    draft.contactName = [...byName.keys()][0]!;
  } else if (draft.contactName) {
    const matches = rows.filter(
      (r) =>
        r.contact_name &&
        r.contact_name.toLowerCase().includes(draft.contactName!.toLowerCase()),
    );
    const distinctNames = [...new Set(matches.map((m) => m.contact_name!).filter(Boolean))];
    if (distinctNames.length > 1) {
      ambiguities.push({
        field: "contactName",
        options: distinctNames.map((n) => ({ label: n, value: n })),
      });
    }
  } else if (byName.size > 1) {
    ambiguities.push({
      field: "contactName",
      options: [...byName.keys()].map((n) => ({ label: n, value: n })),
    });
  }

  const primaryRow = pickRow(rows, draft.contactName);
  if (primaryRow) {
    if (draft.phones.length === 0 && primaryRow.phone_e164) {
      draft.phones = [primaryRow.phone_e164];
      notes.push("Телефон взят из телефонной книги.");
    }
    const alts = parseAlts(primaryRow);
    for (const a of alts) {
      if (!draft.phones.includes(a) && !draft.extraPhones.includes(a)) {
        draft.extraPhones.push(a);
      }
    }
    if (draft.extraPhones.length) {
      notes.push("Добавлены запасные номера из справочника.");
    }
    if (!draft.company) draft.company = primaryRow.company;
  }

  return { draft, ambiguities, notes };
}

function collectCandidatePhones(rows: PhonebookRow[]): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const n = normalizePhoneE164(r.phone_e164);
    if (n) s.add(n);
    for (const a of parseAlts(r)) s.add(a);
  }
  return [...s];
}

function parseAlts(row: PhonebookRow): string[] {
  try {
    const arr = JSON.parse(row.alt_phones_json) as string[];
    return arr.map((x) => normalizePhoneE164(x)).filter((x): x is string => !!x);
  } catch {
    return [];
  }
}

function groupByContactName(rows: PhonebookRow[]): Map<string, PhonebookRow[]> {
  const m = new Map<string, PhonebookRow[]>();
  for (const r of rows) {
    const name = r.contact_name ?? "Без имени";
    const list = m.get(name) ?? [];
    list.push(r);
    m.set(name, list);
  }
  return m;
}

function pickRow(rows: PhonebookRow[], contactName: string | null): PhonebookRow | undefined {
  if (contactName) {
    const m = rows.find(
      (r) => r.contact_name?.toLowerCase() === contactName.toLowerCase(),
    );
    if (m) return m;
  }
  return rows[0];
}

export function mergePhoneLines(draft: TaskDraft): string[] {
  const lines: string[] = [];
  const main = draft.phones[0];
  if (main) {
    const phone = formatPhoneForTelegram(main);
    lines.push(draft.contactName ? `${phone} ${draft.contactName}` : phone);
  } else if (draft.contactName) {
    lines.push(draft.contactName);
  }
  for (const extra of draft.extraPhones) {
    if (extra === main) continue;
    lines.push(formatPhoneForTelegram(extra));
  }
  return lines;
}
