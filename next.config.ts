import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.EXPORT === "1" ? "export" : undefined,
  devIndicators: false,
};

export default nextConfig;
