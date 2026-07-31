var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.ts
import { connect } from "cloudflare:sockets";
function writeVarInt(value) {
  const bytes = [];
  let v = value;
  do {
    let temp = v & 127;
    v >>>= 7;
    if (v !== 0) temp |= 128;
    bytes.push(temp);
  } while (v !== 0);
  return new Uint8Array(bytes);
}
__name(writeVarInt, "writeVarInt");
function writeString(str) {
  const encoded = new TextEncoder().encode(str);
  const len = writeVarInt(encoded.length);
  const result = new Uint8Array(len.length + encoded.length);
  result.set(len, 0);
  result.set(encoded, len.length);
  return result;
}
__name(writeString, "writeString");
function writeUShort(value) {
  return new Uint8Array([value >> 8 & 255, value & 255]);
}
__name(writeUShort, "writeUShort");
function concat(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
__name(concat, "concat");
function readVarIntAt(buf, offset) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buf.length) return null;
    const byte = buf[offset + i];
    value |= (byte & 127) << 7 * i;
    if ((byte & 128) === 0) return { value, bytes: i + 1 };
  }
  return null;
}
__name(readVarIntAt, "readVarIntAt");
function parseChatComponent(component) {
  if (typeof component === "string") return component;
  if (typeof component !== "object" || component === null) return "";
  const comp = component;
  let text = "";
  if (typeof comp.text === "string") text = comp.text;
  if (typeof comp.translate === "string") {
    const withArr = Array.isArray(comp.with) ? comp.with : [];
    text = comp.translate.replace(/%(\d+)\$s/g, (_, idx) => {
      const item = withArr[parseInt(idx) - 1];
      return item ? parseChatComponent(item) : "";
    }).replace(/%s/g, () => {
      const item = withArr.shift();
      return item ? parseChatComponent(item) : "";
    });
  }
  if (Array.isArray(comp.extra)) {
    for (const extra of comp.extra) text += parseChatComponent(extra);
  }
  return text;
}
__name(parseChatComponent, "parseChatComponent");
function stripMcCodes(text) {
  return text.replace(/§[0-9a-fk-or]/gi, "");
}
__name(stripMcCodes, "stripMcCodes");
function detectServerType(versionName, modInfoType, hasModInfo) {
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
__name(detectServerType, "detectServerType");
function parseServerResponse(jsonStr) {
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
    version: parsed.version?.name ?? "\u672A\u77E5",
    protocol: parsed.version?.protocol ?? 0,
    playersOnline: parsed.players?.online ?? 0,
    playersMax: parsed.players?.max ?? 0,
    playerList: (parsed.players?.sample ?? []).map((s) => s.name),
    serverType: detectServerType(parsed.version?.name ?? "", parsed.modinfo?.type, parsed.modinfo != null),
    motd: motd || motdRaw || "",
    motdRaw: motdRaw || motd || "",
    favicon: parsed.favicon ?? void 0,
    modInfo: parsed.modinfo ? {
      type: parsed.modinfo.type ?? "unknown",
      modList: (parsed.modinfo.modList ?? []).map((m) => ({
        modid: m.modid,
        version: m.version
      }))
    } : void 0
  };
}
__name(parseServerResponse, "parseServerResponse");
function isIpAddress(host) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^[0-9a-f:]+$/i.test(host);
}
__name(isIpAddress, "isIpAddress");
var DOH_ENDPOINTS = [
  "https://dns.alidns.com/resolve",
  "https://doh.pub/dns-query",
  "https://doh.360.cn/dns-query",
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve"
];
async function dohSingle(baseUrl, name, type) {
  const url = `${baseUrl}?name=${encodeURIComponent(name)}&type=${type}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3e3);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal: controller.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
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
__name(dohSingle, "dohSingle");
async function resolveDoh(name, type) {
  for (const ep of DOH_ENDPOINTS) {
    const result = await dohSingle(ep, name, type);
    if (result) return result;
  }
  return null;
}
__name(resolveDoh, "resolveDoh");
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
__name(withTimeout, "withTimeout");
async function queryServer(hostname, port, originalHost) {
  const socket = connect({ hostname, port });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  let buffer = new Uint8Array(0);
  try {
    await withTimeout(socket.opened, 5e3, `\u8FDE\u63A5\u8D85\u65F6 (${hostname}:${port})`);
    const handshake = concat(writeVarInt(-1), writeString(originalHost), writeUShort(port), writeVarInt(1));
    const handshakePacket = concat(writeVarInt(handshake.length + 1), writeVarInt(0), handshake);
    await writer.write(handshakePacket);
    await writer.write(concat(writeVarInt(1), writeVarInt(0)));
    let jsonStr = null;
    const readDeadline = Date.now() + 4e3;
    while (Date.now() < readDeadline) {
      const { value } = await withTimeout(reader.read(), readDeadline - Date.now(), "\u8BFB\u53D6\u54CD\u5E94\u8D85\u65F6");
      if (!value || value.byteLength === 0) break;
      buffer = concat(buffer, value);
      const lenInfo = readVarIntAt(buffer, 0);
      if (lenInfo) {
        const total = lenInfo.bytes + lenInfo.value;
        if (buffer.length >= total) {
          const packetData = buffer.subarray(lenInfo.bytes, total);
          const idInfo = readVarIntAt(packetData, 0);
          if (idInfo && idInfo.value === 0) {
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
    if (!jsonStr) throw new Error("\u670D\u52A1\u5668\u672A\u8FD4\u56DE\u6709\u6548\u6570\u636E");
    const parsed = parseServerResponse(jsonStr);
    const pingStart = Date.now();
    const payload = new Uint8Array(8);
    new DataView(payload.buffer).setBigUint64(0, BigInt(Date.now()));
    await writer.write(concat(writeVarInt(9), writeVarInt(1), payload));
    let latency = 0;
    const pingDeadline = Date.now() + 4e3;
    while (Date.now() < pingDeadline) {
      const { value } = await withTimeout(reader.read(), pingDeadline - Date.now(), "ping \u8D85\u65F6");
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
    return { online: true, host: originalHost, port, ...parsed, latency: latency || void 0 };
  } finally {
    try {
      await socket.close();
    } catch {
    }
  }
}
__name(queryServer, "queryServer");
async function queryWithFallback(host, port, userSpecifiedPort) {
  if (isIpAddress(host)) {
    return queryServer(host, port, host);
  }
  const attempts = [
    { fn: /* @__PURE__ */ __name(() => queryServer(host, port, host), "fn"), name: "direct" },
    {
      fn: /* @__PURE__ */ __name(async () => {
        const a = await resolveDoh(host, "A");
        if (!a) throw new Error("DoH A \u89E3\u6790\u5931\u8D25");
        return queryServer(a.host, port, host);
      }, "fn"),
      name: "doh-a"
    },
    {
      fn: /* @__PURE__ */ __name(async () => {
        const srv = await resolveDoh(`_minecraft._tcp.${host}`, "SRV");
        if (!srv) throw new Error("DoH SRV \u89E3\u6790\u5931\u8D25");
        let h = srv.host;
        if (!isIpAddress(h)) {
          const a = await resolveDoh(h, "A");
          if (a) h = a.host;
          else throw new Error("SRV \u76EE\u6807\u57DF\u540D\u89E3\u6790\u5931\u8D25");
        }
        const inner = [queryServer(h, srv.port, host)];
        if (userSpecifiedPort && port !== srv.port) {
          inner.push(queryServer(h, port, host));
        }
        return Promise.any(inner);
      }, "fn"),
      name: "doh-srv"
    }
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await attempt.fn();
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `\u65E0\u6CD5\u8FDE\u63A5\u5230\u670D\u52A1\u5668\uFF0C\u8BF7\u68C0\u67E5\u5730\u5740\u662F\u5426\u6B63\u786E (\u6700\u540E\u9519\u8BEF: ${lastError instanceof Error ? lastError.message : String(lastError)})`
  );
}
__name(queryWithFallback, "queryWithFallback");
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
var index_default = {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (url.pathname !== "/query" && url.pathname !== "/") {
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }
    const address = url.searchParams.get("address");
    if (!address) {
      return new Response(JSON.stringify({ error: "\u7F3A\u5C11\u670D\u52A1\u5668\u5730\u5740" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }
    const [host, portStr] = address.split(":");
    const port = portStr ? parseInt(portStr, 10) : 25565;
    if (!host || isNaN(port) || port < 1 || port > 65535) {
      return new Response(JSON.stringify({ error: "\u65E0\u6548\u7684\u670D\u52A1\u5668\u5730\u5740" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }
    try {
      const result = await queryWithFallback(host, port, portStr != null);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "\u67E5\u8BE2\u5931\u8D25";
      return new Response(JSON.stringify({ host, port, online: false, error: message }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }
  }
};

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-Hu2N9W/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = index_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-Hu2N9W/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
