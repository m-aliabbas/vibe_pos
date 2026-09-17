import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // Required for Tauri sidecar bundling
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*',
      },
    ];
  },
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
