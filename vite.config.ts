import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: {
      // Split three.js (incl. examples/jsm/*) into its own vendor chunk: it is
      // the bulk of the bundle and changes far less often than app code, so a
      // return visit only re-downloads the ~66 kB app chunk. Real code-splitting
      // of the app itself is Plan 03.
      output: { manualChunks: { three: ["three"] } },
    },
    // three's own chunk is ~746 kB (192 kB gzip) and cached indefinitely; the
    // default 500 kB advisory only fires on it now that the app chunk is split
    // out. Lift the limit past three so a clean build stays quiet.
    chunkSizeWarningLimit: 800,
  },
  worker: { format: "es" },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
