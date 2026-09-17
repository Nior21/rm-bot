import fs from "fs";

const p = "client/src/App.tsx";
let a = fs.readFileSync(p, "utf8");

if (!a.includes("RedmineProject")) {
  a = a.replace(
    `type Tab = "settings" | "accounts" | "chats" | "phonebook" | "feedback";`,
    `type RedmineProject = { id: number; name: string; identifier: string };

type Tab = "settings" | "accounts" | "chats" | "phonebook" | "feedback";`,
  );
  a = a.replace(
    `  const [err, setErr] = useState<string | null>(null);`,
    `  const [err, setErr] = useState<string | null>(null);
  const [rmProjects, setRmProjects] = useState<RedmineProject[]>([]);
  const [rmProjectId, setRmProjectId] = useState<string>("");`,
  );

  a = a.replace(
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
    } catch {
      setErr(
        "Сервер отклонил секрет (forbidden). Нужен тот же пароль, что WEB_ADMIN_SECRET в .env на ноутбуке.",
      );
    }
  }

  async function loadRedmineProjects(apiKey: string) {
    setErr(null);
    try {
      const list = await api<RedmineProject[]>("/redmine/projects", {
        method: "POST",
        body: JSON.stringify({ api_key: apiKey }),
      });
      setRmProjects(list);
      setMsg(\`Загружено проектов: \${list.length}\`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }`,
  );

  a = a.replace(
    `            <label>Redmine API key</label>
            <input name="redmine_api_key" required />
            <label>Project ID в Redmine</label>
            <input name="redmine_project_id" type="number" required />
            <button type="submit">Сохранить аккаунт</button>`,
    `            <label>Redmine API key</label>
            <input name="redmine_api_key" required id="rm-api-key" />
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const el = document.getElementById("rm-api-key") as HTMLInputElement | null;
                if (el?.value) loadRedmineProjects(el.value);
              }}
            >
              Загрузить проекты из Redmine
            </button>
            <label>Проект (identifier виден, в RM уходит числовой id)</label>
            <select
              name="redmine_project_id"
              required
              value={rmProjectId}
              onChange={(e) => setRmProjectId(e.target.value)}
            >
              <option value="">— выберите проект —</option>
              {rmProjects.map((pr) => (
                <option key={pr.id} value={String(pr.id)}>
                  {pr.identifier} — {pr.name} (id {pr.id})
                </option>
              ))}
            </select>
            <button type="submit">Сохранить аккаунт</button>`,
  );

  a = a.replace(
    `<td>{a.redmine_project_id ?? "—"}</td>`,
    `<td>{a.redmine_project_id ?? "—"}</td>`,
  );

  fs.writeFileSync(p, a);
}
console.log("app ok");
