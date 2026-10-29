import { type Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import { attachCollaboration } from "./server/collaboration-socket.ts";

// The event the demo page asks where other devices can open it with.
const NETWORK_URL_EVENT = "canvas:network-url";

/**
 * Lets the demo page's canvases draw together while it's served by the dev
 * server, or `vite preview`, the same way `npm start`'s server does. Built
 * pages on GitHub Pages have no server, so they draw alone.
 */
function collaborationServer(): Plugin {
  return {
    name: "canvas-collaboration-server",
    configureServer(server) {
      if (server.httpServer) {
        const stop = attachCollaboration(server.httpServer as never);
        server.httpServer.on("close", stop);
      }
      // Where other devices can open the page, if the server's on the
      // network, e.g. with `--host`.
      server.ws.on(NETWORK_URL_EVENT, (_data, client) => {
        client.send(NETWORK_URL_EVENT, server.resolvedUrls?.network[0] ?? null);
      });
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
  // Pages, and `build --mode app` the demo page for `npm start` to serve,
  // which draws together.
  build:
    mode === "demo"
      ? { outDir: "dist-demo" }
      : mode === "app"
        ? { outDir: "dist-app" }
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
