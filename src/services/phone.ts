const DIGITS = /\d/g;

export function digitsOnly(raw: string): string {
  return (raw.match(DIGITS) ?? []).join("");
}

export function normalizePhoneE164(raw: string): string | null {
  let d = digitsOnly(raw);
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10 && d.startsWith("9")) d = "7" + d;
  if (d.length === 11 && d.startsWith("7")) return "+" + d;
  if (d.length >= 11 && d.startsWith("7")) return "+" + d.slice(0, 11);
  return null;
}

export function formatPhoneForTelegram(e164: string): string {
  const d = digitsOnly(e164);
  if (d.length !== 11 || !d.startsWith("7")) return e164;
  return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

export function correctPhoneTypo(
  raw: string,
  candidates: string[],
): { phone: string; corrected: boolean } | null {
  const norm = normalizePhoneE164(raw);
  if (norm && candidates.includes(norm)) return { phone: norm, corrected: false };
  const d = digitsOnly(raw);
  if (d.length < 9) return norm ? { phone: norm, corrected: false } : null;

  let best: { phone: string; dist: number } | null = null;
  for (const c of candidates) {
    const cd = digitsOnly(c);
    if (cd.length !== 11) continue;
    const dist = levenshtein(d.padStart(11, "0").slice(-11), cd);
    if (dist <= 2 && (!best || dist < best.dist)) {
      best = { phone: c.startsWith("+") ? c : "+" + cd, dist };
    }
  }
  if (best) return { phone: best.phone, corrected: best.dist > 0 };
  return norm ? { phone: norm, corrected: false } : null;
}

export function extractPhonesFromText(text: string): string[] {
  const found = new Set<string>();
  const re = /(?:\+7|8|7)?[\s\-()]?(?:\d[\s\-()]?){9,10}\d/g;
  for (const m of text.match(re) ?? []) {
    const n = normalizePhoneE164(m);
    if (n) found.add(n);
  }
  return [...found];
}
