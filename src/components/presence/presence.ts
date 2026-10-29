import { type Peer, type PeerPointer } from "../../collaboration-server";
import { type Viewport } from "../../models/viewport.model";
import { createElement } from "../../utilities/create-element";
import "./presence.css";

// Shown for someone who hasn't set a name.
const NO_NAME = "Guest";

export interface PresenceOptions {
  getViewport: () => Viewport;
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
 * their color with their name and photo, where it is on the drawing, and a
 * row of their photos, or initials without one, for the corner of the canvas.
 */
export class Presence {
  // Over the drawing, under the toolbars.
  readonly cursors = createElement("div", "canvas-peer-cursors");
  readonly people = createElement("div", "canvas-people");
  #getViewport: () => Viewport;
  #peers = new Map<string, Peer>();
  #cursors = new Map<string, HTMLElement>();

  constructor({ getViewport }: PresenceOptions) {
    this.#getViewport = getViewport;
    this.cursors.setAttribute("aria-hidden", "true");
    this.people.setAttribute("role", "list");
    this.people.setAttribute("aria-label", "People here");
    this.people.hidden = true;
  }

  /** Shows everyone in `peers`, instead of whoever was shown. */
  setPeers(peers: Peer[]): void {
    this.#peers = new Map(peers.map((peer) => [peer.id, peer]));
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
      // Their cursor's label is made again, with their new name and photo.
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

  getPeer(id: string): Peer | undefined {
    return this.#peers.get(id);
  }

  removePeer(id: string): void {
    if (this.#peers.delete(id)) {
      this.#showPeople();
      this.refresh();
    }
  }

  /** Moves the pointers to where they are on screen, e.g. once the view's changed. */
  refresh(): void {
    const { x, y, zoom } = this.#getViewport();
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
        if (peer.avatar) {
          cursor
            .querySelector(".canvas-peer-label")!
            .prepend(createAvatar(peer.avatar, "canvas-peer-avatar"));
        }
      }
      const left = (peer.pointer.x - x) * zoom;
      const top = (peer.pointer.y - y) * zoom;
      cursor.style.transform = `translate(${left}px, ${top}px)`;
    }
  }

  // Each person's photo, or initial, ringed in their color, with their name
  // on hover. The row's hidden while nobody else is here.
  #showPeople(): void {
    const peers = [...this.#peers.values()];
    this.people.hidden = peers.length === 0;
    this.people.replaceChildren(
      ...peers.map(({ name, avatar, color }) => {
        const person = createElement("div", "canvas-person");
        const shown = name || NO_NAME;
        person.setAttribute("role", "listitem");
        person.setAttribute("aria-label", shown);
        person.style.setProperty("--canvas-peer-color", color);
        const initial = createElement("span", "canvas-person-initial");
        initial.textContent = [...shown][0].toUpperCase();
        initial.setAttribute("aria-hidden", "true");
        const tooltip = createElement("span", "canvas-tooltip");
        tooltip.textContent = shown;
        tooltip.setAttribute("aria-hidden", "true");
        person.append(initial, tooltip);
        if (avatar) {
          initial.after(createAvatar(avatar, "canvas-person-avatar"));
        }
        return person;
      })
    );
  }
}
