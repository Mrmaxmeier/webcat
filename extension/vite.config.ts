import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const isTesting = process.env.TESTING === "true";

export default defineConfig({
  define: {
    __TESTING__: JSON.stringify(isTesting),
  },
  build: {
    sourcemap: true,
    minify: !isTesting,
    outDir: "dist",
    target: "esnext",
    rollupOptions: {
      input: {
        main: "src/background.ts",
      },
      output: {
        entryFileNames: "bundle.js",
        format: "iife",
      },
    },
  },
  plugins: [viteSingleFile()],
  test: {
    globals: true,
  },
});
