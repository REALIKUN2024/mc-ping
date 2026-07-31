# Ping - Minecraft 服务器状态查询

实时查询 Minecraft Java 版服务器状态、在线玩家、延迟与 MOTD 信息。支持 SRV 记录解析与多 DNS 兜底。

## 功能

- 服务器状态查询（在线 / 离线 / 玩家数 / 版本 / 延迟）
- MOTD 显示
- 服务端类型识别（Forge / Fabric / Paper / Velocity 等 15+ 种）
- 模组列表查看
- SRV 记录自动解析
- 多路 DNS 并发兜底（系统 DNS + DoH 国内 5 端点）

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。

## 构建

```bash
npm run build
npm start
```

---

# Ping - Minecraft Server Status Query

Real-time Minecraft Java Edition server status checker. Query online status, player count, latency, and MOTD. Supports SRV record resolution and multi-DNS fallback.

## Features

- Server status query (online/offline, player count, version, latency)
- MOTD display
- Server type detection (Forge / Fabric / Paper / Velocity & 15+ types)
- Mod list viewer
- Automatic SRV record resolution
- Multi-path DNS fallback (system DNS + 5 domestic DoH endpoints)

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Build

```bash
npm run build
npm start
```
