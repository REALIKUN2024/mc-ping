"use client";

import { useState, useCallback, useRef, FormEvent } from "react";
import { queryServer } from "@/lib/api";
export type { ServerData } from "@/lib/api";
import type { ServerData } from "@/lib/api";

interface QueryFormProps {
  onQuery: (data: ServerData, address: string) => void;
  onLoading: (loading: boolean) => void;
  isLoading: boolean;
}

const DEFAULT_SERVERS = [
  { label: "Hypixel", address: "play.hypixel.net" },
  { label: "Mineplex", address: "us.mineplex.com" },
  { label: "2b2t", address: "2b2t.org" },
  { label: "CubeCraft", address: "play.cubecraft.net" },
];

export default function QueryForm({
  onQuery,
  onLoading,
  isLoading,
}: QueryFormProps) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = address.trim();
      if (!trimmed) {
        setError("请输入服务器地址");
        inputRef.current?.focus();
        return;
      }

      setError("");
      onLoading(true);

      try {
        const data = await queryServer(trimmed);
        onQuery(data, trimmed);
      } catch {
        onQuery({ online: false, host: trimmed, port: 25565, error: "网络请求失败" }, trimmed);
      } finally {
        onLoading(false);
      }
    },
    [address, onQuery, onLoading]
  );

  const handleQuickQuery = useCallback(
    (serverAddress: string) => {
      setAddress(serverAddress);
      onLoading(true);
      queryServer(serverAddress)
        .then((data: ServerData) => onQuery(data, serverAddress))
        .catch(() =>
          onQuery({ online: false, host: serverAddress, port: 25565, error: "网络请求失败" }, serverAddress)
        )
        .finally(() => onLoading(false));
    },
    [onQuery, onLoading]
  );

  return (
    <div className="w-full max-w-lg">
      <div className="mb-12">
        <div className="inline-block border-l-4 border-accent pl-6 mb-6">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter leading-none text-zinc-900 dark:text-zinc-50">
            Minecraft
          </h1>
          <p className="text-2xl md:text-3xl font-light tracking-tight leading-none mt-2 text-zinc-500 dark:text-zinc-400">
            服务器状态查询
          </p>
        </div>
        <p className="text-base text-zinc-500 dark:text-zinc-400 max-w-[50ch] leading-relaxed mt-8">
          输入 Minecraft 服务器地址，实时获取在线状态、玩家数量、延迟与 MOTD 信息。
          支持 Java 版服务器查询。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-10">
        <label
          htmlFor="server-address"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
        >
          服务器地址
        </label>
        <div className="flex gap-0">
          <input
            ref={inputRef}
            id="server-address"
            type="text"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (error) setError("");
            }}
            placeholder="play.hypixel.net"
            className="flex-1 h-12 px-4 text-base bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-accent transition-premium"
            autoComplete="off"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="h-12 px-8 bg-accent text-white text-sm font-medium tracking-wide hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-premium"
          >
            {isLoading ? "查询中..." : "查询"}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
          常用服务器
        </h3>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_SERVERS.map((server) => (
            <button
              key={server.address}
              onClick={() => handleQuickQuery(server.address)}
              disabled={isLoading}
              className="px-4 py-2 text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-accent hover:border-accent active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-premium"
            >
              {server.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
