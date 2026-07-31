"use client";

import { useState } from "react";
import { ServerData } from "./QueryForm";

interface ServerResultProps {
  data: ServerData | null;
  isLoading: boolean;
  onRetry?: () => void;
}

function stripMcCodes(text: string): string {
  return text.replace(/§[0-9a-fk-or]/gi, "");
}

function MotdDisplay({ motd }: { motd: string }) {
  const clean = motd.replace(/§[0-9a-fk-or]/gi, "").trim();
  const lines = clean.split("\n").filter(Boolean);
  if (lines.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => (
        <p key={i} className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 font-mono whitespace-pre-wrap">
          {line}
        </p>
      ))}
    </div>
  );
}

const SERVER_TYPE_STYLES: Record<string, string> = {
  Vanilla: "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400",
  Paper: "border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400",
  Spigot: "border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400",
  Bukkit: "border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400",
  Purpur: "border-pink-300 dark:border-pink-800 text-pink-600 dark:text-pink-400",
  Pufferfish: "border-cyan-300 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400",
  Fabric: "border-yellow-300 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400",
  Quilt: "border-sky-300 dark:border-sky-800 text-sky-600 dark:text-sky-400",
  Forge: "border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400",
  NeoForge: "border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400",
  Folia: "border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400",
  Leaves: "border-lime-300 dark:border-lime-800 text-lime-600 dark:text-lime-400",
  Gale: "border-teal-300 dark:border-teal-800 text-teal-600 dark:text-teal-400",
  Velocity: "border-indigo-300 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400",
  BungeeCord: "border-violet-300 dark:border-violet-800 text-violet-600 dark:text-violet-400",
  Waterfall: "border-sky-300 dark:border-sky-800 text-sky-600 dark:text-sky-400",
  Glowstone: "border-red-300 dark:border-red-800 text-red-600 dark:text-red-400",
};

function PlayerList({
  players,
  totalOnline,
}: {
  players: string[];
  totalOnline: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const threshold = 50;
  const hasMore = players.length > threshold;
  const displayPlayers = showAll || !hasMore ? players : players.slice(0, threshold);

  if (totalOnline > 0 && players.length === 0) {
    return (
      <div className="animate-fade-in-up stagger-7">
        <h4 className="text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
          在线玩家 ({totalOnline})
        </h4>
        <p className="text-sm text-zinc-400 dark:text-zinc-600">
          服务器未提供玩家列表（{totalOnline} 人在线）
        </p>
      </div>
    );
  }

  if (players.length === 0) return null;

  return (
    <div className="animate-fade-in-up stagger-7">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          在线玩家 ({totalOnline || players.length})
        </h4>
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-accent hover:brightness-110 active:scale-[0.98] transition-premium"
          >
            {showAll ? "收起" : `查看全部 ${players.length} 人`}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {displayPlayers.map((player, index) => (
          <span
             key={`${player}-${index}`}
             className={`inline-block px-3 py-1 text-xs font-mono border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 animate-fade-in-up stagger-${Math.min(index + 1, 10)}`}
           >
             {stripMcCodes(player)}
          </span>
        ))}
      </div>
      {players.length < totalOnline && (
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-600">
          以上仅展示 {players.length} 名玩家，在线总数 {totalOnline}
        </p>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start gap-6">
        <div className="w-16 h-16 skeleton-loader" />
        <div className="flex-1 space-y-3">
          <div className="h-5 w-48 skeleton-loader" />
          <div className="h-4 w-32 skeleton-loader" />
          <div className="h-4 w-64 skeleton-loader" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-16 skeleton-loader" />
        <div className="h-16 skeleton-loader" />
      </div>
      <div className="h-20 skeleton-loader" />
      <div className="space-y-2">
        <div className="h-4 w-24 skeleton-loader" />
        <div className="flex gap-2">
          <div className="h-6 w-16 skeleton-loader" />
          <div className="h-6 w-20 skeleton-loader" />
          <div className="h-6 w-14 skeleton-loader" />
        </div>
      </div>
    </div>
  );
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span className="relative flex h-3 w-3">
      <span
        className={`absolute inset-0 ${online ? "bg-accent animate-pulse-slow" : "bg-zinc-300 dark:bg-zinc-600"}`}
      />
    </span>
  );
}

function ServerTypeBadge({ type }: { type: string }) {
  const style =
    SERVER_TYPE_STYLES[type] ??
    "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400";

  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider border ${style}`}
    >
      {type}
    </span>
  );
}

export default function ServerResult({ data, isLoading, onRetry }: ServerResultProps) {
  const [showAllMods, setShowAllMods] = useState(false);

  if (isLoading) {
    return (
      <div className="w-full max-w-xl">
        <LoadingSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full max-w-xl flex items-center justify-center min-h-[300px]">
        <div className="text-center animate-fade-in-up">
          <div className="flex justify-center mb-5">
            <span className="h-4 w-4 bg-zinc-200 dark:bg-zinc-700" />
          </div>
          <p className="text-lg text-zinc-400 dark:text-zinc-500 font-light">
            输入服务器地址开始查询
          </p>
          <p className="text-sm text-zinc-300 dark:text-zinc-600 mt-1">
            支持 Java 版 Minecraft 服务器
          </p>
        </div>
      </div>
    );
  }

  if (!data.online || data.error) {
    return (
      <div className="w-full max-w-xl flex items-center justify-center min-h-[300px]">
        <div className="w-full max-w-sm text-center animate-fade-in-up">
          <div className="flex justify-center mb-5">
            <span className="relative flex h-4 w-4">
              <span className="absolute inset-0 bg-red-500 animate-pulse-slow" />
            </span>
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
            服务器无法连接
          </h2>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 font-mono mb-6">
            {data.host && data.port ? `${data.host}:${data.port}` : data.host || ""}
          </p>

          <div className="text-left inline-block mb-6">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
              可能的原因
            </p>
            <ul className="space-y-1 mb-4">
              <li className="text-sm text-zinc-500 dark:text-zinc-400">
                服务器已关闭或未穿透
              </li>
              <li className="text-sm text-zinc-500 dark:text-zinc-400">
                您输入的地址不正确
              </li>
              <li className="text-sm text-zinc-500 dark:text-zinc-400">
                您的网络不稳定
              </li>
            </ul>
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
              建议
            </p>
            <ul className="space-y-1 mb-4">
              <li className="text-sm text-zinc-500 dark:text-zinc-400">
                联系服主咨询相关事宜
              </li>
              <li className="text-sm text-zinc-500 dark:text-zinc-400">
                检查您输入的地址
              </li>
              <li className="text-sm text-zinc-500 dark:text-zinc-400">
                检查您的网络
              </li>
            </ul>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 leading-relaxed">
              提醒：如果以上原因均确认无误但仍显示离线，请
              <a
                href="https://github.com/REALIKUN2024/mc-ping/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-accent hover:brightness-110 transition-premium"
              >
                点击这里
              </a>
              联系网站作者
            </p>
          </div>

          {onRetry && (
            <button
              onClick={onRetry}
              className="h-10 px-8 bg-accent text-white text-sm font-medium tracking-wide hover:brightness-110 active:scale-[0.98] transition-premium"
            >
              重新检测
            </button>
          )}
        </div>
      </div>
    );
  }

  const statsColumns =
    1 +
    (data.latency !== undefined && data.latency > 0 ? 1 : 0) +
    (data.serverType ? 1 : 0);

  return (
    <div className="w-full max-w-xl space-y-8">
      <div className="animate-fade-in-up">
        <div className="flex items-start gap-5">
          {data.favicon && (
            <div className="flex-shrink-0 w-16 h-16 border border-zinc-200 dark:border-zinc-800 animate-scale-in">
              <img
                src={data.favicon}
                alt="服务器图标"
                className="w-full h-full object-contain p-1"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <StatusDot online={true} />
              <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
                {data.host}
              </h2>
            </div>
            {data.serverType && (
              <div className="mb-2 animate-fade-in-up stagger-1">
                <ServerTypeBadge type={data.serverType} />
              </div>
            )}
            {data.motd && (
              <div className="animate-fade-in-up stagger-1">
                <MotdDisplay motd={data.motd} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="animate-fade-in-up stagger-3">
        <div
          className="grid gap-px bg-zinc-200 dark:bg-zinc-800"
          style={{ gridTemplateColumns: `repeat(${statsColumns}, 1fr)` }}
        >
          <div className="bg-white dark:bg-zinc-900 p-5">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
              在线玩家
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold tracking-tight text-accent font-mono">
                {data.playersOnline ?? 0}
              </span>
              <span className="text-sm text-zinc-400 dark:text-zinc-500 font-mono">
                / {data.playersMax ?? 0}
              </span>
            </div>
            {(data.playersMax ?? 0) > 0 && (
              <div className="mt-3 h-1 w-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-1 bg-accent transition-all duration-500"
                  style={{
                    width: `${Math.min(((data.playersOnline ?? 0) / (data.playersMax ?? 1)) * 100, 100)}%`,
                  }}
                />
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
              版本
            </p>
            <p className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 font-mono">
              {data.version ?? "未知"}
            </p>
            {data.protocol !== undefined && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 font-mono">
                协议 {data.protocol}
              </p>
            )}
          </div>

          {data.latency !== undefined && data.latency > 0 && (
            <div className="bg-white dark:bg-zinc-900 p-5">
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                延迟
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 font-mono">
                  {data.latency}
                </span>
                <span className="text-sm text-zinc-400 dark:text-zinc-500">ms</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {data.playerList !== undefined && (
        <PlayerList
          players={data.playerList}
          totalOnline={data.playersOnline ?? 0}
        />
      )}

      {data.modInfo && data.modInfo.modList.length > 0 && (() => {
        const mods = data.modInfo.modList;
        const threshold = 20;
        const hasMore = mods.length > threshold;
        const displayMods = showAllMods || !hasMore ? mods : mods.slice(0, threshold);
        return (
        <div className="animate-fade-in-up stagger-8">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              模组列表 ({data.modInfo.type} &middot; {mods.length})
            </h4>
            {hasMore && (
              <button
                onClick={() => setShowAllMods(!showAllMods)}
                className="text-xs text-accent hover:brightness-110 active:scale-[0.98] transition-premium"
              >
                {showAllMods ? "收起" : `查看全部 ${mods.length} 个模组`}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {displayMods.map((mod, index) => (
              <span
                key={mod.modid}
                className={`inline-block px-3 py-1 text-xs font-mono border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 animate-fade-in-up stagger-${Math.min(index + 1, 10)}`}
              >
                {mod.modid} <span className="text-zinc-400">v{mod.version}</span>
              </span>
            ))}
          </div>
        </div>
        );
      })()}

      <div className="animate-fade-in-up stagger-10 pt-2">
        <p className="text-[11px] text-zinc-300 dark:text-zinc-700 font-mono">
          {data.host}:{data.port} &middot; {data.version ?? "未知"} &middot;{" "}
          {data.playersOnline ?? 0}/{data.playersMax ?? 0} 人在线
          {data.latency !== undefined && data.latency > 0
            ? ` &middot; ${data.latency}ms`
            : ""}
        </p>
      </div>
    </div>
  );
}
