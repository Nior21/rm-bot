const SECRET_KEY = "rm_bot_admin_secret";

export function getSecret(): string {
  return sessionStorage.getItem(SECRET_KEY) ?? "";
}

export function setSecret(v: string): void {
  sessionStorage.setItem(SECRET_KEY, v);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  const secret = getSecret();
  if (secret) headers["X-Admin-Secret"] = secret;

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}
