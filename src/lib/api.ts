export interface ServerData {
  online: boolean;
  host: string;
  port: number;
  version?: string;
  protocol?: number;
  motd?: string;
  motdRaw?: string;
  playersOnline?: number;
  playersMax?: number;
  playerList?: string[];
  favicon?: string;
  latency?: number;
  serverType?: string;
  modInfo?: { type: string; modList: { modid: string; version: string }[] };
  error?: string;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "/api";

export async function queryServer(address: string): Promise<ServerData> {
  const res = await fetch(`${API_BASE}/query?address=${encodeURIComponent(address)}`);
  return res.json();
}
