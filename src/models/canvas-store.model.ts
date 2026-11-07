import { type CanvasEntry } from "./canvas-entry.model";

/**
 * A canvas as it's kept: its name, when it was last changed, what's drawn on
 * it and which part was shown. The drawing and view are JSON, which a store
 * keeps as it is, e.g. with `JSON.stringify`, and gives back unchanged. The
 * canvas checks them as it opens them, so ones saved by an older version of
 * the library still open.
 */
export interface SavedCanvas {
  id: string;
  /** Empty for an untitled canvas. */
  name: string;
  /** When it was last changed, in milliseconds since 1970. */
  updatedAt: number;
  /** What's drawn. Null for a canvas with nothing saved yet. */
  drawing: unknown;
  /** Which part of the drawing was shown, and how big. */
  viewport: unknown;
}

/**
 * Where the canvas keeps what's drawn, e.g. a server's database, which the
 * page passes to `mountCanvas` as `store`. The canvas loads one canvas at a
 * time, as it's opened, and saves it as it changes, one save at a time.
 * Images' files are kept apart from the drawing, since they're big. Each
 * method rejects if it can't do what it's asked, e.g. offline, which the
 * canvas says at its top right.
 */
export interface CanvasStore {
  /** A canvas, or null if there's none with that id, e.g. a new one. */
  loadCanvas(id: string): Promise<SavedCanvas | null>;
  /** Keeps a canvas, replacing what was kept for it, or adding it. */
  saveCanvas(canvas: SavedCanvas): Promise<void>;
  /** An image's file, or null if there's none. */
  loadImage(canvasId: string, imageId: string): Promise<Blob | null>;
  /** Keeps an image's file, byte for byte, so nothing's lost. */
  saveImage(canvasId: string, imageId: string, file: Blob): Promise<void>;
  /**
   * Every canvas kept, without its drawing, most recently changed first.
   * History needs it.
   */
  listCanvases?(): Promise<CanvasEntry[]>;
  /**
   * Removes a canvas and its images' files. History needs it, as does New
   * canvas without History, which replaces the open one.
   */
  deleteCanvas?(id: string): Promise<void>;
  /**
   * Removes a canvas's images' files that aren't in `keep`, e.g. ones deleted
   * from the drawing, which can't be brought back by undoing once it's opened
   * again. Called as a canvas is opened. Without it, they're kept.
   */
  pruneImages?(canvasId: string, keep: string[]): Promise<void>;
}
