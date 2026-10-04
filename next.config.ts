import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Old screens folded into the four tabs. Kept as redirects so bookmarks and
  // links in old notifications still land somewhere sensible.
  async redirects() {
    return [
      { source: "/trends", destination: "/water", permanent: false },
      { source: "/tasks", destination: "/care", permanent: false },
      { source: "/calendar", destination: "/care?view=calendar", permanent: false },
    ];
  },
};

export default nextConfig;
