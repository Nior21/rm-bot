import os from "os";

export function listLanIpv4(): string[] {
  const ips: string[] = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets ?? []) {
      if (n.family === "IPv4" && !n.internal) ips.push(n.address);
    }
  }
  return [...new Set(ips)];
}

export function adminWebUrls(port: number): string[] {
  return listLanIpv4().map((ip) => `http://${ip}:${port}/`);
}

export function preferredAdminUrl(port: number): string | undefined {
  const ips = listLanIpv4();
  const wifi = ips.find(
    (ip) =>
      ip.startsWith("192.168.") &&
      !ip.startsWith("192.168.56.") &&
      !ip.startsWith("192.168.137."),
  );
  const ip = wifi ?? ips[0];
  return ip ? `http://${ip}:${port}/` : undefined;
}
