// The database's one object store. Images are kept by [canvas id, image id],
// so a canvas's images can be found together.
const STORE = "images";

// Every image of a canvas: arrays sort after strings, so [id, []] comes after
// every [id, imageId].
function canvasRange(canvasId: string): IDBKeyRange {
  return IDBKeyRange.bound([canvasId], [canvasId, []]);
}

// What's saved for each image: its file's bytes and type. Safari can't save a
// `Blob` in IndexedDB in a private window, but it can save its bytes.
interface StoredImage {
  type: string;
  bytes: ArrayBuffer;
}

function isStoredImage(value: unknown): value is StoredImage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StoredImage).type === "string" &&
    (value as StoredImage).bytes instanceof ArrayBuffer
  );
}

// Resolves once the transaction is written, with false if it couldn't be.
function complete(transaction: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
    transaction.onabort = () => resolve(false);
  });
}

/**
 * Keeps images' files in IndexedDB, under `key`, since local storage is too
 * small for them. They're kept byte for byte as they were given, so nothing
 * is lost. Without a key, they're kept in memory, so they last until the page
 * closes. Files are also kept in memory once added or loaded, so they're
 * there straight away and while storage is unavailable.
 */
export class ImageStore {
  #key: string | null;
  #database: Promise<IDBDatabase | null> | null = null;
  // By image id, with the canvas each is in.
  #cache = new Map<string, { canvasId: string; blob: Blob }>();

  constructor(key?: string) {
    this.#key = key ?? null;
  }

  /** Keeps an image's file. False if it couldn't be saved, e.g. storage is full. */
  async put(canvasId: string, id: string, blob: Blob): Promise<boolean> {
    this.#cache.set(id, { canvasId, blob });
    const database = await this.#open();
    if (!database) {
      return this.#key === null;
    }
    try {
      const stored: StoredImage = {
        type: blob.type,
        bytes: await blob.arrayBuffer(),
      };
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(stored, [canvasId, id]);
      return await complete(transaction);
    } catch {
      return false;
    }
  }

  /** An image's file, or null if it's missing, e.g. storage was cleared. */
  async get(canvasId: string, id: string): Promise<Blob | null> {
    const cached = this.#cache.get(id);
    if (cached) {
      return cached.blob;
    }
    const database = await this.#open();
    if (!database) {
      return null;
    }
    try {
      const request = database
        .transaction(STORE)
        .objectStore(STORE)
        .get([canvasId, id]);
      const stored = await new Promise<unknown>((resolve) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });
      if (!isStoredImage(stored)) {
        return null;
      }
      const blob = new Blob([stored.bytes], { type: stored.type });
      this.#cache.set(id, { canvasId, blob });
      return blob;
    } catch {
      return null;
    }
  }

  /** Removes every image of a canvas, e.g. once it's deleted. */
  deleteCanvas(canvasId: string): Promise<void> {
    return this.#removeFrom(canvasId, () => true);
  }

  /**
   * Removes a canvas's images that aren't in `keep`, e.g. ones deleted from
   * it that can no longer be brought back by undoing.
   */
  prune(canvasId: string, keep: Iterable<string>): Promise<void> {
    const kept = new Set(keep);
    return this.#removeFrom(canvasId, (id) => !kept.has(id));
  }

  async #removeFrom(
    canvasId: string,
    removes: (id: string) => boolean
  ): Promise<void> {
    for (const [id, entry] of this.#cache) {
      if (entry.canvasId === canvasId && removes(id)) {
        this.#cache.delete(id);
      }
    }
    const database = await this.#open();
    if (!database) {
      return;
    }
    try {
      const transaction = database.transaction(STORE, "readwrite");
      const request = transaction
        .objectStore(STORE)
        .openCursor(canvasRange(canvasId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          return;
        }
        const [, id] = cursor.primaryKey as [string, string];
        if (removes(id)) {
          cursor.delete();
        }
        cursor.continue();
      };
      await complete(transaction);
    } catch {
      // Nothing more can be removed while storage is unavailable.
    }
  }

  // Null without a key, or if IndexedDB is unavailable, e.g. in some private
  // windows.
  #open(): Promise<IDBDatabase | null> {
    const key = this.#key;
    if (key === null || typeof indexedDB === "undefined") {
      return Promise.resolve(null);
    }
    this.#database ??= new Promise((resolve) => {
      try {
        const request = indexedDB.open(`${key}:images`, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.#database;
  }
}
