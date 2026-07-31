"use client";

import { useState, useCallback } from "react";
import QueryForm, { ServerData } from "@/components/QueryForm";
import ServerResult from "@/components/ServerResult";

export default function Home() {
  const [serverData, setServerData] = useState<ServerData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastAddress, setLastAddress] = useState("");

  const handleQuery = useCallback((data: ServerData, address: string) => {
    setServerData(data);
    setLastAddress(address);
  }, []);

  const handleLoading = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  const handleRetry = useCallback(() => {
    if (!lastAddress || isLoading) return;
    setIsLoading(true);
    fetch(`/api/query?address=${encodeURIComponent(lastAddress)}`)
      .then((res) => res.json())
      .then((data: ServerData) => setServerData(data))
      .catch(() =>
        setServerData({ online: false, host: lastAddress, port: 25565, error: "网络请求失败" })
      )
      .finally(() => setIsLoading(false));
  }, [lastAddress, isLoading]);

  return (
    <div className="lg:flex bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full lg:w-[42%] lg:h-[100dvh] lg:overflow-y-auto lg:overscroll-contain px-6 py-12 md:px-12 md:py-16 lg:px-16 lg:py-20 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <QueryForm
          onQuery={handleQuery}
          onLoading={handleLoading}
          isLoading={isLoading}
        />
      </div>

      <div className="w-full lg:w-[58%] lg:h-[100dvh] lg:overflow-y-auto lg:overscroll-contain px-6 py-12 md:px-12 md:py-16 lg:px-16 lg:py-20">
        <ServerResult data={serverData} isLoading={isLoading} onRetry={handleRetry} />
      </div>

      <footer className="lg:hidden px-6 md:px-12 py-6 border-t border-zinc-200 dark:border-zinc-800">
        <p className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">
          Ping &middot; Minecraft Server Status Query Tool
        </p>
      </footer>
    </div>
  );
}
