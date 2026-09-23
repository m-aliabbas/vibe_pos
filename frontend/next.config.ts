import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // Required for Tauri sidecar bundling
  /* config options here */
  reactCompiler: true,
  images: {
    unoptimized: true,
  },
  
   allowedDevOrigins: [
    "pos.local",
    "localhost",
    "*"
  ]
};

export default nextConfig;
