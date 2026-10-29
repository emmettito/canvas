import {
  type Peer,
  type PeerPointer,
  type PeerView,
} from "../../collaboration-server";
import { type Viewport } from "../../models/viewport.model";
import { createElement } from "../../utilities/create-element";
import "./presence.css";

// Shown for someone who hasn't set a name.
const NO_NAME = "Guest";

export interface PresenceOptions {
  getViewport: () => Viewport;
  // Their person in the row was clicked, to follow them, or null to stop.
  onFollow: (id: string | null) => void;
  // Follow me was clicked, to have everyone follow.
  onSummon: () => void;
  // Someone following was let go of.
  onRelease: (id: string) => void;
}

// An arrow, like the pointer's, with its tip at the top left.
const CURSOR_PATH =
  "M1 1 L1 15 L5 11.5 L7.8 17.5 L10.3 16.3 L7.6 10.6 L13 10.4 Z";

function createCursor(): HTMLElement {
  const cursor = createElement("div", "canvas-peer-cursor");
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 16 20");
  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("d", CURSOR_PATH);
  svg.append(path);
  const label = createElement("span", "canvas-peer-label");
  label.append(createElement("span", "canvas-peer-name"));
  cursor.append(svg, label);
  return cursor;
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
  // Who this canvas follows, and its own id, once it's in a room.
  #following: string | null = null;
  #me: string | null = null;

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
   * with id `me`, which follows nobody yet.
   */
  setPeers(peers: Peer[], me: string | null = null): void {
    this.#peers = new Map(peers.map((peer) => [peer.id, peer]));
    this.#me = me;
    this.#following = null;
    this.#showPeople();
    this.refresh();
  }

  /** Shows someone who's joined, or what they've changed, e.g. their name. */
  setPeer(peer: Peer): void {
    const before = this.#peers.get(peer.id);
    this.#peers.set(peer.id, peer);
    if (
      !before ||
      before.name !== peer.name ||
      before.avatar !== peer.avatar ||
      before.color !== peer.color
    ) {
      this.#showPeople();
      // Their cursor's label is made again, with their new name.
      this.#cursors.get(peer.id)?.remove();
      this.#cursors.delete(peer.id);
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
    if (id === this.#me) {
      this.#following = following;
    } else if (peer) {
      this.#peers.set(id, { ...peer, following });
    } else {
      return;
    }
    this.#showPeople();
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

  /** Moves the pointers to where they are on screen, e.g. once the view's changed. */
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
        cursor.querySelector(".canvas-peer-name")!.textContent =
          peer.name || NO_NAME;
      }
      const left = (peer.pointer.x - x) * zoom;
      const top = (peer.pointer.y - y) * zoom;
      cursor.style.transform = `translate(${left}px, ${top}px)`;
    }
  }

  // Each person's photo, or initial, ringed in their color, with what
  // clicking them does on hover: following them, or stopping. The row's
  // hidden while nobody else is here.
  #showPeople(): void {
    const peers = [...this.#peers.values()];
    this.element.hidden = peers.length === 0;
    this.people.replaceChildren(
      ...peers.map(({ id, name, avatar, color }) => {
        const item = createElement("div", "canvas-person-item");
        const shown = name || NO_NAME;
        item.setAttribute("role", "listitem");
        item.setAttribute("aria-label", shown);
        const person = createButton("canvas-person");
        const followed = id === this.#following;
        const action = followed ? `Stop following ${shown}` : `Follow ${shown}`;
        person.setAttribute("aria-label", action);
        person.setAttribute("aria-pressed", String(followed));
        person.style.setProperty("--canvas-peer-color", color);
        person.addEventListener("click", () =>
          this.#options.onFollow(followed ? null : id)
        );
        const initial = createElement("span", "canvas-person-initial");
        initial.textContent = [...shown][0].toUpperCase();
        initial.setAttribute("aria-hidden", "true");
        person.dataset.tooltip = action;
        person.append(initial);
        if (avatar) {
          initial.after(createAvatar(avatar, "canvas-person-avatar"));
        }
        item.append(person);
        return item;
      })
    );
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
        createPill(followed, `Following ${followed.name || NO_NAME}`, stop)
      );
    }
    for (const peer of this.#peers.values()) {
      if (this.#me === null || peer.following !== this.#me) {
        continue;
      }
      const name = peer.name || NO_NAME;
      const release = createButton("canvas-follow-action");
      release.textContent = "Release";
      release.setAttribute("aria-label", `Release ${name}`);
      release.addEventListener("click", () => this.#options.onRelease(peer.id));
      pills.push(createPill(peer, `${name} is following you`, release));
    }
    this.followBar.replaceChildren(...pills);
  }
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
