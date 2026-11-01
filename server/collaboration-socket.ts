import { type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { CollaborationServer } from "../src/collaboration-server.ts";

// The path canvases connect to, at the end of the page's own, so the page
// can be served from a folder. Only the test pages connect, through the dev
// server or `vite preview`.
export const COLLABORATION_PATH = "/collaborate";

// The largest message a canvas can send, e.g. an image's file as a data URL.
const MAX_MESSAGE_SIZE = 16 * 1024 * 1024;

// How often each connection is checked, in milliseconds. One that hasn't
// answered the last check is dropped, e.g. a laptop that went to sleep, so it
// doesn't stay in its room.
const HEARTBEAT_INTERVAL = 30_000;

/**
 * Runs rooms of canvases drawing together on `server`, over WebSockets at
 * `COLLABORATION_PATH`. Other upgrades are left alone, e.g. Vite's own.
 * Returns a function that stops it.
 */
export function attachCollaboration(server: Server): () => void {
  const rooms = new CollaborationServer();
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_SIZE,
  });
  const alive = new WeakSet<WebSocket>();

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    if (pathname.endsWith(COLLABORATION_PATH)) {
      sockets.handleUpgrade(request, socket, head, (ws) =>
        sockets.emit("connection", ws)
      );
    }
  });

  sockets.on("connection", (ws: WebSocket) => {
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    const connection = rooms.connect((message) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
    ws.on("message", (data) => {
      let message: unknown;
      try {
        message = JSON.parse(String(data));
      } catch {
        // Anything that isn't JSON isn't a message.
        return;
      }
      connection.receive(message);
    });
    ws.on("close", () => connection.close());
    ws.on("error", () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const ws of sockets.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL);

  return () => {
    clearInterval(heartbeat);
    for (const ws of sockets.clients) {
      ws.terminate();
    }
    sockets.close();
  };
}
