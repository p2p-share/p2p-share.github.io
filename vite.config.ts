import { defineConfig } from "vitest/config";
import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

export default defineConfig({
  base: "/",
  plugins: [{
    name: "github-pages-clean-room-fallback",
    async closeBundle() {
      const output = resolve(process.cwd(), "dist");
      await copyFile(resolve(output, "index.html"), resolve(output, "404.html"));
    },
  }],
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
