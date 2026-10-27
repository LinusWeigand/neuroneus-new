import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load these natively in Node instead of bundling them into the server build.
  serverExternalPackages: ["@octokit/rest", "@octokit/auth-app", "pg", "getdesign"],
  // DESIGN.md templates (getdesign package) and the game kit (templates/) are read at runtime,
  // not imported, so ship them with every server route explicitly.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/getdesign/templates/**/*", "./node_modules/getdesign/package.json", "./templates/**/*"],
  },
};

export default nextConfig;
