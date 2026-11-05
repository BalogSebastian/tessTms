import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep dev and production output separate so a build cannot break a running dev server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
