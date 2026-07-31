# Ping - Minecraft 服务器状态查询

实时查询 Minecraft Java 版服务器状态、在线玩家、延迟与 MOTD 信息。支持 SRV 记录解析与多 DNS 兜底。

## 在线体验

- 前端：https://mc-ping-site.pages.dev
- API：https://api.mc-ping.top/query?address=服务器地址

## 功能

- 服务器状态查询（在线 / 离线 / 玩家数 / 版本 / 延迟）
- MOTD 显示（自动清理 Minecraft 格式代码）
- 服务端类型识别（Forge / Fabric / Paper / Velocity 等 15+ 种）
- 模组列表查看（支持折叠展开）
- 玩家列表（支持折叠展开，区分"未提供玩家列表"）
- SRV 记录自动解析
- 多路 DNS 并发兜底（系统 DNS + DoH 国内 5 端点）
- 地域限制服务器友好提示（支持跳转 mclist 查询）

## 实现方式（架构）

```
浏览器 → mc-ping-site.pages.dev (Cloudflare Pages 静态前端)
   → api.mc-ping.top (Cloudflare Worker)
      ├─ Worker 直连 MC 服务器（国内服务器，延迟低）
      └─ 直连失败 → 转发 Vercel API 兜底
         （处理 Hypixel 等使用 Cloudflare 防护、Worker 无法直连的服务器）
```

### 各层职责

| 组件 | 技术 | 作用 |
|---|---|---|
| 前端 | Next.js 静态导出 + Tailwind CSS | 页面 UI、交互、状态展示 |
| Worker | Cloudflare Worker (`cloudflare:sockets`) | 主 API，TCP 直连查询 |
| Vercel | Next.js API Route (Node.js `net`) | 兜底 API，连接 Worker 无法访问的服务器 |
| 域名 | `mc-ping.top`（DNS 托管在 Cloudflare） | 国内可访问的自定义域名 |

### 查询流程

1. 前端发起查询 → 请求 `api.mc-ping.top/query?address=...`
2. Worker 尝试 TCP 直连目标服务器（支持 IP / 域名 / SRV 记录）
3. 直连失败 → Worker 内部转发到 Vercel 兜底 API
4. 返回结果（在线状态、玩家、MOTD、服务端类型、延迟等）

### DNS 兜底策略

- 系统 DNS 直连
- DoH 解析（阿里 DNS / DNSPod / 360 / Cloudflare / Google，串行尝试）
- DoH SRV 记录解析（处理纯 SRV 域名）
- 串行兜底，避免触发 Cloudflare 连接数限制

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。本地开发使用本地 API 路由（Node.js 直连，可查询所有服务器）。

## 构建与部署

```bash
# 前端静态导出（部署到 Cloudflare Pages）
npm run build:export
npx wrangler pages deploy out --project-name mc-ping-site --branch master --commit-dirty=true

# Worker API 部署
npm run worker:deploy

# Vercel API 部署（需在 Vercel 手动 Redeploy）
```

---

# Ping - Minecraft Server Status Query

Real-time Minecraft Java Edition server status checker. Query online status, player count, latency, and MOTD. Supports SRV record resolution and multi-DNS fallback.

## Live Demo

- Frontend: https://mc-ping-site.pages.dev
- API: https://api.mc-ping.top/query?address=server-address

## Features

- Server status query (online/offline, player count, version, latency)
- MOTD display (auto-strips Minecraft formatting codes)
- Server type detection (Forge / Fabric / Paper / Velocity & 15+ types)
- Mod list viewer (collapsible)
- Player list (collapsible, distinguishes "no sample provided")
- Automatic SRV record resolution
- Multi-path DNS fallback (system DNS + 5 domestic DoH endpoints)
- Region-limited server hints (links to mclist)

## Architecture

```
Browser → mc-ping-site.pages.dev (Cloudflare Pages static frontend)
   → api.mc-ping.top (Cloudflare Worker)
      ├─ Worker direct TCP connection (fast for domestic servers)
      └─ on failure → forward to Vercel API fallback
         (handles Cloudflare-protected servers like Hypixel)
```

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser. Local dev uses the local API route (Node.js, connects to all servers).

## Build & Deploy

```bash
# Frontend static export (Cloudflare Pages)
npm run build:export
npx wrangler pages deploy out --project-name mc-ping-site --branch master --commit-dirty=true

# Worker API
npm run worker:deploy
```
