/*
 * The demo app's own server, for drawing together without the dev server:
 * it serves the page built by `npm run build:app`, and runs the rooms
 * canvases draw together in. Start it with `npm start`. PORT and HOST set
 * where it listens, and are 8080 and every address by default.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachCollaboration,
  COLLABORATION_PATH,
} from "./collaboration-socket.ts";

const ROOT = fileURLToPath(new URL("../dist-app/", import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

// The file `pathname` names in the build, or null if it's outside it. A
// folder is its index page.
function resolveFile(pathname: string): string | null {
  const relative = normalize(decodeURIComponent(pathname)).replace(
    /^([/\\])+/,
    ""
  );
  const file = join(ROOT, relative);
  if (file !== ROOT.slice(0, -1) && !file.startsWith(ROOT)) {
    return null;
  }
  return file.endsWith(sep) || relative === ""
    ? join(file, "index.html")
    : file;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let file: string | null = null;
  try {
    file = resolveFile(
      new URL(request.url ?? "/", "http://localhost").pathname
    );
  } catch {
    // A badly encoded address.
  }
  const stats = file ? await stat(file).catch(() => null) : null;
  if (!file || !stats?.isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
    "Content-Length": stats.size,
    // The build names its scripts and styles after what's in them, so they
    // never change. The page itself is checked each time, to get new ones.
    "Cache-Control": file.includes(`${sep}assets${sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
});

const stop = attachCollaboration(server);
// Nothing else upgrades, so any other upgrade is refused rather than left
// hanging.
server.on("upgrade", (request, socket) => {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  if (!pathname.endsWith(COLLABORATION_PATH)) {
    socket.destroy();
  }
});
server.listen(PORT, HOST, () => {
  console.log(`Canvas is running at http://${HOST ?? "localhost"}:${PORT}`);
});

// Stops cleanly, e.g. as a host restarts it.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stop();
    server.close(() => process.exit(0));
  });
}
