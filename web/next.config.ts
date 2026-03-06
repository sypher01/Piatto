import type { NextConfig } from "next";

const basePath = process.env.NEXT_BASE_PATH ?? '/recipes_web';

const nextConfig: NextConfig = {
  // NEXT_BASE_PATH: set to '' for standalone deployment, '/recipes_web' for monorepo nginx proxy
  basePath,
  output: 'standalone',
  // Expose basePath to client components for use in fetch() calls
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
