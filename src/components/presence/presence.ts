import {
  type Peer,
  type PeerPointer,
  type PeerView,
} from "../../collaboration-server";
import { type PersonName } from "../../models/person-name.model";
import { type Viewport } from "../../models/viewport.model";
import { createElement } from "../../utilities/create-element";
import { getFullName, getShortNames } from "../../utilities/person-names";
import "./presence.css";

// Shown for someone who hasn't set a name.
const NO_NAME = "Guest";

/** This canvas's own person in a room, as everyone else sees them. */
export type Self = Pick<
  Peer,
  "id" | "firstName" | "lastName" | "avatar" | "color"
>;

export interface PresenceOptions {
  getViewport: () => Viewport;
  // Their person in the row was clicked, to follow them, or null to stop.
  onFollow: (id: string | null) => void;
  // Follow me was clicked, to have everyone follow.
  onSummon: () => void;
  // Someone following was let go of.
  onRelease: (id: string) => void;
}

// How someone's pointer looks, like the cursor of the tool they're pointing
// with: a ring as big as a stroke tool draws or erases, an I-beam for text,
// a crosshair for placing or filling, and the dropper. Anything else, e.g.
// the move tool, is an arrow.
type CursorKind =
  | "arrow"
  | "brush"
  | "eraser"
  | "text"
  | "crosshair"
  | "dropper";

const CURSOR_KINDS: Record<string, CursorKind> = {
  pencil: "brush",
  highlighter: "brush",
  eraser: "eraser",
  text: "text",
  note: "crosshair",
  bucket: "crosshair",
  dropper: "dropper",
};

// Each cursor's shape, with the point it's at, its hotspot, in its own
// units, and how far its name is from that point, on screen. Lines are
// drawn twice, white under their color, so they show on anything.
const CURSOR_GLYPHS: Record<
  Exclude<CursorKind, "brush" | "eraser">,
  {
    size: [number, number];
    viewBox: string;
    hotspot: [number, number];
    label: number;
    path: string;
    lines?: boolean;
  }
> = {
  // Like the pointer's, with its tip at the top left.
  arrow: {
    size: [16, 20],
    viewBox: "0 0 16 20",
    hotspot: [1, 1],
    label: 14,
    path: "M1 1 L1 15 L5 11.5 L7.8 17.5 L10.3 16.3 L7.6 10.6 L13 10.4 Z",
  },
  text: {
    size: [10, 20],
    viewBox: "0 0 10 20",
    hotspot: [5, 10],
    label: 10,
    path: "M2 1.5h6M5 1.5v17M2 18.5h6",
    lines: true,
  },
  // With a gap in the middle, so what's pointed at shows.
  crosshair: {
    size: [21, 21],
    viewBox: "0 0 21 21",
    hotspot: [10.5, 10.5],
    label: 10,
    path: "M10.5 1v7M10.5 13v7M1 10.5h7M13 10.5h7",
    lines: true,
  },
  // Like the canvas's own, picking at its tip, at the bottom left.
  dropper: {
    size: [24, 24],
    viewBox: "-16 -16 288 288",
    hotspot: [4, 19],
    label: 8,
    path: "M224,67.3a35.79,35.79,0,0,0-11.26-25.66c-14-13.28-36.72-12.78-50.62,1.13L138.8,66.2a24,24,0,0,0-33.14.77l-5,5a16,16,0,0,0,0,22.64l2,2.06-51,51a39.75,39.75,0,0,0-10.53,38l-8,18.41A13.68,13.68,0,0,0,36,219.3a15.92,15.92,0,0,0,17.71,3.35L71.23,215a39.89,39.89,0,0,0,37.06-10.75l51-51,2.06,2.06a16,16,0,0,0,22.62,0l5-5a24,24,0,0,0,.74-33.18l23.75-23.87A35.75,35.75,0,0,0,224,67.3ZM97,193a24,24,0,0,1-24,6,8,8,0,0,0-5.55.31l-18.1,7.91L57,189.41a8,8,0,0,0,.25-5.75A23.88,23.88,0,0,1,63,159l51-51,33.94,34Z",
  },
};

// The smallest a stroke tool's ring is, on screen, so it shows however
// small the tool, or far out the zoom.
const MIN_RING_SIZE = 8;
// How far a ring's name is from its edge, on screen.
const RING_LABEL_GAP = 4;

function createCursor(): HTMLElement {
  const cursor = createElement("div", "canvas-peer-cursor");
  const label = createElement("span", "canvas-peer-label");
  label.append(createElement("span", "canvas-peer-name"));
  cursor.append(createElement("div", "canvas-peer-glyph"), label);
  return cursor;
}

// What `cursor` shows for `kind`, at its hotspot.
function showCursorKind(cursor: HTMLElement, kind: CursorKind): void {
  cursor.dataset.kind = kind;
  let glyph: Element;
  if (kind === "brush" || kind === "eraser") {
    glyph = createElement("div", "canvas-peer-glyph canvas-peer-ring");
  } else {
    const { size, viewBox, hotspot, label, path, lines } = CURSOR_GLYPHS[kind];
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.classList.add("canvas-peer-glyph");
    if (lines) {
      svg.classList.add("canvas-peer-lines");
    }
    svg.setAttribute("width", String(size[0]));
    svg.setAttribute("height", String(size[1]));
    svg.setAttribute("viewBox", viewBox);
    svg.style.left = `${-hotspot[0]}px`;
    svg.style.top = `${-hotspot[1]}px`;
    // A line's white edge is a wider copy of it, underneath.
    for (const className of lines ? ["canvas-peer-halo", ""] : [""]) {
      const shape = document.createElementNS(svgNs, "path");
      shape.setAttribute("d", path);
      if (className) {
        shape.classList.add(className);
      }
      svg.append(shape);
    }
    glyph = svg;
    cursor.style.setProperty("--canvas-peer-label-offset", `${label}px`);
  }
  cursor.querySelector(".canvas-peer-glyph")!.replaceWith(glyph);
}

// Their photo, if they've set one. One that doesn't load shows nothing, so
// what's behind it shows instead, e.g. their initial.
// Buttons default to submitting a form, e.g. if the host mounts the canvas in one.
function createButton(className: string): HTMLButtonElement {
  const button = createElement("button", className);
  button.type = "button";
  return button;
}

function createAvatar(url: string, className: string): HTMLImageElement {
  const image = createElement("img", className);
  image.alt = "";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => image.remove());
  image.src = url;
  return image;
}

/**
 * Who else is drawing together on this canvas: each person's pointer, in
 * their color with their name, where it is on the drawing, and a row of their
 * photos, or initials without one, for the corner of the canvas. Clicking
 * someone follows them, and a bar says who's being followed, with a way to
 * stop, and who's following, with a way to let them go.
 */
export class Presence {
  // The row of people, and Follow me, as a group for the top right toolbar,
  // whose tooltips show their names.
  readonly element = createElement(
    "div",
    "canvas-toolbar-group canvas-presence"
  );
  // Over the drawing, under the toolbars. While following someone, it's
  // edged in their color.
  readonly cursors = createElement("div", "canvas-peer-cursors");
  readonly people = createElement("div", "canvas-people");
  // Who's being followed, and who's following, for the top of the canvas.
  readonly followBar = createElement("div", "canvas-follow-bar");
  #summon = createButton("canvas-toolbar-button canvas-toolbar-text-button");
  #options: PresenceOptions;
  #peers = new Map<string, Peer>();
  #cursors = new Map<string, HTMLElement>();
  // Who this canvas follows, and its own person, once it's in a room.
  #following: string | null = null;
  #self: Self | null = null;
  // How everyone's shown by their pointer, and as who's following who, as
  // briefly as tells them apart, e.g. "Ada", or "Ada L." with another Ada.
  #shortName: (name: PersonName) => string = getShortNames([]);

  constructor(options: PresenceOptions) {
    this.#options = options;
    this.cursors.setAttribute("aria-hidden", "true");
    this.people.setAttribute("role", "list");
    this.people.setAttribute("aria-label", "People here");
    this.#summon.textContent = "Follow me";
    this.#summon.dataset.tooltip = "Have everyone follow you";
    this.#summon.addEventListener("click", () => options.onSummon());
    this.element.append(this.people, this.#summon);
    this.element.hidden = true;
    // Read out as it changes, like a status, but apart from the canvas's.
    this.followBar.setAttribute("role", "group");
    this.followBar.setAttribute("aria-label", "Following");
    this.followBar.setAttribute("aria-live", "polite");
  }

  /** Who this canvas follows, by their id, or null. */
  get following(): string | null {
    return this.#following;
  }

  /**
   * Shows everyone in `peers`, instead of whoever was shown, to the canvas
   * that's `self`, which follows nobody yet. It's shown with them, in its
   * color, so it can tell others which it is.
   */
  setPeers(peers: Peer[], self: Self | null = null): void {
    this.#peers = new Map(peers.map((peer) => [peer.id, peer]));
    this.#self = self;
    this.#following = null;
    this.#showPeople();
    this.refresh();
  }

  /** Shows this canvas's own new name or photo. */
  setProfile({ firstName, lastName }: PersonName, avatar: string): void {
    if (this.#self) {
      this.#self = { ...this.#self, firstName, lastName, avatar };
      this.#showPeople();
      this.refresh();
    }
  }

  /** Shows someone who's joined, or what they've changed, e.g. their name. */
  setPeer(peer: Peer): void {
    const before = this.#peers.get(peer.id);
    this.#peers.set(peer.id, peer);
    if (
      !before ||
      before.firstName !== peer.firstName ||
      before.lastName !== peer.lastName ||
      before.avatar !== peer.avatar ||
      before.color !== peer.color
    ) {
      this.#showPeople();
      this.#cursors
        .get(peer.id)
        ?.style.setProperty("--canvas-peer-color", peer.color);
    }
    this.refresh();
  }

  /** Moves someone's pointer, or hides it once it's null. */
  setPointer(id: string, pointer: PeerPointer | null): void {
    const peer = this.#peers.get(id);
    if (peer) {
      this.#peers.set(id, { ...peer, pointer });
      this.refresh();
    }
  }

  /** Keeps what someone's canvas shows, to show it once they're followed. */
  setView(id: string, view: PeerView): void {
    const peer = this.#peers.get(id);
    if (peer) {
      this.#peers.set(id, { ...peer, view });
    }
  }

  /** Who `id` follows, which may be this canvas, or this canvas itself. */
  setFollowing(id: string, following: string | null): void {
    const peer = this.#peers.get(id);
    if (id === this.#self?.id) {
      this.#following = following;
    } else if (peer) {
      this.#peers.set(id, { ...peer, following });
    } else {
      return;
    }
    this.#showPeople();
  }

  /** How `id` is shown, as briefly as tells them apart from everyone here. */
  getPeerName(id: string): string | undefined {
    const peer = this.#peers.get(id);
    return peer && this.#getShortName(peer);
  }

  getPeer(id: string): Peer | undefined {
    return this.#peers.get(id);
  }

  removePeer(id: string): void {
    if (this.#peers.delete(id)) {
      if (this.#following === id) {
        this.#following = null;
      }
      this.#showPeople();
      this.refresh();
    }
  }

  /**
   * Moves the pointers to where they are on screen, and sizes them, e.g.
   * once the view's changed, each looking like the tool it's pointing with.
   */
  refresh(): void {
    const { x, y, zoom } = this.#options.getViewport();
    for (const [id, cursor] of this.#cursors) {
      if (!this.#peers.get(id)?.pointer) {
        cursor.remove();
        this.#cursors.delete(id);
      }
    }
    for (const peer of this.#peers.values()) {
      if (!peer.pointer) {
        continue;
      }
      let cursor = this.#cursors.get(peer.id);
      if (!cursor) {
        cursor = createCursor();
        this.#cursors.set(peer.id, cursor);
        this.cursors.append(cursor);
        cursor.style.setProperty("--canvas-peer-color", peer.color);
      }
      const name = cursor.querySelector(".canvas-peer-name")!;
      const shown = this.#getShortName(peer);
      if (name.textContent !== shown) {
        name.textContent = shown;
      }
      const { tool, size = 0 } = peer.pointer;
      const kind = (tool !== undefined && CURSOR_KINDS[tool]) || "arrow";
      if (cursor.dataset.kind !== kind) {
        showCursorKind(cursor, kind);
      }
      // As big as what it draws or erases, which is in drawing units, so it
      // grows and shrinks with the zoom.
      if (kind === "brush" || kind === "eraser") {
        const ring = Math.max(MIN_RING_SIZE, size * 2 * zoom);
        cursor.style.setProperty("--canvas-peer-ring", `${ring}px`);
        // Off the ring's bottom right, the way the arrow's is off its tip.
        cursor.style.setProperty(
          "--canvas-peer-label-offset",
          `${(ring / 2) * Math.SQRT1_2 + RING_LABEL_GAP}px`
        );
      }
      const left = (peer.pointer.x - x) * zoom;
      const top = (peer.pointer.y - y) * zoom;
      cursor.style.transform = `translate(${left}px, ${top}px)`;
    }
  }

  // How `name` is shown briefly, among everyone here.
  #getShortName(name: PersonName): string {
    return this.#shortName(name) || NO_NAME;
  }

  // Each person's photo, or initial, ringed in their color, with what
  // clicking them does on hover: following them, or stopping. This canvas's
  // own is last, beside Follow me. The row's hidden while nobody else is here.
  // Their whole names are shown here, so it's clear who each is.
  #showPeople(): void {
    const peers = [...this.#peers.values()];
    this.#shortName = getShortNames(
      this.#self ? [...peers, this.#self] : peers
    );
    this.element.hidden = peers.length === 0;
    const items = peers.map((peer) => {
      const { id, avatar, color } = peer;
      const shown = getFullName(peer) || NO_NAME;
      const followed = id === this.#following;
      const action = followed ? `Stop following ${shown}` : `Follow ${shown}`;
      const person = createButton("canvas-person");
      person.setAttribute("aria-label", action);
      person.setAttribute("aria-pressed", String(followed));
      person.dataset.tooltip = action;
      person.addEventListener("click", () =>
        this.#options.onFollow(followed ? null : id)
      );
      return createPersonItem(person, shown, avatar, color);
    });
    if (this.#self) {
      const { avatar, color } = this.#self;
      const name = getFullName(this.#self);
      // Not a button, since there's nothing to do with it.
      const person = createElement("span", "canvas-person canvas-person-self");
      person.dataset.tooltip = name ? `You (${name})` : "You";
      items.push(
        createPersonItem(person, name || NO_NAME, avatar, color, "You")
      );
    }
    this.people.replaceChildren(...items);
    this.#showFollowing();
  }

  // Whoever's followed, edging the canvas in their color, with a way to stop,
  // and each person following, with a way to let them go.
  #showFollowing(): void {
    const followed = this.#following && this.#peers.get(this.#following);
    this.cursors.toggleAttribute("data-following", Boolean(followed));
    const pills: HTMLElement[] = [];
    if (followed) {
      this.cursors.style.setProperty("--canvas-follow-color", followed.color);
      const stop = createButton("canvas-follow-action");
      stop.textContent = "Stop";
      stop.addEventListener("click", () => this.#options.onFollow(null));
      pills.push(
        createPill(followed, `Following ${this.#getShortName(followed)}`, stop)
      );
    }
    for (const peer of this.#peers.values()) {
      if (this.#self === null || peer.following !== this.#self.id) {
        continue;
      }
      const name = this.#getShortName(peer);
      const release = createButton("canvas-follow-action");
      release.textContent = "Release";
      release.setAttribute("aria-label", `Release ${name}`);
      release.addEventListener("click", () => this.#options.onRelease(peer.id));
      pills.push(createPill(peer, `${name} is following you`, release));
    }
    this.followBar.replaceChildren(...pills);
  }
}

// `person` in the row, showing `name`'s initial, or their photo, on their
// color, read out as `label`.
function createPersonItem(
  person: HTMLElement,
  name: string,
  avatar: string,
  color: string,
  label = name
): HTMLElement {
  const item = createElement("div", "canvas-person-item");
  item.setAttribute("role", "listitem");
  item.setAttribute("aria-label", label);
  person.style.setProperty("--canvas-peer-color", color);
  const initial = createElement("span", "canvas-person-initial");
  initial.textContent = [...name][0].toUpperCase();
  initial.setAttribute("aria-hidden", "true");
  person.append(initial);
  if (avatar) {
    initial.after(createAvatar(avatar, "canvas-person-avatar"));
  }
  item.append(person);
  return item;
}

// A line in the follow bar, in `peer`'s color, saying `text`, with `action`.
function createPill(
  { color }: Peer,
  text: string,
  action: HTMLButtonElement
): HTMLElement {
  const pill = createElement("div", "canvas-follow-pill");
  pill.style.setProperty("--canvas-peer-color", color);
  const label = createElement("span", "canvas-follow-text");
  label.textContent = text;
  pill.append(label, action);
  return pill;
}
