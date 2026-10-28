import { configDefaults, defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // `build` makes the library, and `build --mode demo` makes the demo page.
  build:
    mode === "demo"
      ? { outDir: "dist-demo" }
      : {
          lib: {
            entry: "src/index.ts",
            formats: ["es"],
            fileName: "canvas",
            cssFileName: "canvas",
          },
          // Public assets belong to the demo page.
          copyPublicDir: false,
        },
  test: {
    environment: "jsdom",
    // Playwright runs these.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
}));
