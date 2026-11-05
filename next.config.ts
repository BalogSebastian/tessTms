import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep dev and production output separate so a build cannot break a running dev server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // Public, login-free product presentation served as a static page.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/bemutato", destination: "/bemutato/index.html" },
      ],
    };
  },
};

export default nextConfig;
