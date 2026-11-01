import { readdirSync } from "node:fs";
import { type Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import { attachCollaboration } from "./server/collaboration-socket.ts";

// The test pages, beside the demo page in the build the tests run against.
const FIXTURES_DIR = "e2e/fixtures";

/**
 * Lets the test pages' canvases draw together while they're served by the dev
 * server, or `vite preview`, through `CollaborationServer`. Built pages on
 * GitHub Pages have no server, so they draw alone.
 */
function collaborationServer(): Plugin {
  return {
    name: "canvas-collaboration-server",
    configureServer(server) {
      if (server.httpServer) {
        const stop = attachCollaboration(server.httpServer as never);
        server.httpServer.on("close", stop);
      }
    },
    configurePreviewServer(server) {
      const stop = attachCollaboration(server.httpServer as never);
      server.httpServer.on("close", stop);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Relative asset paths let the demo page work from any folder, e.g. GitHub
  // Pages serves it from `/canvas/`.
  base: mode === "demo" ? "./" : "/",
  plugins: [collaborationServer()],
  // `build` makes the library, `build --mode demo` the demo page for GitHub
  // Pages, and `build --mode e2e` the demo page with the test pages, for CI's
  // Playwright tests.
  build:
    mode === "demo"
      ? { outDir: "dist-demo" }
      : mode === "e2e"
        ? {
            outDir: "dist-e2e",
            rollupOptions: {
              input: [
                "index.html",
                ...readdirSync(FIXTURES_DIR)
                  .filter((file) => file.endsWith(".html"))
                  .map((file) => `${FIXTURES_DIR}/${file}`),
              ],
            },
          }
        : {
            lib: {
              // The ProseMirror editor is its own entry, so only pages that
              // import it need ProseMirror, and the collaboration server is
              // too, so it runs on a server without the rest.
              entry: {
                canvas: "src/index.ts",
                prosemirror: "src/prosemirror.ts",
                "collaboration-server": "src/collaboration-server.ts",
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
