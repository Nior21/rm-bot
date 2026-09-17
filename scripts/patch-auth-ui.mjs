import fs from "fs";

let c = fs.readFileSync("src/config.ts", "utf8");
c = c.replace(
  `  // .env wins over settings.json so local secret/token edits apply without UI
  return SettingsSchema.parse({ ...fromFile, ...fromEnv });`,
  `  const merged = { ...fromFile, ...fromEnv };
  return SettingsSchema.parse({
    ...merged,
    // секрет из админки (settings.json) важнее .env после сохранения в браузере
    webAdminSecret: fromFile.webAdminSecret ?? fromEnv.webAdminSecret,
    telegramBotToken: fromEnv.telegramBotToken ?? fromFile.telegramBotToken,
    cursorApiKey: fromEnv.cursorApiKey ?? fromFile.cursorApiKey,
    webPort: fromEnv.webPort ?? fromFile.webPort,
  });`,
);
fs.writeFileSync("src/config.ts", c);

let r = fs.readFileSync("src/server/routes.ts", "utf8");
if (!r.includes("/auth/check")) {
  r = r.replace(
    `  r.get("/health", (_req, res) => {
    res.json({ ok: true });
  });`,
    `  r.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  r.get("/auth/check", (req, res) => {
    if (!requireAdmin(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.json({ ok: true });
  });`,
  );
  fs.writeFileSync("src/server/routes.ts", r);
}

let app = fs.readFileSync("client/src/App.tsx", "utf8");
if (!app.includes("auth/check")) {
  app = app.replace(
    `  function saveSecret() {
    setSecret(secret);
    setMsg("Секрет сохранён в sessionStorage");
  }`,
    `  async function saveSecret() {
    setSecret(secret);
    setMsg(null);
    setErr(null);
    try {
      await api("/auth/check");
      setMsg("Секрет принят сервером");
      await load();
    } catch (e) {
      setErr(
        "Сервер отклонил секрет (forbidden). Вставьте тот же пароль, что в WEB_ADMIN_SECRET в .env на ноутбуке, или сохраните новый в «Настройки» после входа со старым.",
      );
    }
  }`,
  );
  app = app.replace(
    `      setErr(e instanceof Error ? e.message : String(e));`,
    `      const raw = e instanceof Error ? e.message : String(e);
      setErr(raw.includes("forbidden") ? "Доступ запрещён (forbidden): неверный секрет админа." : raw);`,
  );
  fs.writeFileSync("client/src/App.tsx", app);
}

console.log("patched");
