import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/hub",
        destination: "/master-admin",
        permanent: false,
      },
      {
        source: "/hub/login",
        destination: "/master-admin/login",
        permanent: false,
      },
      {
        source: "/hub/setup",
        destination: "/master-admin/setup",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
