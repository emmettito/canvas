import { type CanvasEntry } from "../models/canvas-entry.model";
import {
  type CanvasStore,
  type SavedCanvas,
} from "../models/canvas-store.model";

/**
 * Keeps canvases in memory, for a canvas mounted without a store, so they
 * last until the page closes.
 */
export function createMemoryStore(): Required<CanvasStore> {
  const canvases = new Map<string, SavedCanvas>();
  // By canvas id, then image id.
  const images = new Map<string, Map<string, Blob>>();
  return {
    loadCanvas: async (id) => canvases.get(id) ?? null,
    saveCanvas: async (canvas) => {
      canvases.set(canvas.id, canvas);
    },
    loadImage: async (canvasId, imageId) =>
      images.get(canvasId)?.get(imageId) ?? null,
    saveImage: async (canvasId, imageId, file) => {
      const files = images.get(canvasId) ?? new Map<string, Blob>();
      files.set(imageId, file);
      images.set(canvasId, files);
    },
    listCanvases: async () =>
      [...canvases.values()]
        .map(({ id, name, updatedAt }): CanvasEntry => ({
          id,
          name,
          updatedAt,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    deleteCanvas: async (id) => {
      canvases.delete(id);
      images.delete(id);
    },
    pruneImages: async (canvasId, keep) => {
      const kept = new Set(keep);
      for (const imageId of images.get(canvasId)?.keys() ?? []) {
        if (!kept.has(imageId)) {
          images.get(canvasId)!.delete(imageId);
        }
      }
    },
  };
}
