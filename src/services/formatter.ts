import { mergePhoneLines } from "./phonebook-match.js";
import type { TaskDraft } from "./task-draft.js";

/** Plain text for chat (Telegram recognizes +7 … for tap-to-call) */
export function formatTaskMessagePlain(d: TaskDraft): string {
  const blocks: string[] = [];
  if (d.weekLine) blocks.push(d.weekLine, "");
  if (d.company) blocks.push(d.company);

  const phoneLines = mergePhoneLines(d);
  if (phoneLines.length) {
    if (blocks.length && blocks[blocks.length - 1] !== "") blocks.push("");
    blocks.push(...phoneLines);
  }

  if (d.description) {
    if (blocks.length && blocks[blocks.length - 1] !== "") blocks.push("");
    blocks.push(d.description);
  }

  if (d.redmineUrl) {
    blocks.push("", d.redmineUrl);
  }

  return blocks.join("\n").trim();
}
