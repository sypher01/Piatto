import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_BASE_PATH: set to '' for standalone deployment, '/recipes_web' for monorepo nginx proxy
  basePath: process.env.NEXT_BASE_PATH ?? '/recipes_web',
  output: 'standalone',
};

export default nextConfig;
