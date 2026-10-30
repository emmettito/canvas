/*
 * The server half of drawing together: rooms that pass each change on to
 * everyone in them, in one order, so everyone's drawing ends up the same. It
 * doesn't depend on how messages travel, or on anything else in the library,
 * so it runs anywhere, e.g. in Node behind a WebSocket server. Drawings and
 * changes pass through it as they are, so it never needs to understand them.
 */

/**
 * A point on the drawing, in drawing units, and the tool pointing there, e.g.
 * "pencil", passed on as it is, so the cursor can look like it. `size` is how
 * far the tool reaches from the point, in drawing units, if it has a size.
 */
export interface PeerPointer {
  x: number;
  y: number;
  tool?: string;
  size?: number;
}

/** The part of the drawing someone's canvas shows, in drawing units. */
export interface PeerView {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Someone in a room. */
export interface Peer {
  id: string;
  // Each is empty if they haven't set it.
  firstName: string;
  lastName: string;
  // Their photo's URL, e.g. a data URL, or empty if they haven't set one.
  avatar: string;
  // Their cursor's color, e.g. "#e5484d", so each person stands out.
  color: string;
  // Where their pointer is, or null while it's off their canvas.
  pointer: PeerPointer | null;
  // What their canvas shows, or null until they've said.
  view: PeerView | null;
  // The id of whoever they're following, whose view theirs shows, or null.
  following: string | null;
}

/**
 * A timer that goes off for everyone in a room, started by `by`. `sound` is
 * which to play, passed on as it is.
 */
export interface SharedTimer {
  // Milliseconds, from when it started.
  duration: number;
  // Milliseconds until it goes off, as of when it's sent, so it doesn't
  // depend on anyone's clock being right.
  remaining: number;
  sound: string;
  by: string;
}

/**
 * One change to the drawing, or undoing or redoing one of them, by whoever
 * the room says made it. Undoing a change leaves it out, so everything
 * changed since it stays.
 */
export type Edit<C = unknown> = { id: string; author: string } & (
  | { type: "change"; change: C }
  | { type: "undo" | "redo"; target: string }
);

/** An image's file, as a data URL, since it's kept apart from the drawing. */
export interface SharedImage {
  id: string;
  data: string;
}

/** What a canvas sends its room. */
export type ClientMessage<D = unknown, C = unknown, A = unknown> =
  // Joins `room`, which starts from `drawing` if nobody's in it yet.
  | {
      type: "join";
      room: string;
      firstName: string;
      lastName: string;
      avatar: string;
      drawing: D;
    }
  | { type: "edit"; edit: Edit<C> }
  | { type: "image"; image: SharedImage }
  | { type: "profile"; firstName: string; lastName: string; avatar: string }
  | { type: "pointer"; pointer: PeerPointer | null }
  // What they're in the middle of, e.g. a stroke they're drawing, or null
  // once they've stopped. It's passed on as it is, and isn't kept.
  | { type: "activity"; activity: A | null }
  | { type: "view"; view: PeerView }
  // Follows someone, or stops following anyone with null.
  | { type: "follow"; id: string | null }
  // Has everyone else follow them.
  | { type: "summon" }
  // Stops someone following them.
  | { type: "release"; id: string }
  // Starts the room's timer, in place of any already going, or stops it with
  // null.
  | { type: "timer"; timer: { duration: number; sound: string } | null }
  | { type: "leave" };

/** What a room sends each canvas in it. */
export type ServerMessage<D = unknown, C = unknown, A = unknown> =
  // Everything so far, once it's joined: the drawing the room started from,
  // every edit since, in order, and who else is there. `color` is theirs,
  // the same everyone else sees them in.
  | {
      type: "welcome";
      you: string;
      color: string;
      drawing: D;
      edits: Edit<C>[];
      images: SharedImage[];
      peers: Peer[];
      timer: SharedTimer | null;
    }
  // Sent to everyone, including whoever made it, once it's in the order.
  | { type: "edit"; edit: Edit<C> }
  | { type: "image"; image: SharedImage }
  // Someone's joined, or changed their name or photo.
  | { type: "presence"; peer: Peer }
  | { type: "pointer"; id: string; pointer: PeerPointer | null }
  | { type: "activity"; id: string; activity: A | null }
  | { type: "view"; id: string; view: PeerView }
  // Sent to everyone, including whoever started or stopped following.
  | { type: "follow"; id: string; following: string | null }
  // Sent to everyone, including whoever started or stopped it.
  | { type: "timer"; timer: SharedTimer | null }
  | { type: "left"; id: string };

/** One canvas's link to the server, for whatever carries its messages. */
export interface ServerConnection {
  /** Handles a message from the canvas. Anything that isn't one is ignored. */
  receive(message: unknown): void;
  /** The canvas went away, e.g. its tab closed. */
  close(): void;
}

// Cursor colors, given out in turn, each dark enough for white text.
const PEER_COLORS = [
  "#e5484d",
  "#0090ff",
  "#30a46c",
  "#8e4ec6",
  "#f76b15",
  "#d6409f",
  "#12a594",
  "#3e63dd",
];

// The longest a photo's URL can be, so a room's welcome stays small enough
// to send. A small photo, as the demo page makes, is a few kilobytes.
const MAX_AVATAR_LENGTH = 200_000;

// The longest a timer can run, in milliseconds: a day.
const MAX_TIMER_DURATION = 24 * 60 * 60 * 1000;
// The longest name of a timer's sound.
const MAX_SOUND_LENGTH = 32;
// The longest name of the tool someone's pointing with.
const MAX_TOOL_LENGTH = 32;

interface Member {
  peer: Peer;
  send: (message: ServerMessage) => void;
}

interface Room {
  drawing: unknown;
  edits: Edit[];
  images: Map<string, SharedImage>;
  members: Map<string, Member>;
  // When it goes off, by the server's clock.
  timer: (Omit<SharedTimer, "remaining"> & { endsAt: number }) | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPointer(value: unknown): value is PeerPointer | null {
  return (
    value === null ||
    (isObject(value) &&
      typeof value.x === "number" &&
      Number.isFinite(value.x) &&
      typeof value.y === "number" &&
      Number.isFinite(value.y) &&
      (value.tool === undefined ||
        (typeof value.tool === "string" &&
          value.tool.length <= MAX_TOOL_LENGTH)) &&
      (value.size === undefined ||
        (typeof value.size === "number" &&
          Number.isFinite(value.size) &&
          value.size >= 0)))
  );
}

// Empty if it isn't a name.
function readName(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// A data URL of an image, or an address on the web. Empty is no photo.
function isAvatar(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_AVATAR_LENGTH &&
    (value === "" ||
      value.startsWith("data:image/") ||
      value.startsWith("https://"))
  );
}

function isView(value: unknown): value is PeerView {
  return (
    isObject(value) &&
    [value.x, value.y, value.width, value.height].every(
      (each) => typeof each === "number" && Number.isFinite(each)
    ) &&
    (value.width as number) > 0 &&
    (value.height as number) > 0
  );
}

function isTimer(
  value: unknown
): value is { duration: number; sound: string } | null {
  return (
    value === null ||
    (isObject(value) &&
      typeof value.duration === "number" &&
      value.duration > 0 &&
      value.duration <= MAX_TIMER_DURATION &&
      typeof value.sound === "string" &&
      value.sound.length <= MAX_SOUND_LENGTH)
  );
}

// The room's timer as it's sent, or null once it's gone off.
function shareTimer({ timer }: Room): SharedTimer | null {
  if (!timer) {
    return null;
  }
  const { endsAt, ...rest } = timer;
  const remaining = endsAt - Date.now();
  return remaining > 0 ? { ...rest, remaining } : null;
}

function isEdit(value: unknown): value is Edit {
  if (!isObject(value) || typeof value.id !== "string") {
    return false;
  }
  return value.type === "change"
    ? "change" in value
    : (value.type === "undo" || value.type === "redo") &&
        typeof value.target === "string";
}

function isImage(value: unknown): value is SharedImage {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.data === "string" &&
    value.data.startsWith("data:image/")
  );
}

/**
 * Rooms of canvases drawing together. A room starts with whoever joins it
 * first, and ends once everyone's left, so the drawing lasts as long as
 * someone has it open, and each canvas keeps its own copy.
 */
export class CollaborationServer {
  #rooms = new Map<string, Room>();
  #nextId = 1;

  /**
   * Links a canvas to the server. `send` sends it a message. Pass what it
   * sends to `receive`, and call `close` once it's gone.
   */
  connect(send: (message: ServerMessage) => void): ServerConnection {
    const id = `peer-${this.#nextId++}`;
    let room: Room | null = null;
    let roomName = "";

    const broadcast = (message: ServerMessage, except?: string) => {
      for (const member of room?.members.values() ?? []) {
        if (member.peer.id !== except) {
          member.send(message);
        }
      }
    };

    // Who `peer` follows, told to everyone.
    const setFollowing = (peer: Peer, following: string | null) => {
      if (peer.following !== following) {
        peer.following = following;
        broadcast({ type: "follow", id: peer.id, following });
      }
    };

    const leave = () => {
      if (!room) {
        return;
      }
      room.members.delete(id);
      // Nobody follows someone who isn't here.
      for (const member of room.members.values()) {
        if (member.peer.following === id) {
          member.peer.following = null;
        }
      }
      broadcast({ type: "left", id });
      if (room.members.size === 0) {
        this.#rooms.delete(roomName);
      }
      room = null;
    };

    const join = (
      firstName: string,
      lastName: string,
      avatar: string,
      toRoom: string,
      drawing: unknown
    ) => {
      leave();
      let joined = this.#rooms.get(toRoom);
      if (!joined) {
        joined = {
          drawing,
          edits: [],
          images: new Map(),
          members: new Map(),
          timer: null,
        };
        this.#rooms.set(toRoom, joined);
      }
      room = joined;
      roomName = toRoom;
      const taken = new Set(
        [...joined.members.values()].map((m) => m.peer.color)
      );
      const color =
        PEER_COLORS.find((each) => !taken.has(each)) ??
        PEER_COLORS[joined.members.size % PEER_COLORS.length];
      const peer: Peer = {
        id,
        firstName,
        lastName,
        avatar,
        color,
        pointer: null,
        view: null,
        following: null,
      };
      send({
        type: "welcome",
        you: id,
        color,
        drawing: joined.drawing,
        edits: joined.edits,
        images: [...joined.images.values()],
        peers: [...joined.members.values()].map((member) => member.peer),
        timer: shareTimer(joined),
      });
      broadcast({ type: "presence", peer });
      joined.members.set(id, { peer, send });
    };

    return {
      receive: (message) => {
        if (!isObject(message)) {
          return;
        }
        if (message.type === "join") {
          if (typeof message.room === "string" && "drawing" in message) {
            join(
              readName(message.firstName),
              readName(message.lastName),
              isAvatar(message.avatar) ? message.avatar : "",
              message.room,
              message.drawing
            );
          }
          return;
        }
        const member = room?.members.get(id);
        if (!room || !member) {
          return;
        }
        switch (message.type) {
          case "edit":
            if (isEdit(message.edit)) {
              const edit = { ...message.edit, author: id };
              room.edits.push(edit);
              broadcast({ type: "edit", edit });
            }
            return;
          case "image":
            if (isImage(message.image)) {
              room.images.set(message.image.id, message.image);
              broadcast({ type: "image", image: message.image }, id);
            }
            return;
          case "profile":
            if (
              typeof message.firstName === "string" &&
              typeof message.lastName === "string" &&
              isAvatar(message.avatar)
            ) {
              member.peer = {
                ...member.peer,
                firstName: message.firstName,
                lastName: message.lastName,
                avatar: message.avatar,
              };
              broadcast({ type: "presence", peer: member.peer }, id);
            }
            return;
          // Only where it is, since it moves so often.
          case "pointer":
            if (isPointer(message.pointer)) {
              member.peer = { ...member.peer, pointer: message.pointer };
              broadcast({ type: "pointer", id, pointer: message.pointer }, id);
            }
            return;
          case "activity":
            if ("activity" in message) {
              broadcast(
                { type: "activity", id, activity: message.activity },
                id
              );
            }
            return;
          // Only what it is, like a pointer.
          case "view":
            if (isView(message.view)) {
              member.peer.view = message.view;
              broadcast({ type: "view", id, view: message.view }, id);
            }
            return;
          // Following someone who follows them, even through others, would
          // go round in a circle, so it's turned away.
          case "follow": {
            const { id: target } = message;
            if (target === null) {
              setFollowing(member.peer, null);
              return;
            }
            if (typeof target !== "string" || target === id) {
              return;
            }
            const seen = new Set([id]);
            let next: string | null = target;
            while (next !== null && !seen.has(next)) {
              seen.add(next);
              next = room.members.get(next)?.peer.following ?? null;
            }
            if (room.members.has(target) && next === null) {
              setFollowing(member.peer, target);
            }
            return;
          }
          // Whoever summons stops following anyone, so nobody goes round in
          // a circle.
          case "summon":
            setFollowing(member.peer, null);
            for (const other of room.members.values()) {
              if (other !== member) {
                setFollowing(other.peer, id);
              }
            }
            return;
          case "release": {
            const follower = room.members.get(message.id as string);
            if (follower?.peer.following === id) {
              setFollowing(follower.peer, null);
            }
            return;
          }
          case "timer":
            if (isTimer(message.timer)) {
              room.timer = message.timer && {
                duration: message.timer.duration,
                sound: message.timer.sound,
                by: id,
                endsAt: Date.now() + message.timer.duration,
              };
              broadcast({ type: "timer", timer: shareTimer(room) });
            }
            return;
          case "leave":
            leave();
            return;
        }
      },
      close: leave,
    };
  }
}
