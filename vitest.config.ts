import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      "@shared": resolve(__dirname, "./shared"),
    },
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"],
  },
  test: {
    setupFiles: ["./scripts/load-env.js"],
    cache: {
      dir: resolve(__dirname, ".vitest-cache"),
    },
  },
});