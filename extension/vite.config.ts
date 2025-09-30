import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        sw: resolve(__dirname, "src/sw.ts"),
        options: resolve(__dirname, "src/options/index.html")
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "sw") {
            return "sw.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: ({ name }) => {
          if (name && name.endsWith(".css")) {
            return "options/[name]";
          }
          return "assets/[name]-[hash][extname]";
        }
      }
    }
  }
});
