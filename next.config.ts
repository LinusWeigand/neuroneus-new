import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load these natively in Node instead of bundling them into the server build.
  serverExternalPackages: ["@octokit/rest", "@octokit/auth-app", "pg", "getdesign", "playwright-core"],
  // DESIGN.md templates are read from the getdesign package at runtime (not imported), so
  // ship them with every server route explicitly. Traced through pnpm's real paths: tracing
  // through the node_modules/getdesign symlink makes Vercel reject the deployment.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/.pnpm/getdesign@*/node_modules/getdesign/templates/**/*",
      "./node_modules/.pnpm/getdesign@*/node_modules/getdesign/package.json",
    ],
    // The playtest's browser client reads this at runtime.
    "/**": ["./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json"],
  },
  // The game kit is bundled into the server code (src/lib/build/game-kit.bundle.json); loose
  // template files in a function make Vercel reject the deployment.
  outputFileTracingExcludes: {
    "/**": ["./templates/**/*"],
  },
};

export default nextConfig;
