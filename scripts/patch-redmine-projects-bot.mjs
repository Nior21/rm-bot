import fs from "fs";

const rm = "src/services/redmine.ts";
let r = fs.readFileSync(rm, "utf8");
if (!r.includes("listRedmineProjects")) {
  r = r.replace(
    `export type CreateIssueResult = {
  id: number;
  url: string;
};`,
    `export type CreateIssueResult = {
  id: number;
  url: string;
};

export type RedmineProject = {
  id: number;
  name: string;
  identifier: string;
};

export async function listRedmineProjects(apiKey: string): Promise<RedmineProject[]> {
  const base = loadSettings().redmineBaseUrl.replace(/\\/$/, "");
  const out: RedmineProject[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const url = \`\${base}/projects.json?limit=\${limit}&offset=\${offset}\`;
    const res = await fetch(url, {
      headers: { "X-Redmine-API-Key": apiKey },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(\`Redmine projects \${res.status}: \${text.slice(0, 400)}\`);
    }
    const data = (await res.json()) as {
      projects?: { id: number; name: string; identifier: string }[];
      total_count?: number;
    };
    const batch = data.projects ?? [];
    for (const p of batch) {
      out.push({ id: p.id, name: p.name, identifier: p.identifier });
    }
    const total = data.total_count ?? batch.length;
    offset += limit;
    if (offset >= total || batch.length === 0) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}`,
  );
  fs.writeFileSync(rm, r);
}

const routes = "src/server/routes.ts";
let rt = fs.readFileSync(routes, "utf8");
if (!rt.includes("listRedmineProjects")) {
  rt = rt.replace(
    'import { normalizePhoneE164 } from "../services/phone.js";',
    'import { normalizePhoneE164 } from "../services/phone.js";\nimport { listRedmineProjects } from "../services/redmine.js";',
  );
  rt = rt.replace(
    `  r.delete("/accounts/:telegramUserId", (req, res) => {`,
    `  r.post("/redmine/projects", async (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const apiKey = String(req.body?.api_key ?? "").trim();
    if (!apiKey || apiKey.includes("•")) {
      res.status(400).json({ error: "api_key required" });
      return;
    }
    try {
      const projects = await listRedmineProjects(apiKey);
      res.json(projects);
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.delete("/accounts/:telegramUserId", (req, res) => {`,
  );
  fs.writeFileSync(routes, rt);
}

const bot = "src/bot/index.ts";
let b = fs.readFileSync(bot, "utf8");
if (!b.includes("setMyCommands")) {
  b = b.replace(
    'import { Bot, GrammyError, HttpError } from "grammy";',
    'import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";',
  );
  b = b.replace(
    `  try {
    const me = await bot.api.getMe();
    if (me.username && me.username !== settings.botUsername) {
      saveSettings({ botUsername: me.username });
    }
  } catch (e) {
    console.warn("[bot] getMe failed:", e);
  }`,
    `  try {
    const me = await bot.api.getMe();
    if (me.username && me.username !== settings.botUsername) {
      saveSettings({ botUsername: me.username });
    }
    await bot.api.setMyCommands([
      { command: "start", description: "Помощь и кнопки" },
      { command: "task", description: "Задача из ответа на сообщение" },
      { command: "feedback", description: "Идея или ошибка бота" },
      { command: "web", description: "Ссылка на админку (Ivan)" },
      { command: "ping", description: "Проверка связи" },
    ]);
  } catch (e) {
    console.warn("[bot] getMe failed:", e);
  }`,
  );
  b = b.replace(
    `  bot.command("start", async (ctx) => {
    await ctx.reply(
      "RM Bot: /task — задача из ответа на сообщение\\n/feedback — предложение по доработке\\n/web — ссылка на админку (Ivan)\\n/ping — проверка связи",
    );
  });`,
    `  bot.command("start", async (ctx) => {
    const adminId = loadSettings().adminTelegramId;
    const kb = new InlineKeyboard()
      .text("Как оформить задачу", "menu:how_task")
      .row()
      .text("Обратная связь (бот)", "menu:feedback");
    if (ctx.from?.id === adminId) {
      kb.row().text("Ссылка на админку", "menu:web");
    }
    await ctx.reply(
      "RM Bot — помощник по задачам в чате.\\n\\nМенеджерам: ответьте на сообщение с данными и отправьте /task, или упомяните бота в конце текста.\\n\\nКнопки ниже:",
      { reply_markup: kb },
    );
  });`,
  );
  b = b.replace(
    `  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith("clar:")) {`,
    `  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith("menu:")) {
      const adminId = loadSettings().adminTelegramId;
      if (data === "menu:how_task") {
        await ctx.answerCallbackQuery();
        await ctx.reply(
          "1) Менеджер пишет данные задачи в чат.\\n2) Ответьте на это сообщение командой /task\\n   или добавьте @бота в конце текста.\\n3) Бот оформит сообщение по регламенту и создаст задачу в Redmine.",
        );
        return;
      }
      if (data === "menu:feedback") {
        await ctx.answerCallbackQuery();
        await ctx.reply("Напишите: /feedback ваш текст");
        return;
      }
      if (data === "menu:web" && ctx.from?.id === adminId) {
        await ctx.answerCallbackQuery();
        const port = loadSettings().webPort;
        const main = preferredAdminUrl(port);
        await ctx.reply(main ? \`Админка: \${main}\` : "Админка: см. /web", {
          link_preview_options: { is_disabled: true },
        });
        return;
      }
      await ctx.answerCallbackQuery();
      return;
    }
    if (data.startsWith("clar:")) {`,
  );
  fs.writeFileSync(bot, b);
}

console.log("patched server+bot");
