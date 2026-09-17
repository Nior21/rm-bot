import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { z } from "zod";

dotenv.config();

const SettingsSchema = z.object({
  telegramBotToken: z.string().optional(),
  cursorApiKey: z.string().optional(),
  adminTelegramId: z.number().default(233097427),
  redmineBaseUrl: z.string().url().default("https://track.grandproject.ru"),
  botUsername: z.string().optional(),
  webPort: z.number().default(41873),
  webAdminSecret: z.string().optional(),
});

export type AppSettings = z.infer<typeof SettingsSchema>;

const settingsPath = () => path.join(process.cwd(), "data", "settings.json");

export function loadSettings(): AppSettings {
  const fromEnv: Partial<AppSettings> = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
    cursorApiKey: process.env.CURSOR_API_KEY || undefined,
    adminTelegramId: process.env.ADMIN_TELEGRAM_ID
      ? Number(process.env.ADMIN_TELEGRAM_ID)
      : undefined,
    redmineBaseUrl: process.env.REDMINE_BASE_URL || undefined,
    webPort: process.env.WEB_PORT ? Number(process.env.WEB_PORT) : undefined,
    webAdminSecret: process.env.WEB_ADMIN_SECRET || undefined,
  };

  let fromFile: Partial<AppSettings> = {};
  try {
    if (fs.existsSync(settingsPath())) {
      const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
      fromFile = SettingsSchema.partial().parse(raw);
    }
  } catch {
    /* keep env defaults */
  }

  // .env wins over settings.json so local secret/token edits apply without UI
  return SettingsSchema.parse({ ...fromFile, ...fromEnv });
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next = SettingsSchema.parse({ ...current, ...partial });
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export const ADMIN_TELEGRAM_USERNAME = "Nior90";
