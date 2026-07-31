import { connect } from "cloudflare:sockets";

// ---------- Uint8Array helpers ----------

function writeVarInt(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value;
  do {
    let temp = v & 0x7f;
    v >>>= 7;
    if (v !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (v !== 0);
  return new Uint8Array(bytes);
}

function writeString(str: string): Uint8Array {
  const encoded = new TextEncoder().encode(str);
  const len = writeVarInt(encoded.length);
  const result = new Uint8Array(len.length + encoded.length);
  result.set(len, 0);
  result.set(encoded, len.length);
  return result;
}

function writeUShort(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function readVarIntAt(buf: Uint8Array, offset: number): { value: number; bytes: number } | null {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buf.length) return null;
    const byte = buf[offset + i];
    value |= (byte & 0x7f) << (7 * i);
    if ((byte & 0x80) === 0) return { value, bytes: i + 1 };
  }
  return null;
}

// ---------- Minecraft chat parsing ----------

function parseChatComponent(component: unknown): string {
  if (typeof component === "string") return component;
  if (typeof component !== "object" || component === null) return "";
  const comp = component as Record<string, unknown>;
  let text = "";
  if (typeof comp.text === "string") text = comp.text;
  if (typeof comp.translate === "string") {
    const withArr = Array.isArray(comp.with) ? comp.with : [];
    text = (comp.translate as string)
      .replace(/%(\d+)\$s/g, (_, idx) => {
        const item = withArr[parseInt(idx) - 1];
        return item ? parseChatComponent(item) : "";
      })
      .replace(/%s/g, () => {
        const item = withArr.shift();
        return item ? parseChatComponent(item) : "";
      });
  }
  if (Array.isArray(comp.extra)) {
    for (const extra of comp.extra) text += parseChatComponent(extra);
  }
  return text;
}

function stripMcCodes(text: string): string {
  return text.replace(/§[0-9a-fk-or]/gi, "");
}

function detectServerType(versionName: string, modInfoType?: string, hasModInfo?: boolean): string {
  const lower = versionName.toLowerCase();
  if (modInfoType) {
    const t = modInfoType.toLowerCase();
    if (t.includes("fml2")) return "NeoForge";
    if (t.includes("fml")) return "Forge";
  }
  if (hasModInfo) return "Forge";
  if (lower.includes("neoforge")) return "NeoForge";
  if (lower.includes("fabric")) return "Fabric";
  if (lower.includes("quilt")) return "Quilt";
  if (lower.includes("forge")) return "Forge";
  if (lower.includes("pufferfish")) return "Pufferfish";
  if (lower.includes("purpur")) return "Purpur";
  if (lower.includes("paper")) return "Paper";
  if (lower.includes("spigot")) return "Spigot";
  if (lower.includes("bukkit")) return "Bukkit";
  if (lower.includes("glowstone")) return "Glowstone";
  if (lower.includes("waterfall")) return "Waterfall";
  if (lower.includes("bungeecord")) return "BungeeCord";
  if (lower.includes("velocity")) return "Velocity";
  if (lower.includes("folia")) return "Folia";
  if (lower.includes("leaves")) return "Leaves";
  if (lower.includes("pandamium")) return "Pandamium";
  if (lower.includes("gale")) return "Gale";
  return "Vanilla";
}

interface ServerResult {
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
}

function parseServerResponse(jsonStr: string): Partial<ServerResult> {
  const parsed = JSON.parse(jsonStr);
  const rawDescription = parsed.description;
  let motd = "";
  let motdRaw = "";
  if (typeof rawDescription === "string") {
    motdRaw = rawDescription;
    motd = stripMcCodes(rawDescription);
  } else if (typeof rawDescription === "object" && rawDescription !== null) {
    motd = stripMcCodes(parseChatComponent(rawDescription));
    motdRaw = JSON.stringify(rawDescription);
  }
  return {
    version: parsed.version?.name ?? "未知",
    protocol: parsed.version?.protocol ?? 0,
    playersOnline: parsed.players?.online ?? 0,
    playersMax: parsed.players?.max ?? 0,
    playerList: (parsed.players?.sample ?? []).map((s: { name: string }) => s.name),
    serverType: detectServerType(parsed.version?.name ?? "", parsed.modinfo?.type, parsed.modinfo != null),
    motd: motd || motdRaw || "",
    motdRaw: motdRaw || motd || "",
    favicon: parsed.favicon ?? undefined,
    modInfo: parsed.modinfo
      ? {
          type: parsed.modinfo.type ?? "unknown",
          modList: (parsed.modinfo.modList ?? []).map((m: { modid: string; version: string }) => ({
            modid: m.modid,
            version: m.version,
          })),
        }
      : undefined,
  };
}

function isIpAddress(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^[0-9a-f:]+$/i.test(host);
}

// ---------- DoH ----------

const DOH_ENDPOINTS = [
  "https://dns.alidns.com/resolve",
  "https://doh.pub/dns-query",
  "https://doh.360.cn/dns-query",
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];

async function dohSingle(baseUrl: string, name: string, type: string): Promise<{ host: string; port: number } | null> {
  const url = `${baseUrl}?name=${encodeURIComponent(name)}&type=${type}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { Answer?: { type: number; data: string }[] };
    if (type === "SRV" && Array.isArray(data.Answer)) {
      const srv = data.Answer.filter((a) => a.type === 33);
      if (srv.length > 0) {
        const p = srv[0].data.split(/\s+/);
        return { host: p[3], port: parseInt(p[2], 10) };
      }
    }
    if ((type === "A" || type === "AAAA") && Array.isArray(data.Answer)) {
      const answers = data.Answer.filter((a) => a.type === (type === "A" ? 1 : 28));
      if (answers.length > 0) return { host: answers[0].data, port: 0 };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveDoh(name: string, type: string): Promise<{ host: string; port: number } | null> {
  for (const ep of DOH_ENDPOINTS) {
    const result = await dohSingle(ep, name, type);
    if (result) return result;
  }
  return null;
}

// ---------- MC query over Web Stream ----------

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function queryServer(hostname: string, port: number, originalHost: string): Promise<ServerResult> {
  const socket = connect({ hostname, port });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  let buffer = new Uint8Array(0);

  try {
    await withTimeout(socket.opened, 5000, `连接超时 (${hostname}:${port})`);

    const handshake = concat(writeVarInt(-1), writeString(originalHost), writeUShort(port), writeVarInt(1));
    const handshakePacket = concat(writeVarInt(handshake.length + 1), writeVarInt(0x00), handshake);
    await writer.write(handshakePacket);
    await writer.write(concat(writeVarInt(1), writeVarInt(0x00)));

    let jsonStr: string | null = null;
    const readDeadline = Date.now() + 4000;

    while (Date.now() < readDeadline) {
      const { value } = await withTimeout(reader.read(), readDeadline - Date.now(), "读取响应超时");
      if (!value || value.byteLength === 0) break;
      buffer = concat(buffer, value);

      const lenInfo = readVarIntAt(buffer, 0);
      if (lenInfo) {
        const total = lenInfo.bytes + lenInfo.value;
        if (buffer.length >= total) {
          const packetData = buffer.subarray(lenInfo.bytes, total);
          const idInfo = readVarIntAt(packetData, 0);
          if (idInfo && idInfo.value === 0x00) {
            const strLen = readVarIntAt(packetData, idInfo.bytes);
            if (strLen) {
              const strStart = idInfo.bytes + strLen.bytes;
              const strEnd = strStart + strLen.value;
              if (packetData.length >= strEnd) {
                jsonStr = new TextDecoder().decode(packetData.subarray(strStart, strEnd));
                buffer = buffer.subarray(total);
                break;
              }
            }
          }
        }
      }
    }

    if (!jsonStr) throw new Error("服务器未返回有效数据");

    const parsed = parseServerResponse(jsonStr);

    const pingStart = Date.now();
    const payload = new Uint8Array(8);
    new DataView(payload.buffer).setBigUint64(0, BigInt(Date.now()));
    await writer.write(concat(writeVarInt(9), writeVarInt(0x01), payload));

    let latency = 0;
    const pingDeadline = Date.now() + 4000;
    while (Date.now() < pingDeadline) {
      const { value } = await withTimeout(reader.read(), pingDeadline - Date.now(), "ping 超时");
      if (!value || value.byteLength === 0) break;
      buffer = concat(buffer, value);

      const lenInfo = readVarIntAt(buffer, 0);
      if (lenInfo) {
        const total = lenInfo.bytes + lenInfo.value;
        if (buffer.length >= total) {
          latency = Math.round(Date.now() - pingStart);
          break;
        }
      }
    }

    return { online: true, host: originalHost, port, ...parsed, latency: latency || undefined };
  } finally {
    try { await socket.close(); } catch { /* ignore */ }
  }
}

// ---------- Query with serial fallback (connection-limit safe) ----------

async function queryWithFallback(host: string, port: number, userSpecifiedPort: boolean): Promise<ServerResult> {
  if (isIpAddress(host)) {
    return queryServer(host, port, host);
  }

  const attempts: { fn: () => Promise<ServerResult>; name: string }[] = [
    { fn: () => queryServer(host, port, host), name: "direct" },
    {
      fn: async () => {
        const a = await resolveDoh(host, "A");
        if (!a) throw new Error("DoH A 解析失败");
        return queryServer(a.host, port, host);
      },
      name: "doh-a",
    },
    {
      fn: async () => {
        const srv = await resolveDoh(`_minecraft._tcp.${host}`, "SRV");
        if (!srv) throw new Error("DoH SRV 解析失败");
        let h = srv.host;
        if (!isIpAddress(h)) {
          const a = await resolveDoh(h, "A");
          if (a) h = a.host;
          else throw new Error("SRV 目标域名解析失败");
        }
        const inner: Promise<ServerResult>[] = [queryServer(h, srv.port, host)];
        if (userSpecifiedPort && port !== srv.port) {
          inner.push(queryServer(h, port, host));
        }
        return Promise.any(inner);
      },
      name: "doh-srv",
    },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return await attempt.fn();
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `无法连接到服务器，请检查地址是否正确 (最后错误: ${lastError instanceof Error ? lastError.message : String(lastError)})`
  );
}

// ---------- Worker entry ----------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/query" && url.pathname !== "/") {
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const address = url.searchParams.get("address");
    if (!address) {
      return new Response(JSON.stringify({ error: "缺少服务器地址" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const [host, portStr] = address.split(":");
    const port = portStr ? parseInt(portStr, 10) : 25565;

    if (!host || isNaN(port) || port < 1 || port > 65535) {
      return new Response(JSON.stringify({ error: "无效的服务器地址" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    try {
      const result = await queryWithFallback(host, port, portStr != null);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "查询失败";
      return new Response(JSON.stringify({ host, port, online: false, error: message }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  },
} satisfies ExportedHandler;
