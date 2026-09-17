import fs from "fs";

const p = "src/bot/index.ts";
let s = fs.readFileSync(p, "utf8");
if (!s.includes("lan-urls")) {
  s = s.replace(
    'import { spawnFeedbackAgent } from "../services/cursor-api.js";',
    'import { spawnFeedbackAgent } from "../services/cursor-api.js";\nimport { adminWebUrls, preferredAdminUrl } from "../services/lan-urls.js";',
  );
}
if (!s.includes('bot.command("web"')) {
  s = s.replace(
    `  bot.command("start", async (ctx) => {
    await ctx.reply(
      "RM Bot: /task — задача из ответа на сообщение\\n/feedback — предложение по доработке\\n/ping — проверка связи",
    );
  });`,
    `  bot.command("start", async (ctx) => {
    await ctx.reply(
      "RM Bot: /task — задача из ответа на сообщение\\n/feedback — предложение по доработке\\n/web — ссылка на админку (Ivan)\\n/ping — проверка связи",
    );
  });

  bot.command("web", async (ctx) => {
    const adminId = loadSettings().adminTelegramId;
    if (ctx.from?.id !== adminId) {
      await ctx.reply("Команда только для администратора.");
      return;
    }
    const port = loadSettings().webPort;
    const main = preferredAdminUrl(port);
    const all = adminWebUrls(port);
    const lines = [
      "Откройте в браузере на ПК или телефоне (та же Wi‑Fi/сеть, что ноутбук):",
      main ? \`\\n\${main}\` : "",
      all.length > 1 ? \`\\nДругие адреса ноутбука:\\n\${all.join("\\n")}\` : "",
      "\\nПароль входа — WEB_ADMIN_SECRET из .env (кнопка «Применить» на странице).",
    ].join("");
    await ctx.reply(lines.trim(), { link_preview_options: { is_disabled: true } });
  });`,
  );
}
fs.writeFileSync(p, s);
console.log("bot ok");
