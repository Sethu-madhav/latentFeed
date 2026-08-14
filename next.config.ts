import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
  experimental: {
    // Server Actions are used for the source controls in Section 2.
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
