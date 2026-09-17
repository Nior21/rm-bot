/** Escape for Telegram MarkdownV2 */
export function escapeMd2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export function boldMd2(text: string): string {
  return `*${escapeMd2(text)}*`;
}

export function monoMd2(text: string): string {
  return `\`${escapeMd2(text)}\``;
}

export function formatMissingReminder(missing: string[]): string {
  const lines = missing.map((m) => `• ${escapeMd2(m)}`);
  return `${boldMd2("По регламенту не хватает:")}\n${lines.join("\n")}`;
}

export function formatCredentialsBlock(title: string, login: string, password: string): string {
  return `${boldMd2(title)}\nЛогин: ${monoMd2(login)}\nПароль: ${monoMd2(password)}`;
}
