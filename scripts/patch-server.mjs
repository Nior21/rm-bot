import fs from "fs";

let c = fs.readFileSync("src/config.ts", "utf8");
c = c.replace(
  "return SettingsSchema.parse({ ...fromEnv, ...fromFile });",
  "return SettingsSchema.parse({ ...fromFile, ...fromEnv });",
);
fs.writeFileSync("src/config.ts", c);

let s = fs.readFileSync("src/server/index.ts", "utf8");
if (!s.includes("WEB_HOST")) {
  s = s.replace('import fs from "fs";', 'import fs from "fs";\nimport os from "os";');
  const oldListen = `const host = "127.0.0.1";
const port = settings.webPort;

app.listen(port, host, () => {
  console.log(\`[web] http://\${host}:\${port}\`);
});`;
  const newListen = `const host = process.env.WEB_HOST || "127.0.0.1";
const port = settings.webPort;

function lanIpv4() {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets ?? []) {
      if (n.family === "IPv4" && !n.internal) return n.address;
    }
  }
  return undefined;
}

if (!fs.existsSync(clientDist)) {
  app.get("/", (_req, res) => {
    res
      .type("text/plain; charset=utf-8")
      .send("RM Bot API работает, но UI не собран. Выполните: npm run build");
  });
}

app.listen(port, host, () => {
  console.log(\`[web] http://127.0.0.1:\${port}/\`);
  if (host === "0.0.0.0") {
    const ip = lanIpv4();
    if (ip) console.log(\`[web] LAN http://\${ip}:\${port}/\`);
  }
  console.log(\`[web] bind \${host}:\${port}\`);
});`;
  if (!s.includes(oldListen)) {
    console.error("listen block not found");
    process.exit(1);
  }
  s = s.replace(oldListen, newListen);
  fs.writeFileSync("src/server/index.ts", s);
}
console.log("ok");
