import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import { loadSettings } from "../config.js";
import { startBot } from "../bot/index.js";
import { adminWebUrls } from "../services/lan-urls.js";
import { createApiRouter } from "./routes.js";

const settings = loadSettings();

function requireAdmin(req: express.Request): boolean {
  const secret = loadSettings().webAdminSecret;
  const hdr = req.header("x-admin-secret");
  if (secret && hdr === secret) return true;
  const tg = req.header("x-admin-telegram-id");
  if (tg && Number(tg) === loadSettings().adminTelegramId) return true;
  if (!secret && process.env.NODE_ENV !== "production") return true;
  return false;
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.use("/api", createApiRouter(requireAdmin));

const clientDist = path.join(process.cwd(), "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const host = process.env.WEB_HOST || "0.0.0.0";
const port = settings.webPort;

if (!fs.existsSync(clientDist)) {
  app.get("/", (_req, res) => {
    res.type("text/plain; charset=utf-8").send(
      "RM Bot API работает, но UI не собран. Выполните: npm run build\n\nАдминка: /api/settings (нужен X-Admin-Secret)",
    );
  });
}

app.listen(port, host, () => {
  console.log(`[web] http://127.0.0.1:${port}/ (только на ноутбуке)`);
  for (const url of adminWebUrls(port)) {
    console.log(`[web] с ПК/телефона в той же сети: ${url}`);
  }
  console.log(`[web] bind ${host}:${port}`);
});

startBot().catch((e) => console.error("[bot] start failed", e));

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException", err);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
