import type { NextConfig } from "next";

// Static export: PRD §8 requires the public link to be a dumb static host —
// no live inference behind it, must survive several judges opening it at once.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  basePath: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  // The floating dev badge sits on top of the footer's honesty labels.
  devIndicators: false,
};

export default nextConfig;
