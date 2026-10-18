import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The repo root has the desktop app's lockfile; this site is its own project.
  turbopack: {
    root: process.cwd(),
  },
  images: {
    // Screenshots are full of small UI text: serve them near-lossless.
    qualities: [75, 95],
  },
};

export default nextConfig;
