import { configDefaults, defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  test: {
    environment: "jsdom",
    // Playwright runs these.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
