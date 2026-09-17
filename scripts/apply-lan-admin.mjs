import fs from "fs";

const serverPath = "src/server/index.ts";
let s = fs.readFileSync(serverPath, "utf8");
s = s.replace('import os from "os";\n', "");
if (!s.includes("lan-urls")) {
  s = s.replace(
    'import { createApiRouter } from "./routes.js";',
    'import { adminWebUrls } from "../services/lan-urls.js";\nimport { createApiRouter } from "./routes.js";',
  );
}
s = s.replace(
  'const host = process.env.WEB_HOST || "127.0.0.1";',
  'const host = process.env.WEB_HOST || "0.0.0.0";',
);
s = s.replace(/function lanIpv4\(\)[\s\S]*?return undefined;\n}\n\n/, "");
const oldListen = `app.listen(port, host, () => {
  console.log(\`[web] http://127.0.0.1:\${port}/\`);
  if (host === "0.0.0.0") {
    const ip = lanIpv4();
    if (ip) console.log(\`[web] в сети: http://\${ip}:\${port}/\`);
  }
  console.log(\`[web] bind \${host}:\${port}\`);
});`;
const newListen = `app.listen(port, host, () => {
  console.log(\`[web] http://127.0.0.1:\${port}/ (ноутбук)\`);
  for (const url of adminWebUrls(port)) {
    console.log(\`[web] с ПК/телефона в той же сети: \${url}\`);
  }
  console.log(\`[web] bind \${host}:\${port}\`);
});`;
if (s.includes(oldListen)) s = s.replace(oldListen, newListen);
else if (!s.includes("adminWebUrls(port)")) {
  console.error("listen block mismatch");
  process.exit(1);
}
fs.writeFileSync(serverPath, s);

let c = fs.readFileSync("src/config.ts", "utf8");
c = c.replace("webPort: z.number().default(3847)", "webPort: z.number().default(41873)");
fs.writeFileSync("src/config.ts", c);

console.log("ok");
