import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Cloudflare Tunnel cross-origin requests in development mode
  allowedDevOrigins: [
    'conviction-mighty-standards-regulations.trycloudflare.com',
  ],
};

export default nextConfig;
