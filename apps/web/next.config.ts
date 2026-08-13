import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker / 精简镜像用 standalone 输出
  output: "standalone",
  // Next 16 blocks 127.0.0.1 ↔ localhost as cross-origin in dev (breaks client hydration).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // sharp splits platform binaries under @img/*; standalone tracing often misses them.
  outputFileTracingIncludes: {
    "/api/artifacts/*/thumb": [
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
    ],
    "/*": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
  },
  experimental: {
    optimizePackageImports: [
      "@modeldesk/shared",
      "@modeldesk/model-registry",
    ],
  },
  transpilePackages: [
    "@modeldesk/shared",
    "@modeldesk/adapters",
    "@modeldesk/model-registry",
    "@modeldesk/object-storage",
    "@modeldesk/tos-storage",
  ],
  serverExternalPackages: [
    "better-sqlite3",
    "sharp",
    "@volcengine/tos-sdk",
    "@aws-sdk/client-s3",
    "ali-oss",
    "cos-nodejs-sdk-v5",
    "bce-sdk-js",
  ],
};

export default nextConfig;
