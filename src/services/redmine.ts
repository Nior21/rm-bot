import { loadSettings } from "../config.js";

export type CreateIssueInput = {
  subject: string;
  description: string;
  projectId?: number;
  apiKey: string;
};

export type CreateIssueResult = {
  id: number;
  url: string;
};

export type RedmineProject = {
  id: number;
  name: string;
  identifier: string;
};

export async function listRedmineProjects(apiKey: string): Promise<RedmineProject[]> {
  const base = loadSettings().redmineBaseUrl.replace(/\/$/, "");
  const out: RedmineProject[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const url = `${base}/projects.json?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { "X-Redmine-API-Key": apiKey },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Redmine projects ${res.status}: ${text.slice(0, 400)}`);
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
}

export async function createRedmineIssue(input: CreateIssueInput): Promise<CreateIssueResult> {
  const base = loadSettings().redmineBaseUrl.replace(/\/$/, "");
  const projectId = input.projectId;
  if (!projectId) {
    throw new Error("redmine_project_id не задан для аккаунта");
  }

  const body = {
    issue: {
      project_id: projectId,
      subject: input.subject.slice(0, 250),
      description: input.description,
    },
  };

  const res = await fetch(`${base}/issues.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Redmine-API-Key": input.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Redmine ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as { issue: { id: number } };
  const id = data.issue.id;
  return { id, url: `${base}/issues/${id}` };
}

export async function addRedmineNote(
  issueId: number,
  apiKey: string,
  notes: string,
): Promise<void> {
  const base = loadSettings().redmineBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/issues/${issueId}.json`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Redmine-API-Key": apiKey,
    },
    body: JSON.stringify({ issue: { notes } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Redmine note ${res.status}: ${text.slice(0, 300)}`);
  }
}
