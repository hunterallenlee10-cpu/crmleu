import type { NextConfig } from "next";

// Every page in the CRM is per-user, so we keep classic dynamic rendering
// (no Cache Components) to keep the code simple.
const nextConfig: NextConfig = {
  experimental: {
    // CSV imports send all their rows to a server action in one request.
    serverActions: { bodySizeLimit: "5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
