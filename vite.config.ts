import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm", "@webcontainer/api", "webr", "php-wasm"],
  },
  build: {
    target: "es2022",
    sourcemap: true,
    // CodeMirror language parsers are intentionally bundled for offline, runtime-CDN-free use.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
