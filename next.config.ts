import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { typedRoutes: true },
  images: { unoptimized: true },
  async rewrites() {
    return [{ source: "/media/:path*", destination: "/api/media/:path*" }];
  },
};
export default nextConfig;
