import { type CollaborationConnection, type MountedCanvas } from "./index";

// Where canvases connect to draw together, beside the page, as
// `server/collaboration-socket.ts` sets up.
const COLLABORATION_PATH = "collaborate";
// The dev server answers this with where other devices can open the page.
const NETWORK_URL_EVENT = "canvas:network-url";
// How long to wait to connect again once the connection's lost, e.g. as the
// server restarts, in milliseconds.
const RECONNECT_DELAY = 1000;
// The address's search parameter with the room to join.
const ROOM_PARAM = "room";
// How long the copy button says it's copied.
const COPIED_DURATION = 1500;

export interface Sharing {
  /** Opens the Share dialog. */
  open: () => void;
  /** Joins the room in the page's address, if there is one. */
  joinFromAddress: () => void;
}

interface Socket extends CollaborationConnection {
  close: () => void;
}

// A WebSocket to the server beside the page. What's sent before it opens is
// sent once it does. `onLost` is called if it closes other than by `close`.
function connect(onLost: () => void): Socket {
  const url = new URL(COLLABORATION_PATH, location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.search = "";
  url.hash = "";
  const socket = new WebSocket(url);
  const waiting: string[] = [];
  let closed = false;
  socket.addEventListener("open", () => {
    for (const message of waiting.splice(0)) {
      socket.send(message);
    }
  });
  socket.addEventListener("close", () => {
    if (!closed) {
      onLost();
    }
  });
  return {
    send: (message) => {
      const data = JSON.stringify(message);
      if (socket.readyState === WebSocket.CONNECTING) {
        waiting.push(data);
      } else if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    },
    listen: (listener) => {
      const onMessage = (event: MessageEvent) => {
        let message;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        listener(message);
      };
      socket.addEventListener("message", onMessage);
      return () => socket.removeEventListener("message", onMessage);
    },
    close: () => {
      closed = true;
      socket.close();
    },
  };
}

// Puts the room in the address, or takes it out, without reloading, so a
// refresh rejoins it.
function showRoomInAddress(room: string | null) {
  const url = new URL(location.href);
  if (room) {
    url.searchParams.set(ROOM_PARAM, room);
  } else {
    url.searchParams.delete(ROOM_PARAM);
  }
  history.replaceState(history.state, "", url);
}

/**
 * Wires up the demo page's Share dialog, which shares the open canvas with
 * anyone who opens its link, to draw on together. It needs a server to pass
 * the drawing between them, the dev server or `npm start`'s, so it's null
 * on GitHub Pages, which has none. `getCanvas` is the mounted canvas.
 */
export function setUpSharing(
  dialog: HTMLDialogElement,
  open: () => void,
  getCanvas: () => MountedCanvas
): Sharing | null {
  // `build:demo` makes the page for GitHub Pages.
  if (import.meta.env.MODE === "demo") {
    return null;
  }
  const notShared = dialog.querySelector<HTMLElement>(".demo-share-start")!;
  const shared = dialog.querySelector<HTMLElement>(".demo-share-shared")!;
  const link = dialog.querySelector<HTMLInputElement>(".demo-share-link")!;
  const copy = dialog.querySelector<HTMLButtonElement>(".demo-share-copy")!;
  const hint = dialog.querySelector<HTMLElement>(".demo-share-hint")!;
  // Where other devices on the network can open the page, if they can.
  let networkUrl: string | null = null;
  let room: string | null = null;
  let leave: (() => void) | null = null;
  // The connection the canvas draws together through, until it leaves.
  let socket: Socket | null = null;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  // Joins room `id` over a new connection, which joins it again if it's
  // lost, until the canvas leaves it.
  function join(id: string) {
    const joined: Socket = connect(() =>
      setTimeout(() => {
        if (socket === joined) {
          join(id);
        }
      }, RECONNECT_DELAY)
    );
    // Set first, since joining over it leaves over the one it replaces.
    socket = joined;
    leave = getCanvas().collaborate(joined, {
      room: id,
      onLeave: () => {
        joined.close();
        if (socket !== joined) {
          return;
        }
        socket = null;
        room = null;
        leave = null;
        showRoomInAddress(null);
        show();
      },
    });
    room = id;
    showRoomInAddress(id);
    show();
  }

  function show() {
    notShared.hidden = room !== null;
    shared.hidden = room === null;
    if (room === null) {
      return;
    }
    const url = new URL(networkUrl ?? location.href, location.href);
    url.pathname = location.pathname;
    url.search = "";
    url.searchParams.set(ROOM_PARAM, room);
    link.value = url.href;
    if (!import.meta.env.DEV) {
      hint.textContent = "Anyone who can open this page can open it.";
    } else if (networkUrl) {
      hint.textContent =
        "Anyone on your network can open it while the dev server's running.";
    } else {
      const command = document.createElement("code");
      command.textContent = "npm run dev -- --host";
      hint.replaceChildren(
        "Only this computer can open it. To share it with other devices on your network, start the dev server with ",
        command,
        "."
      );
    }
  }

  dialog
    .querySelector(".demo-share-start-button")!
    .addEventListener("click", () => join(getCanvas().canvasId));
  dialog
    .querySelector(".demo-share-stop")!
    .addEventListener("click", () => leave?.());
  // The clipboard needs a secure page, which other devices on the network
  // aren't, so the link's selected to copy by hand if it can't be.
  copy.addEventListener("click", async () => {
    link.select();
    try {
      await navigator.clipboard.writeText(link.value);
      copy.textContent = "Copied";
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copy.textContent = "Copy";
      }, COPIED_DURATION);
    } catch {
      // Left selected.
    }
  });
  link.addEventListener("focus", () => link.select());

  import.meta.hot?.on(NETWORK_URL_EVENT, (url: string | null) => {
    networkUrl = url;
    show();
  });
  import.meta.hot?.send(NETWORK_URL_EVENT);
  show();

  return {
    open,
    joinFromAddress: () => {
      const id = new URL(location.href).searchParams.get(ROOM_PARAM);
      if (id) {
        join(id);
      }
    },
  };
}
