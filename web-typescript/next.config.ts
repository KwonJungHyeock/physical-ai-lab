import type { NextConfig } from "next";

// ROBOT_EXPORT=1 (npm run build:robot) builds plain static files for the
// on-robot server (robot-python/server), which has no Node.js.
const nextConfig: NextConfig = process.env.ROBOT_EXPORT === "1" ? { output: "export", distDir: ".next-robot" } : {};

export default nextConfig;
