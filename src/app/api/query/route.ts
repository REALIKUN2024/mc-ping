import { NextRequest, NextResponse } from "next/server";
import * as net from "net";
import * as dns from "dns";

function writeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value;
  do {
    let temp = v & 0x7f;
    v >>>= 7;
    if (v !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function writeString(str: string): Buffer {
  const strBuf = Buffer.from(str, "utf-8");
  return Buffer.concat([writeVarInt(strBuf.length), strBuf]);
}

function writeUShort(value: number): Buffer {
  const buf = Buffer.allocUnsafe(2);
  buf.writeUInt16BE(value, 0);
  return buf;
}

function readVarInt(buf: Buffer, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let bytesRead = 0;
  let byte: number;
  do {
    if (offset + bytesRead >= buf.length) throw new Error("Unexpected end of buffer");
    byte = buf[offset + bytesRead];
    value |= (byte & 0x7f) << (7 * bytesRead);
    bytesRead++;
    if (bytesRead > 5) throw new Error("VarInt too big");
  } while ((byte & 0x80) !== 0);
  return { value, bytesRead };
}

function readString(buf: Buffer, offset: number): { value: string; bytesRead: number } {
  const { value: length, bytesRead: lenBytes } = readVarInt(buf, offset);
  const str = buf.toString("utf-8", offset + lenBytes, offset + lenBytes + length);
  return { value: str, bytesRead: lenBytes + length };
}

function parseChatComponent(component: unknown): string {
  if (typeof component === "string") return component;
  if (typeof component !== "object" || component === null) return "";

  const comp = component as Record<string, unknown>;
  let text = "";

  if (typeof comp.text === "string") text = comp.text;
  if (typeof comp.translate === "string") {
    const translate = comp.translate as string;
    const withArr = Array.isArray(comp.with) ? comp.with : [];
    text = translate
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
    for (const extra of comp.extra) {
      text += parseChatComponent(extra);
    }
  }

  return text;
}

function stripMinecraftFormatting(text: string): string {
  return text.replace(/§[0-9a-fk-or]/gi, "");
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

function detectServerType(
  versionName: string,
  modInfoType?: string,
  hasModInfo?: boolean
): string {
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

function parseServerResponse(jsonStr: string): Partial<ServerResult> {
  const parsed = JSON.parse(jsonStr);

  const rawDescription = parsed.description;
  let motd = "";
  let motdRaw = "";

  if (typeof rawDescription === "string") {
    motdRaw = rawDescription;
    motd = stripMinecraftFormatting(rawDescription);
  } else if (typeof rawDescription === "object" && rawDescription !== null) {
    motd = parseChatComponent(rawDescription);
    motdRaw = JSON.stringify(rawDescription);
  }

  return {
    version: parsed.version?.name ?? "未知",
    protocol: parsed.version?.protocol ?? 0,
    playersOnline: parsed.players?.online ?? 0,
    playersMax: parsed.players?.max ?? 0,
    playerList: (parsed.players?.sample ?? []).map(
      (s: { name: string }) => s.name
    ),
    serverType: detectServerType(
      parsed.version?.name ?? "",
      parsed.modinfo?.type,
      parsed.modinfo != null
    ),
    motd: motd || motdRaw || "",
    motdRaw: motdRaw || motd || "",
    favicon: parsed.favicon ?? undefined,
    modInfo: parsed.modinfo
      ? {
          type: parsed.modinfo.type ?? "unknown",
          modList: (parsed.modinfo.modList ?? []).map(
            (m: { modid: string; version: string }) => ({
              modid: m.modid,
              version: m.version,
            })
          ),
        }
      : undefined,
  };
}

function isIpAddress(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^[0-9a-f:]+$/i.test(host);
}

const DOH_ENDPOINTS = [
  "https://dns.alidns.com/resolve",
  "https://doh.pub/dns-query",
  "https://doh.360.cn/dns-query",
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];

function dohSingle(
  baseUrl: string,
  name: string,
  type: string
): Promise<{ host: string; port: number }> {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}?name=${encodeURIComponent(name)}&type=${type}`;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, 3000);

    fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timer);
        if (!res.ok) return reject(new Error("bad status"));
        return res.json();
      })
      .then((data) => {
        if (type === "SRV" && Array.isArray(data.Answer)) {
          const srv = data.Answer.filter((a: { type: number }) => a.type === 33);
          if (srv.length > 0) {
            const p = srv[0].data.split(/\s+/);
            return resolve({ host: p[3], port: parseInt(p[2], 10) });
          }
        }
        if (
          (type === "A" || type === "AAAA") &&
          Array.isArray(data.Answer)
        ) {
          const answers = data.Answer.filter(
            (a: { type: number }) => a.type === (type === "A" ? 1 : 28)
          );
          if (answers.length > 0)
            return resolve({ host: answers[0].data, port: 0 });
        }
        reject(new Error("no records"));
      })
      .catch(() => {
        clearTimeout(timer);
        reject(new Error("fetch error"));
      });
  });
}

async function resolveDoh(
  name: string,
  type: string
): Promise<{ host: string; port: number } | null> {
  try {
    return await Promise.any(
      DOH_ENDPOINTS.map((ep) => dohSingle(ep, name, type))
    );
  } catch {
    return null;
  }
}

function resolveSystemIp(host: string): Promise<string | null> {
  return new Promise((resolve) => {
    dns.resolve4(host, (err, addresses) => {
      if (err || addresses.length === 0) {
        resolve(null);
      } else {
        resolve(addresses[0]);
      }
    });
  });
}

function queryServerWithIp(
  ip: string,
  port: number,
  hostname: string
): Promise<ServerResult> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let resolved = false;
    let responseBuffer = Buffer.alloc(0);
    let pingSent = false;
    let pingStart: [number, number] = [0, 0];
    let serverInfo: Partial<ServerResult> = {};

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        reject(new Error("连接超时"));
      }
    }, 5000);

    socket.setTimeout(5000);

    socket.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`连接失败: ${err.message}`));
      }
    });

    socket.on("timeout", () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        reject(new Error("连接超时"));
      }
    });

    socket.connect(port, ip, () => {
      try {
        const hostStr = writeString(hostname);
        const portBuf = writeUShort(port);
        const packetId = writeVarInt(0x00);
        const data = Buffer.concat([
          writeVarInt(-1),
          hostStr,
          portBuf,
          writeVarInt(1),
        ]);
        const length = writeVarInt(packetId.length + data.length);
        socket.write(Buffer.concat([length, packetId, data]));

        const srLength = writeVarInt(1);
        const srPacketId = writeVarInt(0x00);
        socket.write(Buffer.concat([srLength, srPacketId]));
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          socket.destroy();
          reject(err);
        }
      }
    });

    function processPackets(): boolean {
      while (responseBuffer.length > 0) {
        try {
          const { value: packetLength, bytesRead: lenBytes } = readVarInt(
            responseBuffer,
            0
          );
          const totalLength = lenBytes + packetLength;
          if (responseBuffer.length < totalLength) return false;

          const packetData = responseBuffer.subarray(lenBytes, totalLength);
          const { value: packetId, bytesRead: idBytes } = readVarInt(
            packetData,
            0
          );

          if (packetId === 0x00) {
            const jsonStrResult = readString(packetData, idBytes);
            serverInfo = parseServerResponse(jsonStrResult.value);
            responseBuffer = responseBuffer.subarray(totalLength);

            if (!resolved) {
              pingStart = process.hrtime();
              const payload = Buffer.allocUnsafe(8);
              const ts = Date.now();
              payload.writeUInt32BE(Math.floor(ts / 0x100000000), 0);
              payload.writeUInt32BE(ts >>> 0, 4);
              const pingId = writeVarInt(0x01);
              const pingLength = writeVarInt(pingId.length + payload.length);
              socket.write(Buffer.concat([pingLength, pingId, payload]));
              pingSent = true;
            }
          } else if (packetId === 0x01 && pingSent) {
            const diff = process.hrtime(pingStart);
            const latency = diff[0] * 1000 + diff[1] / 1_000_000;
            responseBuffer = responseBuffer.subarray(totalLength);

            resolved = true;
            clearTimeout(timeout);
            socket.destroy();

            resolve({
              online: true,
              host: hostname,
              port,
              ...serverInfo,
              latency: Math.round(latency),
            });
            return true;
          }

          responseBuffer = responseBuffer.subarray(totalLength);
        } catch {
          return false;
        }
      }
      return false;
    }

    socket.on("data", (data) => {
      responseBuffer = Buffer.concat([responseBuffer, data]);
      processPackets();
    });

    socket.on("close", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (Object.keys(serverInfo).length > 0) {
          resolve({ online: true, host: hostname, port, ...serverInfo });
        } else {
          reject(new Error("服务器已关闭连接"));
        }
      }
    });
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "缺少服务器地址" }, { status: 400 });
  }

  const [host, portStr] = address.split(":");
  const port = portStr ? parseInt(portStr, 10) : 25565;

  if (!host || isNaN(port) || port < 1 || port > 65535) {
    return NextResponse.json({ error: "无效的服务器地址" }, { status: 400 });
  }

  try {
    if (isIpAddress(host)) {
      const result = await queryServerWithIp(host, port, host);
      return NextResponse.json(result);
    }

    const strategies: Promise<ServerResult>[] = [];

    strategies.push(
      resolveSystemIp(host).then((ip) => {
        if (!ip) throw new Error("系统 DNS 解析失败");
        return queryServerWithIp(ip, port, host);
      })
    );

    strategies.push(
      resolveDoh(host, "A").then((a) => {
        if (!a) throw new Error("DoH A 解析失败");
        return queryServerWithIp(a.host, port, host);
      })
    );

    strategies.push(
      resolveDoh(`_minecraft._tcp.${host}`, "SRV").then(async (srv) => {
        if (!srv) throw new Error("DoH SRV 解析失败");
        let h = srv.host;
        if (!isIpAddress(h)) {
          const a = await resolveDoh(h, "A");
          if (a) h = a.host;
          else {
            const ip = await resolveSystemIp(h);
            if (ip) h = ip;
            else throw new Error("SRV 目标域名解析失败");
          }
        }
        const attempts: Promise<ServerResult>[] = [
          queryServerWithIp(h, srv.port, host),
        ];
        if (portStr && port !== srv.port) {
          attempts.push(queryServerWithIp(h, port, host));
        }
        return Promise.any(attempts);
      })
    );

    const result = await Promise.any(strategies);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AggregateError) {
      return NextResponse.json(
        { host, port, error: "无法连接到服务器，请检查地址是否正确", online: false },
        { status: 200 }
      );
    }
    const message = err instanceof Error ? err.message : "查询失败";
    return NextResponse.json({ host, port, error: message, online: false }, { status: 200 });
  }
}
