const MONTHS: Record<string, number> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
};

const MONTH_GEN = [
  "",
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

function formatDayMonth(d: Date): string {
  return `${d.getDate()} ${MONTH_GEN[d.getMonth() + 1]!}`;
}

export function weekRangeContaining(ref: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diffToMon);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return { start, end };
}

export function formatWeekLine(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()} ${MONTH_GEN[start.getMonth() + 1]} - ${end.getDate()} ${MONTH_GEN[end.getMonth() + 1]}`;
  }
  return `${formatDayMonth(start)} - ${formatDayMonth(end)}`;
}

export function defaultWeekLine(ref: Date = new Date()): string {
  const { start, end } = weekRangeContaining(ref);
  return formatWeekLine(start, end);
}

function normalizeYear(y: number): number {
  if (y < 100) return 2000 + y;
  return y;
}

export function parseWeekLine(text: string): string | null {
  const t = text.trim();
  const m1 = t.match(
    /(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{2,4}))?/i,
  );
  if (m1) {
    const month = MONTHS[m1[3]!.toLowerCase()]!;
    const y = m1[4] ? normalizeYear(Number(m1[4])) : new Date().getFullYear();
    const start = new Date(y, month - 1, Number(m1[1]));
    const end = new Date(y, month - 1, Number(m1[2]));
    return formatWeekLine(start, end);
  }
  const m2 = t.match(
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s*[-–]\s*(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i,
  );
  if (m2) {
    const mStart = MONTHS[m2[2]!.toLowerCase()]!;
    const mEnd = MONTHS[m2[4]!.toLowerCase()]!;
    const y = new Date().getFullYear();
    const start = new Date(y, mStart - 1, Number(m2[1]));
    let end = new Date(y, mEnd - 1, Number(m2[3]));
    if (end < start) end.setFullYear(y + 1);
    return formatWeekLine(start, end);
  }
  return null;
}

export function extractWeekFromMessage(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const p = parseWeekLine(line);
    if (p) return p;
  }
  return null;
}
