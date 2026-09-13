import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  devIndicators: false,
  turbopack: { root: process.cwd() },
};

export default nextConfig;
