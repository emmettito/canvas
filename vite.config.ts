import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  // The demo imports the library by its package name, as another project
  // would, so it can only use what the library exports.
  resolve: {
    alias: [
      {
        find: /^@emmettito\/canvas$/,
        replacement: fileURLToPath(new URL("src/index.ts", import.meta.url)),
      },
    ],
  },
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
              // The collaboration server is its own entry, so it runs on a
              // server without the rest.
              entry: {
                canvas: "src/index.ts",
                "collaboration-server": "src/collaboration-server.ts",
              },
              formats: ["es"],
              fileName: (_format, name) => `${name}.js`,
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
