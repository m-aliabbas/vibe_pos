import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // Required for Tauri sidecar bundling
  /* config options here */
  reactCompiler: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
