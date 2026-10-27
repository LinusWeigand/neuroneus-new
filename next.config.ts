import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load these natively in Node instead of bundling them into the server build.
  serverExternalPackages: ["@octokit/rest", "@octokit/auth-app", "pg", "getdesign"],
  // DESIGN.md templates are read from the getdesign package at runtime (not imported),
  // so ship them with every server route explicitly.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/getdesign/templates/**/*", "./node_modules/getdesign/package.json"],
  },
};

export default nextConfig;
