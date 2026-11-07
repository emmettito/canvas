/*
 * The demo page's store, which keeps canvases in the browser, the way a page
 * could with the canvas's `store` option: each part of each drawing in local
 * storage, under keys starting with the page's own, and images' files in
 * IndexedDB, since they're too big for local storage. It's the layout the
 * canvas itself used to save in, so canvases drawn before still open.
 */
import {
  type CanvasEntry,
  type CanvasStore,
  type SavedCanvas,
} from "@emmettito/canvas";
import { type MountCanvasOptions } from "../canvas";
import { ImageStore } from "./image-store";

// Each canvas's parts, each under a key of its own, so a change only saves
// the parts it changed.
const PARTS = [
  "strokes",
  "fills",
  "erasers",
  "background",
  "viewport",
  "order",
  "images",
  "texts",
  "notes",
] as const;

type Part = (typeof PARTS)[number];

// What canvases saved before they had their own background were drawn on.
const LEGACY_BACKGROUND = "#ffffff";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function read(key: string): unknown {
  try {
    const value = localStorage.getItem(key);
    return value === null ? null : JSON.parse(value);
  } catch {
    // Storage can be unavailable, e.g. in some private windows, or the value
    // isn't JSON.
    return null;
  }
}

// False if it couldn't be written, e.g. because storage is full.
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`The canvas couldn't be saved to ${key}.`, error);
    return false;
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing was saved there, since storage is unavailable.
  }
}

/**
 * Keeps canvases in local storage and IndexedDB, under keys starting with
 * `key`, which each canvas on a site needs its own of.
 */
export class LocalStore implements Required<CanvasStore> {
  #key: string;
  #images: ImageStore;
  // Each part as it was last written, by canvas id, so only changed parts
  // are written again.
  #written = new Map<string, Partial<Record<Part, unknown>>>();

  constructor(key: string) {
    this.#key = key;
    this.#images = new ImageStore(key);
  }

  async loadCanvas(id: string): Promise<SavedCanvas | null> {
    const entry = this.#entries().find((each) => each.id === id);
    if (!entry) {
      return null;
    }
    const parts = Object.fromEntries(
      PARTS.map((part) => [part, read(this.#partKey(id, part))])
    ) as Record<Part, unknown>;
    const { viewport, ...drawing } = parts;
    return {
      ...entry,
      drawing: {
        ...drawing,
        background: drawing.background ?? LEGACY_BACKGROUND,
      },
      viewport,
    };
  }

  async saveCanvas({
    id,
    name,
    updatedAt,
    drawing,
    viewport,
  }: SavedCanvas): Promise<void> {
    let saved = true;
    const written = this.#written.get(id) ?? {};
    const parts: Record<string, unknown> = {
      ...(isObject(drawing) ? drawing : {}),
      viewport,
    };
    for (const part of PARTS) {
      if (parts[part] === undefined || parts[part] === written[part]) {
        continue;
      }
      if (write(this.#partKey(id, part), parts[part])) {
        written[part] = parts[part];
      } else {
        saved = false;
      }
    }
    this.#written.set(id, written);
    const entries = [
      { id, name, updatedAt },
      ...this.#entries().filter((each) => each.id !== id),
    ].sort((a, b) => b.updatedAt - a.updatedAt);
    saved = write(`${this.#key}:canvases`, entries) && saved;
    if (!saved) {
      throw new Error("The canvas couldn't be saved.");
    }
  }

  async loadImage(canvasId: string, imageId: string): Promise<Blob | null> {
    return this.#images.get(canvasId, imageId);
  }

  async saveImage(canvasId: string, imageId: string, file: Blob) {
    if (!(await this.#images.put(canvasId, imageId, file))) {
      throw new Error("The image couldn't be saved.");
    }
  }

  async listCanvases(): Promise<CanvasEntry[]> {
    return this.#entries();
  }

  async deleteCanvas(id: string): Promise<void> {
    for (const part of PARTS) {
      remove(this.#partKey(id, part));
    }
    this.#written.delete(id);
    write(
      `${this.#key}:canvases`,
      this.#entries().filter((each) => each.id !== id)
    );
    await this.#images.deleteCanvas(id);
  }

  pruneImages(canvasId: string, keep: string[]): Promise<void> {
    return this.#images.prune(canvasId, keep);
  }

  /** The tool settings and export options, as the canvas last gave them. */
  loadSettings(): unknown {
    const settings = read(`${this.#key}:settings`);
    return isObject(settings)
      ? { ...settings, export: read(`${this.#key}:export`) }
      : { export: read(`${this.#key}:export`) };
  }

  saveSettings(settings: unknown) {
    if (!isObject(settings)) {
      return;
    }
    const { export: exportOptions, ...tools } = settings;
    write(`${this.#key}:settings`, tools);
    write(`${this.#key}:export`, exportOptions);
  }

  /** The canvas that was open, or undefined for a new one. */
  loadOpenCanvas(): string | undefined {
    const id = read(`${this.#key}:open`);
    return typeof id === "string" ? id : undefined;
  }

  saveOpenCanvas(id: string) {
    write(`${this.#key}:open`, id);
  }

  // The canvases kept, most recently changed first. The canvas checks them.
  #entries(): CanvasEntry[] {
    const entries = read(`${this.#key}:canvases`);
    return Array.isArray(entries)
      ? entries.filter(
          (each): each is CanvasEntry =>
            isObject(each) && typeof each.id === "string"
        )
      : [];
  }

  #partKey(id: string, part: Part): string {
    return `${this.#key}:canvas:${id}:${part}`;
  }
}

/**
 * The `mountCanvas` options that keep its canvases and settings in the
 * browser, under `key`, and reopen the last canvas open.
 */
export function savedLocally(
  key: string
): Pick<
  MountCanvasOptions,
  "store" | "canvasId" | "onOpenCanvas" | "settings" | "onSettingsChange"
> {
  const store = new LocalStore(key);
  return {
    store,
    canvasId: store.loadOpenCanvas(),
    onOpenCanvas: (id) => store.saveOpenCanvas(id),
    settings: store.loadSettings(),
    onSettingsChange: (settings) => store.saveSettings(settings),
  };
}
