import { configDefaults, defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Relative asset paths let the demo page work from any folder, e.g. GitHub
  // Pages serves it from `/canvas/`.
  base: mode === "demo" ? "./" : "/",
  // `build` makes the library, and `build --mode demo` makes the demo page.
  build:
    mode === "demo"
      ? { outDir: "dist-demo" }
      : {
          lib: {
            // The ProseMirror editor is its own entry, so only pages that
            // import it need ProseMirror.
            entry: {
              canvas: "src/index.ts",
              prosemirror: "src/prosemirror.ts",
            },
            formats: ["es"],
            fileName: (_format, name) => `${name}.js`,
            cssFileName: "canvas",
          },
          // Public assets belong to the demo page.
          copyPublicDir: false,
          // The host page installs ProseMirror to use the editor, so it's
          // loaded once even if the page uses it too.
          rollupOptions: { external: [/^prosemirror-/] },
        },
  test: {
    environment: "jsdom",
    // Playwright runs these.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
}));
